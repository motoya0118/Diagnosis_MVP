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
from app.models.diagnostic import DiagnosticVersion, DiagnosticVersionAuditLog
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


def _fetch_audit_logs(db: Session, version_id: int) -> list[DiagnosticVersionAuditLog]:
    stmt = (
        select(DiagnosticVersionAuditLog)
        .where(
            DiagnosticVersionAuditLog.version_id == version_id,
            DiagnosticVersionAuditLog.action == "PROMPT_UPDATE",
        )
        .order_by(
            DiagnosticVersionAuditLog.created_at.asc(),
            DiagnosticVersionAuditLog.id.asc(),
        )
    )
    return list(db.execute(stmt).scalars())


def test_get_system_prompt_returns_payload(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    version = DiagnosticVersionFactory(
        diagnostic=DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}"),
        src_hash=None,
        system_prompt="Existing prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.get(
        f"/admin/diagnostics/versions/{version.id}/system-prompt",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["id"] == version.id
    assert payload["system_prompt"] == "Existing prompt"
    assert payload["updated_by_admin_id"] == admin.id
    assert "updated_at" in payload


def test_get_system_prompt_not_found(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    headers = _auth_header(admin.id, user_id=admin.user_id)

    response = client.get(
        "/admin/diagnostics/versions/999999/system-prompt",
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value


def test_update_system_prompt_success(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="Old prompt",
        note="Initial note",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    payload = {
        "system_prompt": "You are an AI career advisor...",
        "note": "2024-09 prompt refresh",
    }

    response = client.put(
        f"/admin/diagnostics/versions/{version.id}/system-prompt",
        json=payload,
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["id"] == version.id
    assert body["system_prompt"] == payload["system_prompt"]
    assert body["updated_by_admin_id"] == admin.id
    assert "updated_at" in body

    updated = db_session.get(DiagnosticVersion, version.id)
    assert updated is not None
    assert updated.system_prompt == payload["system_prompt"]
    assert updated.note == payload["note"]
    assert updated.updated_by_admin_id == admin.id

    logs = _fetch_audit_logs(db_session, version.id)
    assert len(logs) == 1
    assert logs[0].admin_user_id == admin.id
    assert logs[0].note == payload["note"]
    assert logs[0].new_value is not None
    recorded = json.loads(logs[0].new_value)
    expected_hash = hashlib.sha256(payload["system_prompt"].encode("utf-8")).hexdigest()
    assert recorded["system_prompt_sha256"] == expected_hash


def test_update_system_prompt_rejects_finalized(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash="hash",
        system_prompt="Frozen prompt",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.put(
        f"/admin/diagnostics/versions/{version.id}/system-prompt",
        json={
            "system_prompt": "Updated prompt",
            "note": "should fail",
        },
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_FROZEN.value

    db_session.refresh(version)
    assert version.system_prompt == "Frozen prompt"

    logs = _fetch_audit_logs(db_session, version.id)
    assert logs == []


def test_update_system_prompt_treats_empty_as_null(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt="Existing prompt",
        note="Keep this note",
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.put(
        f"/admin/diagnostics/versions/{version.id}/system-prompt",
        json={"system_prompt": ""},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["system_prompt"] is None
    assert body["updated_by_admin_id"] == admin.id

    db_session.refresh(version)
    assert version.system_prompt is None
    assert version.note == "Keep this note"

    logs = _fetch_audit_logs(db_session, version.id)
    assert len(logs) == 1
    assert logs[0].note is None
    recorded = json.loads(logs[0].new_value)
    expected_hash = hashlib.sha256(b"").hexdigest()
    assert recorded["system_prompt_sha256"] == expected_hash


def test_update_system_prompt_validates_length(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin-{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        src_hash=None,
        system_prompt=None,
        created_by_admin=admin,
        updated_by_admin=admin,
    )
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    long_prompt = "x" * 100_001
    response = client.put(
        f"/admin/diagnostics/versions/{version.id}/system-prompt",
        json={"system_prompt": long_prompt},
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.value

    db_session.refresh(version)
    assert version.system_prompt is None
    logs = _fetch_audit_logs(db_session, version.id)
    assert logs == []
