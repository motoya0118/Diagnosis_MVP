from __future__ import annotations

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from tests.factories import AdminUserFactory, DiagnosticFactory, set_factory_session
from app.models.diagnostic import (
    CfgActiveVersion,
    Diagnostic,
    DiagnosticVersion,
    DiagnosticVersionAuditLog,
)


def _get_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set for tests"
    return url


@pytest.fixture
def db_session() -> Iterator[Session]:
    engine = create_engine(_get_database_url(), future=True)
    connection = engine.connect()
    transaction = connection.begin()

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection, future=True)
    session = TestingSessionLocal()
    session.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def restart_savepoint(sess, trans):  # pragma: no cover
        if trans.nested and not trans._parent.nested:
            sess.begin_nested()
    session.execute(delete(DiagnosticVersionAuditLog))
    session.execute(delete(CfgActiveVersion))
    session.execute(delete(DiagnosticVersion))
    session.execute(delete(Diagnostic))
    session.flush()
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


def _auth_header(admin_id: int, role: str = "admin", user_id: str | None = None) -> dict[str, str]:
    token = create_access_token(
        str(admin_id),
        extra={"role": role, "user_id": user_id or f"admin{admin_id:03d}"},
        expires_delta_minutes=15,
    )
    return {"Authorization": f"Bearer {token}"}


def test_list_diagnostics_excludes_inactive(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    active_a = DiagnosticFactory(code="basic", description="Basic Diagnostic", is_active=True)
    active_b = DiagnosticFactory(code="zen", description=None, is_active=True)
    DiagnosticFactory(code="legacy", is_active=False)

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get("/admin/diagnostics", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"] == [
        {
            "id": active_a.id,
            "code": "basic",
            "display_name": "basic",
            "description": "Basic Diagnostic",
            "outcome_table_name": active_a.outcome_table_name,
            "is_active": True,
        },
        {
            "id": active_b.id,
            "code": "zen",
            "display_name": "zen",
            "description": None,
            "outcome_table_name": active_b.outcome_table_name,
            "is_active": True,
        },
    ]


def test_list_diagnostics_includes_inactive_when_requested(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    DiagnosticFactory(code="active1", is_active=True)
    DiagnosticFactory(code="draft0", is_active=False)

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get("/admin/diagnostics?include_inactive=true", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    codes = [item["code"] for item in payload["items"]]
    assert codes == ["active1", "draft0"]


def test_list_diagnostics_rejects_invalid_flag(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get("/admin/diagnostics?include_inactive=yes", headers=headers)
    assert response.status_code == 400
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_STATUS_INVALID.value


def test_list_diagnostics_requires_authentication(client: TestClient, db_session: Session) -> None:
    response = client.get("/admin/diagnostics")
    assert response.status_code == 401
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.COMMON_UNAUTHENTICATED.value


def test_list_diagnostics_rejects_non_admin_role(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(is_active=True)
    headers = _auth_header(admin.id, role="user", user_id=admin.user_id)

    response = client.get("/admin/diagnostics", headers=headers)
    assert response.status_code == ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_SCOPE_INVALID.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_SCOPE_INVALID.value
