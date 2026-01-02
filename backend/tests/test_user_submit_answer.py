import os
from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.registry import compute_version_options_hash
from app.deps import auth as auth_deps
from app.main import app
from app.models.admin_user import AdminUser
from app.models.diagnostic import (
    AnswerChoice,
    Diagnostic,
    DiagnosticSession,
    DiagnosticVersion,
    Option,
    Question,
    VersionOption,
    VersionQuestion,
)
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

    try:
        yield session
    finally:
        session.rollback()
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()


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


def _create_admin(db: Session, *, user_id: str = "admin") -> AdminUser:
    admin = AdminUser(user_id=user_id, hashed_password="hashed", is_active=True)
    db.add(admin)
    db.flush()
    return admin


def _create_version(
    db: Session,
    *,
    diagnostic: Diagnostic,
    admin_id: int,
    name: str = "v1",
) -> DiagnosticVersion:
    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name=name,
        description="",
        system_prompt=None,
        note=None,
        created_by_admin_id=admin_id,
        updated_by_admin_id=admin_id,
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
    multi: bool = False,
    sort_order: int = 1,
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
    sort_order: int = 1,
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


def _create_version_option(
    db: Session,
    *,
    version: DiagnosticVersion,
    question: Question,
    option: Option,
    admin_id: int,
) -> VersionOption:
    existing_vq = db.execute(
        select(VersionQuestion).where(
            VersionQuestion.version_id == version.id,
            VersionQuestion.question_id == question.id,
        )
    ).scalar_one_or_none()
    if existing_vq is None:
        version_question = VersionQuestion(
            version_id=version.id,
            diagnostic_id=version.diagnostic_id,
            question_id=question.id,
            q_code=question.q_code,
            display_text=question.display_text,
            multi=question.multi,
            sort_order=question.sort_order,
            is_active=question.is_active,
            created_by_admin_id=admin_id,
        )
        db.add(version_question)
        db.flush()
    else:
        version_question = existing_vq

    version_option = VersionOption(
        version_id=version.id,
        version_question_id=version_question.id,
        option_id=option.id,
        q_code=question.q_code,
        opt_code=option.opt_code,
        display_label=option.display_label,
        llm_op=None,
        sort_order=option.sort_order,
        is_active=True,
        created_by_admin_id=admin_id,
    )
    db.add(version_option)
    db.flush()
    return version_option


def _create_session(
    db: Session,
    *,
    diagnostic: Diagnostic,
    version: DiagnosticVersion,
) -> DiagnosticSession:
    session = DiagnosticSession(
        session_code="SESS-ABC123",
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        version_options_hash=compute_version_options_hash(version.id, []),
    )
    db.add(session)
    db.flush()
    return session


def _prepare_entities(db: Session) -> tuple[Diagnostic, DiagnosticVersion, VersionOption, DiagnosticSession]:
    admin = _create_admin(db, user_id="admin-main")
    diagnostic = Diagnostic(
        code="ai-career",
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db.add(diagnostic)
    db.flush()

    version = _create_version(db, diagnostic=diagnostic, admin_id=admin.id)
    question = _create_question(
        db,
        diagnostic_id=diagnostic.id,
        code="Q001",
        text="現在の職種を教えてください",
        multi=False,
        sort_order=10,
    )
    option = _create_option(
        db,
        question=question,
        code="OPT001",
        label="エンジニア",
        sort_order=10,
    )
    version_option = _create_version_option(
        db,
        version=version,
        question=question,
        option=option,
        admin_id=admin.id,
    )

    session = _create_session(db, diagnostic=diagnostic, version=version)

    return diagnostic, version, version_option, session


def test_submit_answers_success(client: TestClient, db_session: Session) -> None:
    _, version, version_option, session = _prepare_entities(db_session)

    answered_at = "2024-09-19T02:05:00Z"
    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [version_option.id], "answered_at": answered_at},
    )
    assert response.status_code == 204, response.text

    db_session.expire_all()
    stored_choices = db_session.execute(
        select(AnswerChoice).where(AnswerChoice.session_id == session.id)
    ).scalars().all()
    assert len(stored_choices) == 1

    stored = stored_choices[0]
    expected = datetime.fromisoformat(answered_at.replace("Z", "+00:00"))
    assert stored.answered_at == expected
    assert stored.version_option_id == version_option.id

    updated_session = db_session.get(DiagnosticSession, session.id)
    assert updated_session is not None
    assert (
        updated_session.version_options_hash
        == compute_version_options_hash(version.id, [version_option.id])
    )


def test_submit_answers_missing_session(client: TestClient) -> None:
    response = client.post(
        "/sessions/unknown/answers",
        json={"version_option_ids": [1]},
    )
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND.value


def test_submit_answers_invalid_payload(client: TestClient, db_session: Session) -> None:
    _, _, version_option, session = _prepare_entities(db_session)

    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": []},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD.value

    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [version_option.id, version_option.id]},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD.value

    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [0]},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD.value


def test_submit_answers_too_many_items(client: TestClient, db_session: Session) -> None:
    _, _, _, session = _prepare_entities(db_session)

    payload_ids = list(range(1, 22))
    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": payload_ids},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD.value


def test_submit_answers_option_out_of_version(client: TestClient, db_session: Session) -> None:
    diagnostic, version, version_option, session = _prepare_entities(db_session)

    # Create another version with different option
    admin = _create_admin(db_session, user_id="admin-other")
    other_version = _create_version(
        db_session, diagnostic=diagnostic, admin_id=admin.id, name="v2"
    )
    other_question = _create_question(
        db_session,
        diagnostic_id=diagnostic.id,
        code="Q999",
        text="他バージョンの質問",
        multi=False,
        sort_order=20,
    )
    other_option = _create_option(
        db_session,
        question=other_question,
        code="OPT999",
        label="別の選択肢",
        sort_order=20,
    )
    other_version_option = _create_version_option(
        db_session,
        version=other_version,
        question=other_question,
        option=other_option,
        admin_id=admin.id,
    )

    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [other_version_option.id]},
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_OPTION_OUT_OF_VERSION.value

    # Ensure existing valid option remains unused
    count = db_session.execute(
        select(AnswerChoice).where(AnswerChoice.version_option_id == version_option.id)
    ).scalars().all()
    assert not count


def test_submit_answers_duplicate(client: TestClient, db_session: Session) -> None:
    _, version, version_option, session = _prepare_entities(db_session)

    existing = AnswerChoice(
        session_id=session.id,
        version_option_id=version_option.id,
        answered_at=datetime.now(timezone.utc),
    )
    db_session.add(existing)
    db_session.flush()

    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [version_option.id]},
    )
    assert response.status_code == 409
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DUPLICATE_ANSWER.value


def test_submit_answers_uses_current_timestamp_when_missing(
    client: TestClient,
    db_session: Session,
) -> None:
    _, version, version_option, session = _prepare_entities(db_session)

    before = datetime.now(timezone.utc)
    response = client.post(
        f"/sessions/{session.session_code}/answers",
        json={"version_option_ids": [version_option.id]},
    )
    assert response.status_code == 204, response.text

    db_session.expire_all()
    stored = db_session.execute(
        select(AnswerChoice).where(AnswerChoice.session_id == session.id)
    ).scalar_one()
    after = datetime.now(timezone.utc)

    assert before <= stored.answered_at <= after
