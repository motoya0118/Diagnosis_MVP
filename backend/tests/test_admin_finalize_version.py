from __future__ import annotations

import hashlib
import json
import os
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from app.models.diagnostic import (
    DiagnosticVersion,
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
    def restart_savepoint(sess, trans):  # pragma: no cover - fixture boilerplate
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


def _normalise_json(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, dict):
        return {key: _normalise_json(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_normalise_json(item) for item in value]
    return value


def _expected_src_hash(
    version: DiagnosticVersion,
    db: Session,
) -> str:
    prompt = version.system_prompt or ""

    questions = db.execute(
        select(VersionQuestion)
        .where(VersionQuestion.version_id == version.id)
        .order_by(VersionQuestion.sort_order.asc(), VersionQuestion.id.asc())
    ).scalars()
    questions_payload = [
        {
            "q_code": q.q_code,
            "display_text": q.display_text,
            "multi": q.multi,
            "sort_order": q.sort_order,
            "is_active": q.is_active,
        }
        for q in questions
    ]

    options = db.execute(
        select(VersionOption)
        .where(VersionOption.version_id == version.id)
        .order_by(
            VersionOption.version_question_id.asc(),
            VersionOption.sort_order.asc(),
            VersionOption.id.asc(),
        )
    ).scalars()
    options_payload = [
        {
            "q_code": opt.q_code,
            "opt_code": opt.opt_code,
            "display_label": opt.display_label,
            "llm_op": _normalise_json(opt.llm_op),
            "sort_order": opt.sort_order,
            "is_active": opt.is_active,
        }
        for opt in options
    ]

    outcomes = db.execute(
        select(VersionOutcome)
        .where(VersionOutcome.version_id == version.id)
        .order_by(VersionOutcome.sort_order.asc(), VersionOutcome.outcome_id.asc(), VersionOutcome.id.asc())
    ).scalars()
    outcomes_payload = [
        {
            "outcome_id": outcome.outcome_id,
            "sort_order": outcome.sort_order,
            "meta": _normalise_json(outcome.outcome_meta_json),
        }
        for outcome in outcomes
    ]

    chunks = [
        prompt,
        json.dumps(questions_payload, ensure_ascii=False, separators=(",", ":")),
        json.dumps(options_payload, ensure_ascii=False, separators=(",", ":")),
        json.dumps(outcomes_payload, ensure_ascii=False, separators=(",", ":")),
    ]
    data = "\n".join(chunks)
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _build_structure(
    *,
    db: Session,
    admin_id: int,
    diagnostic_id: int,
    version_id: int,
    question_has_active_option: bool = True,
    include_outcomes: bool = True,
) -> None:
    question = Question(
        diagnostic_id=diagnostic_id,
        q_code="Q001",
        display_text="質問1",
        multi=False,
        sort_order=1,
        is_active=True,
    )
    db.add(question)
    db.flush()

    version_question = VersionQuestion(
        version_id=version_id,
        diagnostic_id=diagnostic_id,
        question_id=question.id,
        q_code=question.q_code,
        display_text=question.display_text,
        multi=question.multi,
        sort_order=1,
        is_active=True,
        created_by_admin_id=admin_id,
    )
    db.add(version_question)
    db.flush()

    option = Option(
        question_id=question.id,
        opt_code="OPT001",
        display_label="オプション1",
        llm_op={"score": 10},
        sort_order=1,
        is_active=True,
    )
    db.add(option)
    db.flush()

    version_option = VersionOption(
        version_id=version_id,
        version_question_id=version_question.id,
        option_id=option.id,
        q_code=question.q_code,
        opt_code=option.opt_code,
        display_label=option.display_label,
        llm_op=option.llm_op,
        sort_order=1,
        is_active=question_has_active_option,
        created_by_admin_id=admin_id,
    )
    db.add(version_option)

    if include_outcomes:
        outcome = VersionOutcome(
            version_id=version_id,
            outcome_id=1,
            outcome_meta_json={"category": "A"},
            sort_order=1,
            is_active=True,
            created_by_admin_id=admin_id,
        )
        db.add(outcome)

    db.flush()


def _fetch_finalize_logs(db: Session, version_id: int) -> list[DiagnosticVersionAuditLog]:
    stmt = (
        select(DiagnosticVersionAuditLog)
        .where(
            DiagnosticVersionAuditLog.version_id == version_id,
            DiagnosticVersionAuditLog.action == "FINALIZE",
        )
        .order_by(DiagnosticVersionAuditLog.created_at.asc(), DiagnosticVersionAuditLog.id.asc())
    )
    return list(db.execute(stmt).scalars())


def test_finalize_success(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="You are an AI career advisor.",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    _build_structure(
        db=db_session,
        admin_id=admin.id,
        diagnostic_id=diagnostic.id,
        version_id=version.id,
    )
    db_session.expire(version)

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/finalize",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["version_id"] == version.id
    assert payload["finalized_by_admin_id"] == admin.id
    assert payload["summary"] == {"questions": 1, "options": 1, "outcomes": 1}
    assert isinstance(payload["finalized_at"], str)

    refreshed = db_session.get(DiagnosticVersion, version.id)
    assert refreshed is not None
    assert refreshed.src_hash is not None
    assert refreshed.finalized_by_admin_id == admin.id
    assert refreshed.finalized_at is not None
    assert refreshed.updated_by_admin_id == admin.id

    expected_hash = _expected_src_hash(refreshed, db_session)
    assert payload["src_hash"] == expected_hash
    assert refreshed.src_hash == expected_hash

    logs = _fetch_finalize_logs(db_session, version.id)
    assert len(logs) == 1
    assert logs[0].admin_user_id == admin.id
    assert logs[0].new_value is not None
    recorded = json.loads(logs[0].new_value)
    assert recorded["src_hash"] == expected_hash
    assert recorded["questions"] == 1
    assert recorded["options"] == 1
    assert recorded["outcomes"] == 1


def test_finalize_requires_questions(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="Prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/finalize",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DEP_MISSING.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DEP_MISSING.value


def test_finalize_requires_active_options(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="Prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    _build_structure(
        db=db_session,
        admin_id=admin.id,
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        question_has_active_option=False,
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/finalize",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DEP_MISSING.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DEP_MISSING.value


def test_finalize_requires_outcomes(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="Prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    _build_structure(
        db=db_session,
        admin_id=admin.id,
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        include_outcomes=False,
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/finalize",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DEP_MISSING.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DEP_MISSING.value


def test_finalize_rejects_already_finalized(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash="precomputed-hash",
        system_prompt="Prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/finalize",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.value


def test_finalize_missing_version_returns_404(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.post(
        "/admin/diagnostics/versions/999999/finalize",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value
