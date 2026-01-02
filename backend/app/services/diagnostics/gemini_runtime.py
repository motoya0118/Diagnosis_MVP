"""Thin wrapper around Google Gemini runtime client for diagnostics workflows."""

from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

try:  # pragma: no cover - dependency may be unavailable in some environments
    from google import genai
    from google.genai import types
except ImportError:  # pragma: no cover - google-genai not installed
    genai = None  # type: ignore[assignment]
    types = None  # type: ignore[assignment]


class GeminiInvocationError(RuntimeError):
    """Raised when the Gemini runtime returns an error or an invalid payload."""


def _serialise_response(response: Any) -> dict[str, Any]:
    if response is None:
        raise GeminiInvocationError("Gemini returned an empty payload")

    if hasattr(response, "model_dump"):
        try:
            data = response.model_dump()
            if isinstance(data, dict):
                return data
        except TypeError:  # pragma: no cover - defensive
            pass
    if hasattr(response, "to_dict"):
        try:
            data = response.to_dict()
            if isinstance(data, dict):
                return data
        except (TypeError, ValueError):  # pragma: no cover - defensive
            pass
    if hasattr(response, "model_dump_json"):
        try:
            raw = response.model_dump_json()
            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")
            return json.loads(raw)
        except (TypeError, ValueError):  # pragma: no cover - defensive
            pass
    if hasattr(response, "to_json"):
        try:
            raw_json = response.to_json()
            if isinstance(raw_json, bytes):
                raw_json = raw_json.decode("utf-8")
            return json.loads(raw_json)
        except (TypeError, ValueError):  # pragma: no cover - defensive
            pass

    text_value = getattr(response, "text", None)
    return {"text": text_value if text_value is not None else str(response)}


class GeminiRuntimeClient:
    """Minimal Gemini runtime client that operates with JSON payloads."""

    def __init__(self, *, api_key: str) -> None:
        if genai is None:
            raise GeminiInvocationError("google-genai is required to invoke Gemini")

        api_key = (api_key or "").strip()
        if not api_key:
            raise GeminiInvocationError("Gemini API key must be configured")

        self._client = genai.Client(api_key=api_key)

    def generate_content(
        self,
        *,
        model: str,
        system_instruction: str,
        user_payload: str,
        temperature: float | None,
        top_p: float | None,
    ) -> dict[str, Any]:
        requested_model = (model or "").strip()
        if not requested_model:
            raise GeminiInvocationError("Gemini model identifier must be non-empty")

        config_kwargs: dict[str, Any] = {}
        if system_instruction:
            config_kwargs["system_instruction"] = system_instruction
        if temperature is not None:
            config_kwargs["temperature"] = float(temperature)
        if top_p is not None:
            config_kwargs["top_p"] = float(top_p)

        config = None
        if config_kwargs:
            if types is None:
                raise GeminiInvocationError("Failed to load google.genai types module")
            config = types.GenerateContentConfig(**config_kwargs)

        request: dict[str, Any] = {
            "model": requested_model,
            "contents": user_payload,
        }
        if config is not None:
            request["config"] = config

        try:
            response = self._client.models.generate_content(**request)
        except Exception as exc:  # pragma: no cover - broad catch for robustness
            logger.exception("Gemini invocation failed: model=%s", requested_model)
            raise GeminiInvocationError("Gemini invocation failed") from exc

        return _serialise_response(response)


__all__ = ["GeminiInvocationError", "GeminiRuntimeClient"]
