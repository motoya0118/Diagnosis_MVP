"""LLM execution pipeline for diagnostic sessions."""

from __future__ import annotations

import copy
import json
import logging
from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any, Protocol, cast

from sqlalchemy import Select, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.core.registry import compute_version_options_hash
from app.models.diagnostic import AnswerChoice, DiagnosticSession, DiagnosticVersion, VersionOption

from .bedrock_runtime import BedrockInvocationError, BedrockRuntimeClient
from .gemini_runtime import GeminiInvocationError, GeminiRuntimeClient

logger = logging.getLogger(__name__)

ANTHROPIC_VERSION = "bedrock-2023-05-31"
DEFAULT_MAX_TOKENS = 5000

_BEDROCK_FACTORY: Callable[[], "BedrockClientProtocol"] | None = None
_GEMINI_FACTORY: Callable[[], "GeminiRuntimeClient"] | None = None


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


class BedrockClientProtocol(Protocol):
    def invoke_model(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        ...


def create_bedrock_client() -> BedrockClientProtocol:
    """Instantiate a Bedrock runtime client using configured defaults."""

    if _BEDROCK_FACTORY is not None:
        return _BEDROCK_FACTORY()

    region = settings.bedrock_region or "ap-northeast-1"
    timeout = int(settings.bedrock_request_timeout_seconds or 30)
    return BedrockRuntimeClient(region=region, timeout_seconds=timeout)


def set_bedrock_client_factory(factory: Callable[[], BedrockClientProtocol] | None) -> None:
    """Override the Bedrock client factory (used by tests)."""

    global _BEDROCK_FACTORY
    _BEDROCK_FACTORY = factory


def create_gemini_client() -> GeminiRuntimeClient:
    """Instantiate a Gemini runtime client using configured defaults."""

    if _GEMINI_FACTORY is not None:
        return _GEMINI_FACTORY()

    api_key = settings.gemini_api_key or ""
    return GeminiRuntimeClient(api_key=api_key)


def set_gemini_client_factory(factory: Callable[[], GeminiRuntimeClient] | None) -> None:
    """Override the Gemini client factory (used by tests)."""

    global _GEMINI_FACTORY
    _GEMINI_FACTORY = factory


def _current_llm_provider() -> str:
    mode_value = (getattr(settings, "mode", None) or "").strip().lower()
    if mode_value == "gemini":
        return "gemini"
    return "bedrock"


def _document_provider(document: Any) -> str:
    if isinstance(document, dict):
        stored = document.get("provider") or "bedrock"
    else:
        stored = "bedrock"
    return str(stored).strip().lower() or "bedrock"


def _load_session(db: Session, session_code: str) -> DiagnosticSession:
    stmt: Select[DiagnosticSession] = (
        select(DiagnosticSession)
        .options(joinedload(DiagnosticSession.version))
        .where(DiagnosticSession.session_code == session_code)
    )
    session = db.execute(stmt).scalar_one_or_none()
    if session is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND)
    if session.version is None:  # pragma: no cover - defensive guard
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)
    return session


def _load_answer_payload(db: Session, session_id: int) -> tuple[list[int], list[Any]]:
    stmt = (
        select(AnswerChoice.version_option_id, VersionOption.llm_op)
        .join(VersionOption, VersionOption.id == AnswerChoice.version_option_id)
        .where(AnswerChoice.session_id == session_id)
        .order_by(AnswerChoice.id)
    )
    rows = db.execute(stmt).all()
    if not rows:
        raise_app_error(ErrorCode.DIAGNOSTICS_NO_ANSWERS)

    option_ids: list[int] = []
    llm_ops: list[Any] = []
    for option_id, llm_op in rows:
        if llm_op is None:
            raise_app_error(ErrorCode.DIAGNOSTICS_LLM_OP_INCOMPLETE)
        option_ids.append(option_id)
        llm_ops.append(llm_op)
    return option_ids, llm_ops


def _isoformat(dt: datetime) -> str:
    iso = dt.astimezone(timezone.utc).isoformat()
    if iso.endswith("+00:00"):
        return iso[:-6] + "Z"
    return iso


def _build_response_messages(system_prompt: str, llm_ops: list[Any]) -> tuple[list[dict[str, str]], str]:
    user_payload = json.dumps(llm_ops, ensure_ascii=False, separators=(",", ":"))
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_payload},
    ]
    return messages, user_payload


def _resolve_sampling_parameters(
    *,
    temperature: float | None,
    top_p: float | None,
    default_temperature: float | None,
    default_top_p: float | None,
    temperature_was_provided: bool,
    top_p_was_provided: bool,
) -> tuple[float | None, float | None]:
    resolved_temperature: float | None
    if temperature is not None:
        resolved_temperature = float(temperature)
    elif default_temperature is not None:
        resolved_temperature = float(default_temperature)
    else:
        resolved_temperature = None

    resolved_top_p: float | None
    if top_p is not None:
        resolved_top_p = float(top_p)
    elif default_top_p is not None:
        resolved_top_p = float(default_top_p)
    else:
        resolved_top_p = None

    if resolved_temperature is not None and resolved_top_p is not None:
        if top_p_was_provided and not temperature_was_provided:
            logger.debug("Dropping default temperature to honor `top_p` override.")
            resolved_temperature = None
        elif temperature_was_provided and not top_p_was_provided:
            logger.debug("Dropping default top_p to honor `temperature` override.")
            resolved_top_p = None
        elif not temperature_was_provided and not top_p_was_provided:
            resolved_top_p = None
        else:
            logger.warning(
                "Both temperature and top_p were provided; dropping top_p to satisfy Bedrock constraints."
            )
            resolved_top_p = None
    return resolved_temperature, resolved_top_p


def _build_bedrock_payload(
    *,
    system_prompt: str,
    user_payload: str,
    temperature: float | None,
    top_p: float | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "anthropic_version": ANTHROPIC_VERSION,
        # Bedrock inference profiles expect the Claude `system` field as a raw string.
        # Single string works for both the legacy and the Messages APIs, so we avoid
        # the richer block structure here for compatibility.
        "system": system_prompt,
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": user_payload}]},
        ],
        "max_tokens": DEFAULT_MAX_TOKENS,
    }
    if temperature is not None:
        payload["temperature"] = temperature
    if top_p is not None:
        payload["top_p"] = top_p
    return payload


def _select_invocation_model_id(requested_model: str) -> str:
    """Resolve the actual Bedrock identifier used for invocation.

    Some Claude variants are only accessible via an inference profile. When a
    default inference profile is configured, translate requests that reference
    the logical default model to that profile identifier.
    """

    normalized = (requested_model or "").strip()
    if not normalized:
        return normalized

    default_model = (settings.bedrock_default_model or "").strip()
    override_profile = (getattr(settings, "bedrock_default_inference_profile", None) or "").strip()

    if override_profile and normalized == default_model:
        return override_profile

    return normalized


def call_session_llm(
    db: Session,
    *,
    session_code: str,
    model_id: str | None,
    temperature: float | None,
    top_p: float | None,
    force_regenerate: bool,
    bedrock_client: BedrockClientProtocol | None = None,
    gemini_client: GeminiRuntimeClient | None = None,
    now_provider: Callable[[], datetime] = _now_utc,
    max_attempts: int = 2,
) -> dict[str, Any]:
    """Execute or reuse an LLM result for the given session."""

    session = _load_session(db, session_code)
    version = cast(DiagnosticVersion, session.version)

    if version.src_hash is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_FROZEN)

    system_prompt = (version.system_prompt or "").strip()
    if not system_prompt:
        raise_app_error(ErrorCode.DIAGNOSTICS_SYSTEM_PROMPT_MISSING)

    option_ids, llm_ops = _load_answer_payload(db, session.id)
    current_hash = compute_version_options_hash(version.id, option_ids)

    if session.version_options_hash != current_hash:
        session.version_options_hash = current_hash

    messages, user_payload = _build_response_messages(system_prompt, llm_ops)
    provider = _current_llm_provider()

    if provider == "gemini":
        default_model = (getattr(settings, "gemini_default_model", None) or "").strip()
        effective_model = (model_id or default_model).strip() or "gemini-3-flash-preview"
        invocation_model_id = effective_model
        default_temperature = cast(float | None, getattr(settings, "gemini_default_temperature", None))
        default_top_p = cast(float | None, getattr(settings, "gemini_default_top_p", None))
        effective_temperature = (
            float(temperature)
            if temperature is not None
            else (float(default_temperature) if default_temperature is not None else None)
        )
        effective_top_p = (
            float(top_p)
            if top_p is not None
            else (float(default_top_p) if default_top_p is not None else None)
        )
    else:
        effective_model = (model_id or settings.bedrock_default_model or "").strip() or "anthropic.claude-3-sonnet-20240229-v1:0"
        invocation_model_id = _select_invocation_model_id(effective_model)
        if invocation_model_id != effective_model:
            logger.debug(
                "Routing model '%s' invocation through inference profile '%s'",
                effective_model,
                invocation_model_id,
            )
        temperature_specified = temperature is not None
        top_p_specified = top_p is not None

        default_temperature = cast(float | None, getattr(settings, "bedrock_default_temperature", None))
        default_top_p = cast(float | None, getattr(settings, "bedrock_default_top_p", None))

        effective_temperature, effective_top_p = _resolve_sampling_parameters(
            temperature=cast(float | None, temperature),
            top_p=cast(float | None, top_p),
            default_temperature=default_temperature,
            default_top_p=default_top_p,
            temperature_was_provided=temperature_specified,
            top_p_was_provided=top_p_specified,
        )

    # Attempt to reuse cached results when force regeneration is not requested.
    cached_result: dict[str, Any] | None = None
    if not force_regenerate:
        if session.llm_result:
            stored_hash = session.llm_result.get("hash") or session.version_options_hash
            if stored_hash == current_hash and _document_provider(session.llm_result) == provider:
                cached_result = copy.deepcopy(session.llm_result)
        if cached_result is None:
            reuse_stmt = (
                select(DiagnosticSession.llm_result)
                .where(
                    DiagnosticSession.version_id == session.version_id,
                    DiagnosticSession.version_options_hash == current_hash,
                    DiagnosticSession.llm_result.is_not(None),
                )
                .order_by(DiagnosticSession.updated_at.desc())
                .limit(1)
            )
            candidate = db.execute(reuse_stmt).scalar_one_or_none()
            if candidate is not None and _document_provider(candidate) == provider:
                cached_result = copy.deepcopy(candidate)
                session.llm_result = copy.deepcopy(cached_result)

    result_document: dict[str, Any] | None = cached_result

    if result_document is None:
        attempt = 0
        last_error: Exception | None = None
        while attempt < max_attempts:
            attempt += 1
            try:
                if provider == "gemini":
                    if gemini_client is None:
                        gemini_client = create_gemini_client()
                    raw_result = gemini_client.generate_content(
                        model=invocation_model_id,
                        system_instruction=system_prompt,
                        user_payload=user_payload,
                        temperature=effective_temperature,
                        top_p=effective_top_p,
                    )
                    if not raw_result:
                        raise GeminiInvocationError("Gemini returned an empty payload")
                else:
                    if bedrock_client is None:
                        bedrock_client = create_bedrock_client()
                    payload = _build_bedrock_payload(
                        system_prompt=system_prompt,
                        user_payload=user_payload,
                        temperature=effective_temperature,
                        top_p=effective_top_p,
                    )
                    raw_result = bedrock_client.invoke_model(invocation_model_id, payload)
                    if not raw_result:
                        raise BedrockInvocationError("Bedrock returned an empty payload")
                now = now_provider()
                result_document = {
                    "provider": provider,
                    "model": effective_model,
                    "invoked_model": invocation_model_id,
                    "generated_at": _isoformat(now),
                    "temperature": effective_temperature,
                    "top_p": effective_top_p,
                    "hash": current_hash,
                    "option_ids": option_ids,
                    "messages": messages,
                    "raw": raw_result,
                }
                session.llm_result = copy.deepcopy(result_document)
                if session.ended_at is None:
                    session.ended_at = now
                break
            except Exception as exc:  # pragma: no cover - broad catch for retry robustness
                last_error = exc
                logger.exception(
                    "%s invocation attempt failed: session_code=%s attempt=%s",
                    provider,
                    session_code,
                    attempt,
                )
                if attempt >= max_attempts:
                    raise_app_error(ErrorCode.DIAGNOSTICS_LLM_CALL_FAILED, detail=str(exc))
        if result_document is None and last_error is not None:
            raise_app_error(ErrorCode.DIAGNOSTICS_LLM_CALL_FAILED, detail=str(last_error))
    else:
        cached_now = now_provider()
        if session.llm_result is None:
            session.llm_result = copy.deepcopy(result_document)
        if session.ended_at is None:
            session.ended_at = cached_now
        # Ensure cached documents have required metadata
        result_document.setdefault("provider", provider)
        result_document.setdefault("model", effective_model)
        result_document.setdefault("invoked_model", invocation_model_id)
        result_document.setdefault("generated_at", _isoformat(cached_now))
        if "messages" not in result_document:
            result_document["messages"] = messages
        if "hash" not in result_document:
            result_document["hash"] = current_hash
        session.llm_result = copy.deepcopy(result_document)

    db.flush()

    response_llm_result = {
        "raw": copy.deepcopy(result_document.get("raw")),
        "generated_at": result_document.get("generated_at"),
    }

    return {
        "session_code": session.session_code,
        "version_id": session.version_id,
        "model": result_document.get("model", effective_model),
        "messages": messages,
        "llm_result": response_llm_result,
    }


__all__ = [
    "BedrockClientProtocol",
    "call_session_llm",
    "create_bedrock_client",
    "set_bedrock_client_factory",
    "create_gemini_client",
    "set_gemini_client_factory",
]
