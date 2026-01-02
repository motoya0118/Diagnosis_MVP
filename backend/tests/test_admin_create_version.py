from __future__ import annotations

import os
import uuid
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, select, text
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import Session, sessionmaker


from app.core.errors import ErrorCode
from app.core.security import create_access_token
from app.deps import admin as admin_deps
from app.main import app
from app.models.admin_user import AdminUser
from app.models.diagnostic import (
    AnswerChoice,
    CfgActiveVersion,
    Diagnostic,
    DiagnosticSession,
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
from tests.utils.db import truncate_tables, DEFAULT_TABLES, upgrade_schema


def _get_database_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL") or os.environ.get("DATABASE_URL")
    assert url, "DATABASE_URL or TEST_DATABASE_URL must be set for tests"
    return url


@pytest.fixture
def db_session(prepare_db) -> Iterator[Session]:
    engine = create_engine(_get_database_url(), future=True)
    truncate_tables(engine, DEFAULT_TABLES)
    _ensure_schema(engine)

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


def _ensure_schema(engine) -> None:
    upgrade_schema(_get_database_url())

    with engine.connect() as conn:
        exists = conn.execute(
            text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = DATABASE() AND table_name = 'admin_users'"
            )
        ).scalar()

    if not exists:
        raise RuntimeError("admin_users table is missing after migrations")


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


def test_create_version_success(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"test_admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"test-diag-{uuid.uuid4().hex}")

    headers = _auth_header(admin.id, user_id=admin.user_id)
    payload = {
        "diagnostic_id": diagnostic.id,
        "name": " 2024 Draft ",
        "description": "初期版",
        "system_prompt": None,
        "note": "初稿を作成",
    }

    response = client.post("/admin/diagnostics/versions", json=payload, headers=headers)

    assert response.status_code == 201, response.text
    body = response.json()

    assert body["diagnostic_id"] == diagnostic.id
    assert body["name"] == "2024 Draft"
    assert body["description"] == "初期版"
    assert body["system_prompt"] is None
    assert body["note"] == "初稿を作成"
    assert body["src_hash"] is None
    assert body["created_by_admin_id"] == admin.id
    assert body["updated_by_admin_id"] == admin.id
    assert "id" in body
    version_id = body["id"]

    version = db_session.get(DiagnosticVersion, version_id)
    assert version is not None
    assert version.name == "2024 Draft"
    assert version.description == "初期版"
    assert version.note == "初稿を作成"
    assert version.created_by_admin_id == admin.id
    assert version.updated_by_admin_id == admin.id

    log_stmt = select(DiagnosticVersionAuditLog).where(
        DiagnosticVersionAuditLog.version_id == version_id,
        DiagnosticVersionAuditLog.action == "CREATE",
    )
    logs = db_session.execute(log_stmt).scalars().all()
    assert len(logs) == 1
    assert logs[0].admin_user_id == admin.id
    assert logs[0].new_value is not None

    db_session.execute(delete(DiagnosticVersionAuditLog).where(DiagnosticVersionAuditLog.version_id == version_id))
    db_session.execute(delete(DiagnosticVersion).where(DiagnosticVersion.id == version_id))
    db_session.execute(delete(Diagnostic).where(Diagnostic.id == diagnostic.id))
    db_session.execute(delete(AdminUser).where(AdminUser.id == admin.id))
    db_session.commit()


def test_create_version_rejects_duplicate_name(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"test_admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"test-diag-{uuid.uuid4().hex}")
    DiagnosticVersionFactory(
        diagnostic=diagnostic,
        name="Draft-1",
        created_by_admin=admin,
        updated_by_admin=admin,
    )

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        "/admin/diagnostics/versions",
        json={
            "diagnostic_id": diagnostic.id,
            "name": "Draft-1",
            "description": None,
            "system_prompt": None,
            "note": None,
        },
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_VERSION_NAME_DUP.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_VERSION_NAME_DUP.value

    stmt = select(DiagnosticVersion).where(
        DiagnosticVersion.diagnostic_id == diagnostic.id,
        DiagnosticVersion.name == "Draft-1",
    )
    versions = db_session.execute(stmt).scalars().all()
    assert len(versions) == 1

    log_stmt = select(DiagnosticVersionAuditLog).where(
        DiagnosticVersionAuditLog.version_id == versions[0].id,
        DiagnosticVersionAuditLog.action == "CREATE",
    )
    logs = db_session.execute(log_stmt).scalars().all()
    assert len(logs) == 0


def test_create_version_rejects_unknown_diagnostic(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"test_admin_{uuid.uuid4().hex}", is_active=True)
    DiagnosticFactory(code=f"test-diag-{uuid.uuid4().hex}")  # unrelated diagnostic

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        "/admin/diagnostics/versions",
        json={
            "diagnostic_id": 999999,
            "name": "Draft-unknown",
            "description": None,
            "system_prompt": None,
            "note": None,
        },
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND.value

    result = db_session.execute(select(DiagnosticVersion).where(DiagnosticVersion.name == "Draft-unknown")).first()
    assert result is None


def test_create_version_rejects_invalid_name(client: TestClient, db_session: Session) -> None:
    admin = AdminUserFactory(user_id=f"test_admin_{uuid.uuid4().hex}", is_active=True)
    diagnostic = DiagnosticFactory(code=f"test-diag-{uuid.uuid4().hex}")

    headers = _auth_header(admin.id, user_id=admin.user_id)
    response = client.post(
        "/admin/diagnostics/versions",
        json={
            "diagnostic_id": diagnostic.id,
            "name": " " * 5,
            "description": None,
            "system_prompt": None,
            "note": None,
        },
        headers=headers,
    )

    assert response.status_code == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION.value

    with pytest.raises(NoResultFound):
        db_session.execute(
            select(DiagnosticVersion).where(DiagnosticVersion.diagnostic_id == diagnostic.id)
        ).scalar_one()
