from __future__ import annotations

import os
from datetime import datetime
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.registry import compute_version_options_hash
from app.core.security import create_access_token
from app.deps import auth as auth_deps
from app.main import app
from app.models.admin_user import AdminUser
from app.models.diagnostic import (
    CfgActiveVersion,
    Diagnostic,
    DiagnosticSession,
    DiagnosticVersion,
)
from app.models.user import User
from app.services.diagnostics import session_manager


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
        finally:  # pragma: no cover - nothing to clean
            pass

    app.dependency_overrides[auth_deps.get_db] = override_get_db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(auth_deps.get_db, None)


def _parse_datetime(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


def _create_admin(db_session: Session, *, user_id: str) -> AdminUser:
    admin = AdminUser(user_id=user_id, hashed_password="hashed")
    db_session.add(admin)
    db_session.flush()
    return admin


def _create_diagnostic(
    db_session: Session,
    *,
    code: str,
    admin: AdminUser,
    version_name: str = "Version 1",
) -> tuple[Diagnostic, DiagnosticVersion, CfgActiveVersion]:
    diagnostic = Diagnostic(code=code, outcome_table_name="mst_ai_jobs", is_active=True)
    db_session.add(diagnostic)
    db_session.flush()

    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name=version_name,
        description="",
        system_prompt=None,
        note=None,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )
    db_session.add(version)
    db_session.flush()

    active = CfgActiveVersion(
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )
    db_session.add(active)
    db_session.flush()
    return diagnostic, version, active


def _create_active_diagnostic(db_session: Session, *, code: str) -> tuple[Diagnostic, CfgActiveVersion]:
    admin = _create_admin(db_session, user_id=f"admin_{code}")
    diagnostic, _, active = _create_diagnostic(db_session, code=code, admin=admin)
    return diagnostic, active


def test_start_session_anonymous(client: TestClient, db_session: Session) -> None:
    diagnostic, active = _create_active_diagnostic(db_session, code="diag-anon")

    response = client.post(f"/diagnostics/{diagnostic.code}/sessions", json={})
    assert response.status_code == 201, response.text
    payload = response.json()

    assert payload["diagnostic_id"] == diagnostic.id
    assert payload["version_id"] == active.version_id
    assert payload["session_code"]
    assert _parse_datetime(payload["started_at"])

    stored = db_session.scalar(
        select(DiagnosticSession).where(
            DiagnosticSession.session_code == payload["session_code"]
        )
    )
    assert stored is not None
    assert stored.user_id is None
    assert stored.diagnostic_id == diagnostic.id
    assert stored.version_id == active.version_id
    assert (
        stored.version_options_hash
        == compute_version_options_hash(active.version_id, [])
    )


def test_start_session_authenticated(client: TestClient, db_session: Session) -> None:
    diagnostic, active = _create_active_diagnostic(db_session, code="diag-auth")
    user = User(email="user@example.com", hashed_password="hashed")
    db_session.add(user)
    db_session.flush()

    token = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post(
        f"/diagnostics/{diagnostic.code}/sessions",
        json={},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    payload = response.json()

    stored = db_session.scalar(
        select(DiagnosticSession).where(
            DiagnosticSession.session_code == payload["session_code"]
        )
    )
    assert stored is not None
    assert stored.user_id == user.id


def test_start_session_missing_diagnostic(client: TestClient) -> None:
    response = client.post("/diagnostics/unknown/sessions", json={})
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.value


def test_start_session_without_active_version(client: TestClient, db_session: Session) -> None:
    diagnostic = Diagnostic(code="diag-no-active", outcome_table_name="mst_ai_jobs", is_active=True)
    db_session.add(diagnostic)
    db_session.flush()

    response = client.post(f"/diagnostics/{diagnostic.code}/sessions", json={})
    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value


def test_start_session_retries_on_code_collision(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    diagnostic, active = _create_active_diagnostic(db_session, code="diag-collision")
    existing_code = "AAAAAAAAAAAAAAAAAAAAAAAAAA"  # 26 chars, base32-compatible

    db_session.add(
        DiagnosticSession(
            session_code=existing_code,
            diagnostic_id=diagnostic.id,
            version_id=active.version_id,
            user_id=None,
            version_options_hash=compute_version_options_hash(active.version_id, []),
        )
    )
    db_session.flush()

    original_generator = session_manager.generate_session_code
    fallback_code = original_generator()
    if fallback_code == existing_code:  # pragma: no cover - defensive guard
        fallback_code = original_generator()
    codes = iter([existing_code, fallback_code])
    monkeypatch.setattr(session_manager, "generate_session_code", lambda: next(codes))

    response = client.post(
        f"/diagnostics/{diagnostic.code}/sessions",
        json={},
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["session_code"] == fallback_code

