from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
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
from app.services.diagnostics import llm_executor
from app.routers import sessions as sessions_router
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


class RecordingBedrockClient:
    def __init__(self, responses: list[Any] | None = None) -> None:
        self._queue = list(responses or [{"content": [{"type": "text", "text": "ok"}]}])
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def invoke_model(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append((model_id, payload))
        if self._queue:
            item = self._queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return {"content": [{"type": "text", "text": "ok"}]}


@pytest.fixture
def patch_bedrock(monkeypatch):
    created: list[RecordingBedrockClient] = []

    def _factory(client: RecordingBedrockClient) -> RecordingBedrockClient:
        created.append(client)
        monkeypatch.setattr(llm_executor, "_BEDROCK_FACTORY", lambda: client, raising=False)
        monkeypatch.setattr(sessions_router, "llm_executor", llm_executor, raising=False)
        return client

    return _factory


class RecordingGeminiClient:
    def __init__(self, responses: list[Any] | None = None) -> None:
        self._queue = list(responses or [{"text": "ok"}])
        self.calls: list[dict[str, Any]] = []

    def generate_content(
        self,
        *,
        model: str,
        system_instruction: str,
        user_payload: str,
        temperature: float | None,
        top_p: float | None,
    ) -> dict[str, Any]:
        self.calls.append(
            {
                "model": model,
                "system_instruction": system_instruction,
                "user_payload": user_payload,
                "temperature": temperature,
                "top_p": top_p,
            }
        )
        if self._queue:
            item = self._queue.pop(0)
            if isinstance(item, Exception):
                raise item
            return item
        return {"text": "ok"}


@pytest.fixture
def patch_gemini(monkeypatch):
    def _factory(client: RecordingGeminiClient) -> RecordingGeminiClient:
        monkeypatch.setattr(llm_executor, "_GEMINI_FACTORY", lambda: client, raising=False)
        monkeypatch.setattr(sessions_router, "llm_executor", llm_executor, raising=False)
        return client

    return _factory


def _prepare_session(db: Session) -> tuple[DiagnosticSession, VersionOption]:
    admin = AdminUser(user_id="admin", hashed_password="hashed", is_active=True)
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
        system_prompt="You are an AI career assistant.",
        src_hash="version-hash",
        note=None,
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
        finalized_by_admin_id=admin.id,
        finalized_at=datetime.now(timezone.utc),
    )
    db.add(version)
    db.flush()

    question = Question(
        diagnostic_id=diagnostic.id,
        q_code="Q001",
        display_text="Select your focus area",
        multi=False,
        sort_order=1,
        is_active=True,
    )
    db.add(question)
    db.flush()

    option = Option(
        question_id=question.id,
        opt_code="OPT1",
        display_label="Machine Learning",
        llm_op={"code": "ML", "weight": 1},
        sort_order=1,
        is_active=True,
    )
    db.add(option)
    db.flush()

    version_question = VersionQuestion(
        version_id=version.id,
        diagnostic_id=diagnostic.id,
        question_id=question.id,
        q_code=question.q_code,
        display_text=question.display_text,
        multi=question.multi,
        sort_order=1,
        is_active=True,
        created_by_admin_id=admin.id,
    )
    db.add(version_question)
    db.flush()

    version_option = VersionOption(
        version_id=version.id,
        version_question_id=version_question.id,
        option_id=option.id,
        q_code=question.q_code,
        opt_code=option.opt_code,
        display_label=option.display_label,
        llm_op=option.llm_op,
        sort_order=option.sort_order,
        is_active=True,
        created_by_admin_id=admin.id,
    )
    db.add(version_option)
    db.flush()

    hash_value = compute_version_options_hash(version.id, [version_option.id])
    session = DiagnosticSession(
        session_code="SESS-001",
        diagnostic_id=diagnostic.id,
        version_id=version.id,
        version_options_hash=hash_value,
        llm_result=None,
    )
    db.add(session)
    db.flush()

    answer = AnswerChoice(
        session_id=session.id,
        version_option_id=version_option.id,
        answered_at=datetime.now(timezone.utc),
    )
    db.add(answer)
    db.flush()

    return session, version_option


def test_execute_llm_invokes_bedrock(client: TestClient, db_session: Session, patch_bedrock) -> None:
    session, _ = _prepare_session(db_session)
    stub = patch_bedrock(RecordingBedrockClient(responses=[{"content": [{"type": "text", "text": "LLM"}]}]))

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["model"] == "anthropic.claude-3-sonnet-20240229-v1:0"
    assert payload["messages"][0]["role"] == "system"
    assert payload["messages"][1]["role"] == "user"
    assert payload["llm_result"]["raw"] == {"content": [{"type": "text", "text": "LLM"}]}

    expected_invoked_model = (
        settings.bedrock_default_inference_profile or settings.bedrock_default_model
    )
    db_session.refresh(session)
    assert session.llm_result is not None
    assert session.llm_result["raw"] == {"content": [{"type": "text", "text": "LLM"}]}
    assert session.llm_result["invoked_model"] == expected_invoked_model
    assert stub.calls, "Bedrock client should be invoked"
    invoked_model, invoked_payload = stub.calls[0]
    system_prompt_value = db_session.get(DiagnosticVersion, session.version_id).system_prompt
    assert invoked_model == expected_invoked_model
    assert invoked_payload["system"] == system_prompt_value
    assert invoked_payload["messages"][0]["role"] == "user"
    assert invoked_payload["messages"][0]["content"][0]["text"] == payload["messages"][1]["content"]
    assert invoked_payload["temperature"] == pytest.approx(0.2)
    assert "top_p" not in invoked_payload


def test_execute_llm_invokes_gemini(
    client: TestClient,
    db_session: Session,
    patch_gemini,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, _ = _prepare_session(db_session)
    monkeypatch.setattr(settings, "mode", "gemini", raising=False)
    stub = patch_gemini(RecordingGeminiClient(responses=[{"text": "GEMINI"}]))

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == 200, response.text
    payload = response.json()

    expected_model = (getattr(settings, "gemini_default_model", None) or "gemini-2.5-pro")
    assert payload["model"] == expected_model
    assert payload["llm_result"]["raw"]["text"] == "GEMINI"

    db_session.refresh(session)
    assert session.llm_result is not None
    assert session.llm_result["provider"] == "gemini"

    assert stub.calls, "Gemini client should be invoked"
    call = stub.calls[0]
    system_prompt_value = db_session.get(DiagnosticVersion, session.version_id).system_prompt
    assert call["model"] == expected_model
    assert call["system_instruction"] == system_prompt_value
    assert call["user_payload"] == payload["messages"][1]["content"]


def test_execute_llm_reuses_session_cache(client: TestClient, db_session: Session, patch_bedrock) -> None:
    session, _ = _prepare_session(db_session)
    cached = {
        "model": "anthropic.claude-3",
        "generated_at": "2024-09-19T02:10:00Z",
        "hash": session.version_options_hash,
        "messages": [
            {"role": "system", "content": "cached"},
            {"role": "user", "content": "[cached]"},
        ],
        "raw": {"content": [{"type": "text", "text": "cached"}]},
    }
    session.llm_result = cached
    db_session.flush()

    stub = patch_bedrock(RecordingBedrockClient(responses=[]))

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["model"] == "anthropic.claude-3"
    assert payload["llm_result"]["raw"] == cached["raw"]
    db_session.refresh(session)
    assert session.llm_result["raw"] == cached["raw"]
    assert not stub.calls, "Bedrock client should not be called when cache is reused"


def test_execute_llm_switching_to_gemini_ignores_bedrock_cache(
    client: TestClient,
    db_session: Session,
    patch_gemini,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, _ = _prepare_session(db_session)
    session.llm_result = {
        "model": "anthropic.claude-3-sonnet-20240229-v1:0",
        "generated_at": "2024-09-19T00:00:00Z",
        "hash": session.version_options_hash,
        "raw": {"content": [{"type": "text", "text": "bedrock"}]},
    }
    db_session.flush()

    monkeypatch.setattr(settings, "mode", "gemini", raising=False)
    stub = patch_gemini(RecordingGeminiClient(responses=[{"text": "gemini"}]))

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["llm_result"]["raw"]["text"] == "gemini"
    assert stub.calls, "Gemini client should be invoked when cache provider differs"

    db_session.refresh(session)
    assert session.llm_result is not None
    assert session.llm_result["provider"] == "gemini"
    assert session.llm_result["raw"]["text"] == "gemini"


def test_execute_llm_reuses_shared_cache(client: TestClient, db_session: Session, patch_bedrock) -> None:
    session, version_option = _prepare_session(db_session)
    other_session = DiagnosticSession(
        session_code="SESS-002",
        diagnostic_id=session.diagnostic_id,
        version_id=session.version_id,
        version_options_hash=session.version_options_hash,
        llm_result={
            "model": "anthropic.claude-3-sonnet-20240229-v1:0",
            "generated_at": "2024-09-18T01:00:00Z",
            "hash": session.version_options_hash,
            "raw": {"content": [{"type": "text", "text": "cached-shared"}]},
        },
        ended_at=datetime.now(timezone.utc),
    )
    db_session.add(other_session)
    db_session.flush()

    patch_bedrock(RecordingBedrockClient(responses=[]))

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["llm_result"]["raw"] == {
        "content": [{"type": "text", "text": "cached-shared"}]
    }
    db_session.refresh(session)
    assert session.llm_result is not None
    assert session.llm_result["raw"]["content"][0]["text"] == "cached-shared"


def test_execute_llm_force_regenerate_ignores_cache(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, _ = _prepare_session(db_session)
    session.llm_result = {
        "model": "anthropic.claude-3-sonnet-20240229-v1:0",
        "generated_at": "2024-09-19T00:00:00Z",
        "hash": session.version_options_hash,
        "raw": {"content": [{"type": "text", "text": "stale"}]},
    }
    db_session.flush()

    stub = patch_bedrock(
        RecordingBedrockClient(responses=[{"content": [{"type": "text", "text": "fresh"}]}])
    )

    response = client.post(
        f"/sessions/{session.session_code}/llm",
        json={"force_regenerate": True, "model": "anthropic.claude-3"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()

    assert payload["model"] == "anthropic.claude-3"
    assert payload["llm_result"]["raw"]["content"][0]["text"] == "fresh"
    assert stub.calls[0][0] == "anthropic.claude-3"


def test_execute_llm_no_answers_returns_error(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, _ = _prepare_session(db_session)
    db_session.execute(delete(AnswerChoice).where(AnswerChoice.session_id == session.id))
    db_session.flush()

    patch_bedrock(RecordingBedrockClient(responses=[]))
    response = client.post(f"/sessions/{session.session_code}/llm", json={})

    assert response.status_code == ErrorCode.DIAGNOSTICS_NO_ANSWERS.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_NO_ANSWERS.value


def test_execute_llm_missing_system_prompt_returns_error(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, _ = _prepare_session(db_session)
    version = db_session.get(DiagnosticVersion, session.version_id)
    version.system_prompt = None
    db_session.flush()

    patch_bedrock(RecordingBedrockClient(responses=[]))
    response = client.post(f"/sessions/{session.session_code}/llm", json={})

    assert response.status_code == ErrorCode.DIAGNOSTICS_SYSTEM_PROMPT_MISSING.http_status
    payload = response.json()
    assert payload["error"]["code"] == ErrorCode.DIAGNOSTICS_SYSTEM_PROMPT_MISSING.value


def test_execute_llm_missing_llm_op_returns_error(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, version_option = _prepare_session(db_session)
    version_option.llm_op = None
    db_session.flush()

    patch_bedrock(RecordingBedrockClient(responses=[]))
    response = client.post(f"/sessions/{session.session_code}/llm", json={})

    assert response.status_code == ErrorCode.DIAGNOSTICS_LLM_OP_INCOMPLETE.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_LLM_OP_INCOMPLETE.value


def test_execute_llm_bedrock_failure_returns_error(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, _ = _prepare_session(db_session)
    error = RuntimeError("bedrock down")
    stub = RecordingBedrockClient(responses=[error, error])
    patch_bedrock(stub)

    response = client.post(f"/sessions/{session.session_code}/llm", json={})
    assert response.status_code == ErrorCode.DIAGNOSTICS_LLM_CALL_FAILED.http_status
    body = response.json()
    assert body["error"]["code"] == ErrorCode.DIAGNOSTICS_LLM_CALL_FAILED.value
    assert len(stub.calls) == 2

    db_session.refresh(session)
    assert session.llm_result is None


def test_execute_llm_uses_custom_sampling_parameters(
    client: TestClient, db_session: Session, patch_bedrock
) -> None:
    session, _ = _prepare_session(db_session)
    stub = patch_bedrock(
        RecordingBedrockClient(responses=[{"content": [{"type": "text", "text": "params"}]}])
    )

    response = client.post(
        f"/sessions/{session.session_code}/llm",
        json={"top_p": 0.55},
    )
    assert response.status_code == 200, response.text

    _, payload = stub.calls[0]
    assert "temperature" not in payload
    assert payload["top_p"] == pytest.approx(0.55)
