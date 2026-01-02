from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterator

import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.deps import auth as auth_deps
from app.main import app
from app.models.diagnostic import (
    Diagnostic,
    DiagnosticVersion,
    Option,
    Question,
    VersionOption,
    VersionOutcome,
    VersionQuestion,
)
from tests.factories import AdminUserFactory, set_factory_session
from tests.utils.db import DEFAULT_TABLES, truncate_tables


def _database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be configured for tests"
    return url


@pytest.fixture
def db_session(prepare_db) -> Iterator[Session]:
    engine = create_engine(_database_url(), future=True)
    truncate_tables(engine, DEFAULT_TABLES)
    connection = engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=connection,
        future=True,
    )
    session = TestingSessionLocal()
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):  # pragma: no cover - SQLAlchemy internals
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()

    set_factory_session(session)

    try:
        yield session
    finally:
        session.rollback()
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()
        set_factory_session(None)


@pytest.fixture
def client(db_session: Session) -> Iterator[TestClient]:
    def override_get_db() -> Iterator[Session]:
        try:
            yield db_session
        finally:  # pragma: no cover - dependency teardown
            pass

    app.dependency_overrides[auth_deps.get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(auth_deps.get_db, None)


def _create_version(
    db: Session,
    *,
    diagnostic: Diagnostic,
    admin_id: int,
    src_hash: str | None,
    name: str = "v1",
) -> DiagnosticVersion:
    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name=name,
        description="",
        system_prompt=None,
        note=None,
        src_hash=src_hash,
        created_by_admin_id=admin_id,
        updated_by_admin_id=admin_id,
        finalized_by_admin_id=admin_id if src_hash else None,
        finalized_at=datetime.now(timezone.utc) if src_hash else None,
    )
    db.add(version)
    db.flush()
    return version


def _create_question(
    db: Session,
    *,
    diagnostic_id: int,
    code: str,
    text: str,
    multi: bool,
    sort_order: int,
) -> Question:
    question = Question(
        diagnostic_id=diagnostic_id,
        q_code=code,
        display_text=text,
        multi=multi,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(question)
    db.flush()
    return question


def _create_option(
    db: Session,
    *,
    question: Question,
    code: str,
    label: str,
    sort_order: int,
    llm_op: dict[str, str] | None = None,
) -> Option:
    option = Option(
        question_id=question.id,
        opt_code=code,
        display_label=label,
        sort_order=sort_order,
        llm_op=llm_op,
        is_active=True,
    )
    db.add(option)
    db.flush()
    return option


def test_get_form_returns_payload(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = Diagnostic(
        code="ai-career",
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db_session.add(diagnostic)
    db_session.flush()

    version = _create_version(db_session, diagnostic=diagnostic, admin_id=admin.id, src_hash="hash123")

    q1 = _create_question(
        db_session,
        diagnostic_id=diagnostic.id,
        code="Q001",
        text="現在の職種を教えてください",
        multi=False,
        sort_order=10,
    )
    q2 = _create_question(
        db_session,
        diagnostic_id=diagnostic.id,
        code="Q002",
        text="興味のある領域を選んでください",
        multi=True,
        sort_order=20,
    )

    vq1 = VersionQuestion(
        version_id=version.id,
        diagnostic_id=diagnostic.id,
        question_id=q1.id,
        q_code=q1.q_code,
        display_text=q1.display_text,
        multi=q1.multi,
        sort_order=10,
        is_active=True,
        created_by_admin_id=admin.id,
    )
    vq2 = VersionQuestion(
        version_id=version.id,
        diagnostic_id=diagnostic.id,
        question_id=q2.id,
        q_code=q2.q_code,
        display_text=q2.display_text,
        multi=q2.multi,
        sort_order=20,
        is_active=False,
        created_by_admin_id=admin.id,
    )
    db_session.add_all([vq1, vq2])
    db_session.flush()

    opt1 = _create_option(
        db_session,
        question=q1,
        code="engineer",
        label="エンジニア",
        sort_order=5,
        llm_op={"score": "high"},
    )
    vo = VersionOption(
        version_id=version.id,
        version_question_id=vq1.id,
        option_id=opt1.id,
        q_code=q1.q_code,
        opt_code=opt1.opt_code,
        display_label=opt1.display_label,
        llm_op=opt1.llm_op,
        sort_order=5,
        is_active=True,
        created_by_admin_id=admin.id,
    )
    db_session.add(vo)

    db_session.add(
        VersionOutcome(
            version_id=version.id,
            outcome_id=101,
            outcome_meta_json={"name": "AI Strategist"},
            sort_order=15,
            is_active=True,
            created_by_admin_id=admin.id,
        )
    )

    db_session.flush()

    response = client.get(f"/diagnostics/versions/{version.id}/form")
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["version_id"] == version.id
    assert [q["q_code"] for q in payload["questions"]] == ["Q001", "Q002"]

    q1_key = str(vq1.id)
    assert q1_key in payload["options"]
    assert payload["options"][q1_key][0]["version_option_id"]
    assert payload["options"][q1_key][0]["llm_op"] == {"score": "high"}

    assert payload["options"].get(str(vq2.id)) == []

    option_id_str = str(vo.id)
    assert payload["option_lookup"][option_id_str] == {"q_code": "Q001", "opt_code": "engineer"}

    assert payload["outcomes"] == [
        {"outcome_id": 101, "sort_order": 15, "meta": {"name": "AI Strategist"}}
    ]

    assert response.headers["ETag"] == '"hash123"'
    assert response.headers["Cache-Control"] == "public, max-age=86400, stale-while-revalidate=86400"


def test_get_form_returns_304_when_etag_matches(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = Diagnostic(
        code="ai-career",
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db_session.add(diagnostic)
    db_session.flush()

    version = _create_version(db_session, diagnostic=diagnostic, admin_id=admin.id, src_hash="etag-1")

    response_initial = client.get(f"/diagnostics/versions/{version.id}/form")
    assert response_initial.status_code == 200
    etag = response_initial.headers["ETag"]

    response = client.get(
        f"/diagnostics/versions/{version.id}/form",
        headers={"If-None-Match": etag},
    )
    assert response.status_code == 304
    assert response.content == b""
    assert response.headers["ETag"] == etag
    assert response.headers["Cache-Control"] == "public, max-age=86400, stale-while-revalidate=86400"


def test_get_form_returns_404_for_draft_version(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = Diagnostic(
        code="ai-career",
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db_session.add(diagnostic)
    db_session.flush()

    version = _create_version(db_session, diagnostic=diagnostic, admin_id=admin.id, src_hash=None)

    response = client.get(f"/diagnostics/versions/{version.id}/form")
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.value


def test_get_form_returns_404_when_version_missing(client: TestClient) -> None:
    response = client.get("/diagnostics/versions/999999/form")
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value


def test_get_form_handles_empty_collections(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    diagnostic = Diagnostic(
        code="ai-career",
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db_session.add(diagnostic)
    db_session.flush()

    version = _create_version(db_session, diagnostic=diagnostic, admin_id=admin.id, src_hash="hash-empty")
    db_session.flush()

    response = client.get(f"/diagnostics/versions/{version.id}/form")
    assert response.status_code == 200
    payload = response.json()

    assert payload["questions"] == []
    assert payload["options"] == {}
    assert payload["option_lookup"] == {}
    assert payload["outcomes"] == []
