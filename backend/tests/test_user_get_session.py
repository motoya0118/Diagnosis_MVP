from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ErrorCode
from app.deps import auth as auth_deps
from app.main import app
from app.models.admin_user import AdminUser
from app.models.diagnostic import Diagnostic, DiagnosticSession, DiagnosticVersion, VersionOutcome
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
        session.execute(delete(AdminUser))
        session.flush()
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


def _create_session(
    db: Session,
    *,
    session_code: str,
    llm_result,
    outcome_meta: dict | None = None,
) -> DiagnosticSession:
    admin = AdminUser(user_id=f"admin-{session_code}", hashed_password="hashed", is_active=True)
    db.add(admin)
    db.flush()

    diagnostic = Diagnostic(
        code="ai-career",
        outcome_table_name="mst_ai_jobs",
        description="",
        is_active=True,
    )
    db.add(diagnostic)
    db.flush()

    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name="Version 1",
        description="",
        system_prompt=None,
        note=None,
        src_hash="hash",
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
        finalized_by_admin_id=admin.id,
        finalized_at=datetime.now(timezone.utc),
    )
    db.add(version)
    db.flush()

    meta_payload = outcome_meta or {"name": "AI Strategist", "role_summary": "企業のAI戦略を設計します。"}
    db.add(
        VersionOutcome(
            version_id=version.id,
            outcome_id=101,
            outcome_meta_json=meta_payload,
            sort_order=10,
            is_active=True,
            created_by_admin_id=admin.id,
        )
    )
    db.flush()

    session = DiagnosticSession(
        session_code=session_code,
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        version_options_hash="hash",
        llm_result=llm_result,
    )
    db.add(session)
    db.flush()
    return session


def test_get_session_returns_sanitised_payload(client: TestClient, db_session: Session) -> None:
    llm_result = {
        "raw": {"content": [{"type": "text", "text": "recommendations"}]},
        "generated_at": "2024-09-19T02:10:00Z",
        "model": "anthropic.claude-3-sonnet-20240229-v1:0",
        "messages": [{"role": "system", "content": "hidden"}],
        "hash": "secret",
    }
    session = _create_session(db_session, session_code="SESS-12345678", llm_result=llm_result)

    response = client.get(f"/sessions/{session.session_code}")
    assert response.status_code == 200, response.text

    payload = response.json()
    assert payload["version_id"] == session.version_id
    assert payload["outcomes"] == [
        {
            "outcome_id": 101,
            "sort_order": 10,
            "meta": {
                "name": "AI Strategist",
                "role_summary": "企業のAI戦略を設計します。",
            },
        }
    ]
    assert payload["llm_result"] == {
        "raw": {"content": [{"type": "text", "text": "recommendations"}]},
        "generated_at": "2024-09-19T02:10:00Z",
    }

    db_session.refresh(session)
    assert session.llm_result["model"] == "anthropic.claude-3-sonnet-20240229-v1:0"
    assert "model" not in payload["llm_result"]

    payload["outcomes"][0]["meta"]["name"] = "Mutated"

    stored_meta = db_session.execute(
        select(VersionOutcome.outcome_meta_json).where(VersionOutcome.version_id == session.version_id)
    ).scalar_one()
    assert stored_meta == {
        "name": "AI Strategist",
        "role_summary": "企業のAI戦略を設計します。",
    }


def test_get_session_returns_null_when_result_missing(
    client: TestClient, db_session: Session
) -> None:
    session = _create_session(db_session, session_code="SESS-EMPTY", llm_result=None)

    response = client.get(f"/sessions/{session.session_code}")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["llm_result"] is None
    assert payload["version_id"] == session.version_id
    assert payload["outcomes"][0]["outcome_id"] == 101


def test_get_session_returns_not_found_for_unknown_code(client: TestClient) -> None:
    response = client.get("/sessions/NONEXISTENT")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND.value


def test_get_session_rejects_invalid_session_code_format(client: TestClient) -> None:
    response = client.get("/sessions/invalid$$code")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND.value
