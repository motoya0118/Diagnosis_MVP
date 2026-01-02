from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from app.models.diagnostic import CfgActiveVersion
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
def db_session() -> Iterator[Session]:
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
    def restart_savepoint(sess, trans):  # pragma: no cover - fixture plumbing
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


def test_get_active_versions_returns_sorted_payload(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    primary_diag = DiagnosticFactory(code="ai_career", description="ITキャリア診断")
    secondary_diag = DiagnosticFactory(code="legacy", description="旧診断")

    active_version = DiagnosticVersionFactory(
        diagnostic=primary_diag,
        name="v2024-08",
        src_hash="hash-2024-08",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    inactive_version = DiagnosticVersionFactory(
        diagnostic=primary_diag,
        name="draft-2024-09",
        src_hash=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    activated_at = datetime(2024, 8, 31, 15, 0, tzinfo=timezone.utc)
    expected_activated_at = activated_at.isoformat().replace("+00:00", "Z")

    db_session.add(
        CfgActiveVersion(
            diagnostic_id=primary_diag.id,
            version_id=active_version.id,
            created_by_admin_id=admin.id,
            updated_by_admin_id=admin.id,
            created_at=activated_at,
            updated_at=activated_at,
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get("/admin/diagnostics/active-versions", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["items"] == [
        {
            "diagnostic_id": primary_diag.id,
            "diagnostic_code": "ai_career",
            "display_name": "ITキャリア診断",
            "active_version": {
                "version_id": active_version.id,
                "name": "v2024-08",
                "src_hash": "hash-2024-08",
                "activated_at": expected_activated_at,
                "activated_by_admin_id": admin.id,
            },
        },
        {
            "diagnostic_id": secondary_diag.id,
            "diagnostic_code": "legacy",
            "display_name": "旧診断",
            "active_version": None,
        },
    ]


def test_get_active_versions_filters_by_diagnostic_id(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    DiagnosticFactory(code="ai_career", description="ITキャリア診断")
    target_diag = DiagnosticFactory(code="legacy", description="旧診断")

    target_version = DiagnosticVersionFactory(
        diagnostic=target_diag,
        name="v2024-05",
        src_hash="hash-legacy",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.add(
        CfgActiveVersion(
            diagnostic_id=target_diag.id,
            version_id=target_version.id,
            created_by_admin_id=admin.id,
            updated_by_admin_id=admin.id,
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        f"/admin/diagnostics/active-versions?diagnostic_id={target_diag.id}",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["items"]) == 1
    item = payload["items"][0]
    assert item["diagnostic_id"] == target_diag.id
    assert item["active_version"]["version_id"] == target_version.id


def test_get_active_versions_filters_by_diagnostic_code(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    DiagnosticFactory(code="ai_career", description="ITキャリア診断")
    target_diag = DiagnosticFactory(code="legacy", description="旧診断")

    target_version = DiagnosticVersionFactory(
        diagnostic=target_diag,
        name="v2024-05",
        src_hash="hash-legacy",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.add(
        CfgActiveVersion(
            diagnostic_id=target_diag.id,
            version_id=target_version.id,
            created_by_admin_id=admin.id,
            updated_by_admin_id=admin.id,
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        "/admin/diagnostics/active-versions?diagnostic_code=legacy",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert len(payload["items"]) == 1
    item = payload["items"][0]
    assert item["diagnostic_code"] == "legacy"
    assert item["active_version"]["version_id"] == target_version.id


def test_get_active_versions_rejects_conflicting_filters(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get(
        "/admin/diagnostics/active-versions?diagnostic_id=1&diagnostic_code=dx",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_INVALID_FILTER.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_INVALID_FILTER.value


def test_get_active_versions_returns_404_when_not_found(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get(
        "/admin/diagnostics/active-versions?diagnostic_id=999999",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.value
