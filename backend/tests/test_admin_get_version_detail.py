from __future__ import annotations

import os
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from app.models.diagnostic import (
    DiagnosticVersionAuditLog,
    Option,
    Question,
    VersionOption,
    VersionOutcome,
    VersionQuestion,
)
from tests.factories import (
    AdminUserFactory,
    DiagnosticFactory,
    DiagnosticVersionFactory,
    set_factory_session,
)


def _get_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set for tests"
    return url


@pytest.fixture
def db_session(prepare_db) -> Iterator[Session]:
    engine = create_engine(_get_database_url(), future=True)
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
    def restart_savepoint(sess, trans):  # pragma: no cover - fixture wiring
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
        finally:
            pass

    app.dependency_overrides[admin_deps.get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(admin_deps.get_db, None)


def _auth_header(admin_id: int, *, user_id: str | None = None) -> dict[str, str]:
    token = create_access_token(
        str(admin_id),
        extra={"role": "admin", "user_id": user_id or f"admin{admin_id:03d}"},
        expires_delta_minutes=15,
    )
    return {"Authorization": f"Bearer {token}"}


def _make_question(
    db: Session,
    *,
    diagnostic_id: int,
    code: str,
    text: str,
    sort_order: int,
) -> Question:
    question = Question(
        diagnostic_id=diagnostic_id,
        q_code=code,
        display_text=text,
        multi=False,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(question)
    db.flush()
    return question


def _make_option(
    db: Session,
    *,
    question: Question,
    code: str,
    label: str,
    sort_order: int,
) -> Option:
    option = Option(
        question_id=question.id,
        opt_code=code,
        display_label=label,
        sort_order=sort_order,
        is_active=True,
    )
    db.add(option)
    db.flush()
    return option


def test_get_version_detail_returns_draft_payload(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True, user_id=f"admin-{uuid.uuid4().hex}")
    diagnostic = DiagnosticFactory(code="career", outcome_table_name="mst_ai_jobs")
    long_prompt = "Prompt " + ("x" * 210)
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="v2024-alpha",
        description="alpha draft",
        note="initial draft",
        system_prompt=long_prompt,
        src_hash=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    question = _make_question(
        db_session,
        diagnostic_id=diagnostic.id,
        code="Q001",
        text="What is your current role?",
        sort_order=1,
    )
    option = _make_option(
        db_session,
        question=question,
        code="A",
        label="Engineer",
        sort_order=1,
    )

    version_question = VersionQuestion(
        version_id=version.id,
        diagnostic_id=diagnostic.id,
        question_id=question.id,
        q_code=question.q_code,
        display_text=question.display_text,
        multi=question.multi,
        sort_order=1,
        is_active=True,
        created_by_admin_id=admin.id,
    )
    db_session.add(version_question)
    db_session.flush()
    db_session.add(
        VersionOption(
            version_id=version.id,
            version_question_id=version_question.id,
            option_id=option.id,
            q_code=question.q_code,
            opt_code=option.opt_code,
            display_label=option.display_label,
            llm_op=None,
            sort_order=1,
            is_active=True,
            created_by_admin_id=admin.id,
        )
    )
    db_session.add(
        VersionOutcome(
            version_id=version.id,
            outcome_id=101,
            outcome_meta_json={"title": "AI Strategist"},
            sort_order=1,
            is_active=True,
            created_by_admin_id=admin.id,
        )
    )
    db_session.add(
        DiagnosticVersionAuditLog(
            version_id=version.id,
            admin_user_id=admin.id,
            action="IMPORT",
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(f"/admin/diagnostics/versions/{version.id}", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["id"] == version.id
    assert payload["diagnostic_id"] == diagnostic.id
    assert payload["name"] == "v2024-alpha"
    assert payload["description"] == "alpha draft"
    assert payload["note"] == "initial draft"
    assert payload["status"] == "draft"
    assert payload["system_prompt_preview"] == long_prompt[:200] + "..."
    assert payload["src_hash"] is None
    assert payload["created_by_admin_id"] == admin.id
    assert payload["updated_by_admin_id"] == admin.id
    assert payload["summary"] == {"questions": 1, "options": 1, "outcomes": 1}
    audit = payload["audit"]
    assert audit["last_imported_by_admin_id"] == admin.id
    assert audit["last_imported_at"] is not None
    assert audit["finalized_at"] is None
    assert audit["finalized_by_admin_id"] is None


def test_get_version_detail_returns_finalized_audit(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True, user_id=f"admin-{uuid.uuid4().hex}")
    diagnostic = DiagnosticFactory(code="ai-career", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="v2024-release",
        description="released version",
        note=None,
        system_prompt="Short prompt",
        src_hash="hash",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    db_session.add(
        DiagnosticVersionAuditLog(
            version_id=version.id,
            admin_user_id=admin.id,
            action="FINALIZE",
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(f"/admin/diagnostics/versions/{version.id}", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["status"] == "finalized"
    assert payload["system_prompt_preview"] == "Short prompt"
    assert payload["summary"] == {"questions": 0, "options": 0, "outcomes": 0}
    audit = payload["audit"]
    assert audit["last_imported_at"] is None
    assert audit["last_imported_by_admin_id"] is None
    assert audit["finalized_by_admin_id"] == admin.id
    assert audit["finalized_at"] is not None


def test_get_version_detail_without_logs_returns_null_audit(
    client: TestClient, db_session: Session
) -> None:
    admin = AdminUserFactory(is_active=True, user_id=f"admin-{uuid.uuid4().hex}")
    diagnostic = DiagnosticFactory(code="empty", outcome_table_name="mst_ai_jobs")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="v-empty",
        description=None,
        note=None,
        system_prompt=None,
        src_hash=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(f"/admin/diagnostics/versions/{version.id}", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["summary"] == {"questions": 0, "options": 0, "outcomes": 0}
    assert payload["audit"] is None
    assert payload["system_prompt_preview"] is None


def test_get_version_detail_returns_404_when_missing(
    client: TestClient, db_session: Session
) -> None:
    admin = AdminUserFactory(is_active=True, user_id=f"admin-{uuid.uuid4().hex}")
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get("/admin/diagnostics/versions/999999", headers=headers)

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value
