from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import auth as auth_deps
from app.main import app
from app.models.admin_user import AdminUser
from app.models.diagnostic import CfgActiveVersion, Diagnostic, DiagnosticSession, DiagnosticVersion
from app.models.user import User


def _database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be configured for tests"
    return url


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(_database_url(), future=True)
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

    session.execute(delete(DiagnosticSession))
    session.execute(delete(CfgActiveVersion))
    session.execute(delete(DiagnosticVersion))
    session.execute(delete(Diagnostic))
    session.execute(delete(User))
    session.execute(delete(AdminUser))
    session.flush()

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
    admin = AdminUser(user_id=user_id, hashed_password="hashed")
    db.add(admin)
    db.flush()
    return admin


def _prepare_diagnostic(db: Session) -> tuple[Diagnostic, DiagnosticVersion]:
    admin = _create_admin(db, user_id="admin_session_link")
    diagnostic = Diagnostic(code="ai-career", outcome_table_name="mst_ai_jobs", is_active=True)
    db.add(diagnostic)
    db.flush()

    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name="v1",
        description="",
        system_prompt=None,
        note=None,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )
    db.add(version)
    db.flush()

    cfg = CfgActiveVersion(
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )
    db.add(cfg)
    db.flush()
    return diagnostic, version


def _create_user(db: Session, *, email: str) -> User:
    user = User(email=email, hashed_password="hashed-password")
    db.add(user)
    db.flush()
    return user


def _create_session(
    db: Session,
    *,
    diagnostic: Diagnostic,
    version: DiagnosticVersion,
    session_code: str,
    user_id: int | None = None,
    ended_at: datetime | None = None,
) -> DiagnosticSession:
    session = DiagnosticSession(
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        session_code=session_code,
        user_id=user_id,
        version_options_hash="hash",
        ended_at=ended_at,
    )
    db.add(session)
    db.flush()
    return session


def _auth_headers(user: User) -> dict[str, str]:
    token = create_access_token(str(user.id))
    return {"Authorization": f"Bearer {token}"}


def test_link_sessions_assigns_user_and_updates_timestamp(client: TestClient, db_session: Session) -> None:
    diagnostic, version = _prepare_diagnostic(db_session)
    user = _create_user(db_session, email="linker@example.com")
    sess = _create_session(db_session, diagnostic=diagnostic, version=version, session_code="SESS-NEW-001")
    db_session.commit()
    response = client.post(
        "/auth/link-session",
        json={"session_codes": [sess.session_code]},
        headers=_auth_headers(user),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload == {"linked": [sess.session_code], "already_linked": []}

    stored = db_session.execute(
        select(DiagnosticSession).where(DiagnosticSession.session_code == sess.session_code)
    ).scalar_one()
    assert stored.user_id == user.id
    assert stored.ended_at is not None
    assert stored.ended_at.tzinfo is not None


def test_link_sessions_skips_already_linked(client: TestClient, db_session: Session) -> None:
    diagnostic, version = _prepare_diagnostic(db_session)
    user = _create_user(db_session, email="linked@example.com")
    ended_at = datetime(2024, 10, 10, 12, 0, tzinfo=timezone.utc)
    sess = _create_session(
        db_session,
        diagnostic=diagnostic,
        version=version,
        session_code="SESS-EXIST-001",
        user_id=user.id,
        ended_at=ended_at,
    )
    original_updated_at = sess.updated_at
    db_session.commit()

    response = client.post(
        "/auth/link-session",
        json={"session_codes": [sess.session_code, sess.session_code]},
        headers=_auth_headers(user),
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload == {"linked": [], "already_linked": [sess.session_code]}

    db_session.refresh(sess)
    assert sess.user_id == user.id
    assert sess.ended_at == ended_at
    assert sess.updated_at == original_updated_at


def test_link_sessions_returns_not_found_for_unknown_code(client: TestClient, db_session: Session) -> None:
    user = _create_user(db_session, email="missing@example.com")
    db_session.commit()

    response = client.post(
        "/auth/link-session",
        json={"session_codes": ["UNKNOWN-001"]},
        headers=_auth_headers(user),
    )
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND.value


def test_link_sessions_conflict_when_owned_by_other_user(client: TestClient, db_session: Session) -> None:
    diagnostic, version = _prepare_diagnostic(db_session)
    owner = _create_user(db_session, email="owner@example.com")
    requester = _create_user(db_session, email="requester@example.com")
    session_a = _create_session(
        db_session,
        diagnostic=diagnostic,
        version=version,
        session_code="SESS-OWNED-001",
        user_id=owner.id,
    )
    session_b = _create_session(
        db_session,
        diagnostic=diagnostic,
        version=version,
        session_code="SESS-FREE-001",
        user_id=None,
    )
    db_session.commit()

    response = client.post(
        "/auth/link-session",
        json={"session_codes": [session_b.session_code, session_a.session_code]},
        headers=_auth_headers(requester),
    )
    assert response.status_code == 409
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_SESSION_OWNED_BY_OTHER.value
    db_session.refresh(session_a)
    db_session.refresh(session_b)
    assert session_a.user_id == owner.id
    assert session_b.user_id is None


def test_link_sessions_rejects_invalid_payload(client: TestClient, db_session: Session) -> None:
    user = _create_user(db_session, email="invalid@example.com")
    db_session.commit()

    response = client.post(
        "/auth/link-session",
        json={"session_codes": []},
        headers=_auth_headers(user),
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_SESSION_CODE.value


def test_link_sessions_rejects_invalid_format(client: TestClient, db_session: Session) -> None:
    user = _create_user(db_session, email="format@example.com")
    db_session.commit()

    response = client.post(
        "/auth/link-session",
        json={"session_codes": ["INVALID$$$"]},
        headers=_auth_headers(user),
    )
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_SESSION_CODE.value
