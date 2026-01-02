from __future__ import annotations

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
    CfgActiveVersion,
    DiagnosticVersion,
    DiagnosticVersionAuditLog,
    utcnow,
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


def test_activate_version_success(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex[:8]}")
    previous_version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash="finalized-prev",
        name="Prev Finalized",
    )
    new_version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash="finalized-new",
        name="New Finalized",
    )

    active = CfgActiveVersion(
        diagnostic_id=diagnostic.id,
        version_id=previous_version.id,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    db_session.add(active)
    db_session.flush()

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{new_version.id}/activate",
        json={"diagnostic_id": diagnostic.id},
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["diagnostic_id"] == diagnostic.id
    assert body["version_id"] == new_version.id
    assert body["activated_by_admin_id"] == admin.id
    assert isinstance(body["activated_at"], str)

    db_session.refresh(active)
    assert active.version_id == new_version.id
    assert active.updated_by_admin_id == admin.id

    logs = db_session.execute(
        select(DiagnosticVersionAuditLog).where(
            DiagnosticVersionAuditLog.version_id == new_version.id,
            DiagnosticVersionAuditLog.action == "ACTIVATE",
        )
    ).scalars().all()
    assert len(logs) == 1
    log = logs[0]
    assert log.admin_user_id == admin.id
    payload = json.loads(log.new_value) if log.new_value else {}
    assert payload["diagnostic_id"] == diagnostic.id
    assert payload["previous_version_id"] == previous_version.id
    assert payload["activated_version_id"] == new_version.id
    assert log.note == f"previous_version_id={previous_version.id}"


def test_activate_version_without_diagnostic_body(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex[:8]}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash="ready-hash",
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/activate",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["diagnostic_id"] == diagnostic.id
    assert body["version_id"] == version.id

    active = db_session.execute(
        select(CfgActiveVersion).where(CfgActiveVersion.diagnostic_id == diagnostic.id)
    ).scalar_one()
    assert active.version_id == version.id


def test_activate_version_diagnostic_mismatch(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex[:8]}")
    other = DiagnosticFactory(code=f"other-{uuid.uuid4().hex[:8]}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash="ready-hash",
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/activate",
        json={"diagnostic_id": other.id},
        headers=headers,
    )

    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "E012"
    assert body["error"]["detail"] == "指定診断と版が一致しません"


def test_activate_version_draft_rejected(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"diag-{uuid.uuid4().hex[:8]}")
    version = DiagnosticVersionFactory(
        diagnostic=diagnostic,
        created_by_admin=admin,
        updated_by_admin=admin,
        src_hash=None,
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        f"/admin/diagnostics/versions/{version.id}/activate",
        json={"diagnostic_id": diagnostic.id},
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DEP_MISSING.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_DEP_MISSING.value


def test_activate_version_not_found(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"admin_{uuid.uuid4().hex}", is_active=True)

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        "/admin/diagnostics/versions/999999/activate",
        json={"diagnostic_id": 1},
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND.value
