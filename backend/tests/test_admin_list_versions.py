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
from app.models.diagnostic import CfgActiveVersion, Diagnostic, DiagnosticVersion
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

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=connection, future=True)
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


def _auth_header(admin_id: int, role: str = "admin", user_id: str | None = None) -> dict[str, str]:
    token = create_access_token(
        str(admin_id),
        extra={"role": role, "user_id": user_id or f"admin{admin_id:03d}"},
        expires_delta_minutes=15,
    )
    return {"Authorization": f"Bearer {token}"}


def test_list_versions_returns_sorted_payload(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code="career-dx")

    draft_older = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="2024.08 Draft",
        src_hash=None,
        system_prompt="",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    finalized = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="2024.09 Final",
        src_hash="hash-final",
        system_prompt="## prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    draft_newer = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="2024.09 Draft",
        src_hash=None,
        system_prompt=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    db_session.add(
        CfgActiveVersion(
            diagnostic_id=diagnostic.id,
            version_id=finalized.id,
            created_by_admin_id=admin.id,
            updated_by_admin_id=admin.id,
        )
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(f"/admin/diagnostics/{diagnostic.id}/versions", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["diagnostic_id"] == diagnostic.id
    assert [item["id"] for item in payload["items"]] == [
        finalized.id,
        draft_newer.id,
        draft_older.id,
    ]

    first = payload["items"][0]
    assert first["status"] == "finalized"
    assert first["system_prompt_state"] == "present"
    assert first["is_active"] is True

    second = payload["items"][1]
    assert second["status"] == "draft"
    assert second["system_prompt_state"] == "empty"
    assert second["is_active"] is False


def test_list_versions_filters_by_status(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code="ai-career")
    DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="Draft A",
        src_hash=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    finalized = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="Finalize A",
        src_hash="hash",
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)

    res_draft = client.get(
        f"/admin/diagnostics/{diagnostic.id}/versions?status=draft",
        headers=headers,
    )
    assert res_draft.status_code == 200
    items = res_draft.json()["items"]
    assert len(items) == 1
    assert items[0]["status"] == "draft"

    res_final = client.get(
        f"/admin/diagnostics/{diagnostic.id}/versions?status=finalized",
        headers=headers,
    )
    assert res_final.status_code == 200
    items = res_final.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == finalized.id
    assert items[0]["status"] == "finalized"


def test_list_versions_applies_limit(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code="ai-limit")

    versions = [
        DiagnosticVersionFactory(
            diagnostic=diagnostic,
            name=f"Draft-{index}",
            src_hash=None,
            created_by_admin=admin,
            updated_by_admin=admin,
        )
        for index in range(3)
    ]
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        f"/admin/diagnostics/{diagnostic.id}/versions?status=draft&limit=2",
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 2
    returned_ids = {item["id"] for item in payload["items"]}
    assert returned_ids.issubset({version.id for version in versions})


def test_list_versions_returns_404_for_unknown_diagnostic(
    client: TestClient,
    db_session: Session,
) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get("/admin/diagnostics/999999/versions", headers=headers)

    assert response.status_code == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.value


def test_list_versions_rejects_invalid_status(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code="ai-invalid-status")
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        f"/admin/diagnostics/{diagnostic.id}/versions?status=unknown",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_STATUS_INVALID.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_STATUS_INVALID.value


def test_list_versions_rejects_invalid_limit(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code="ai-invalid-limit")
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        f"/admin/diagnostics/{diagnostic.id}/versions?limit=0",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_LIMIT_INVALID.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_LIMIT_INVALID.value
