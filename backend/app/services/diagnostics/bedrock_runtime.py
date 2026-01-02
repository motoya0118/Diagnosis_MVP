"""Thin wrapper around Amazon Bedrock runtime client for diagnostics workflows."""

from __future__ import annotations

import json
import logging
from typing import Any

try:  # pragma: no cover - dependency may be unavailable in test environments
    import boto3
    from botocore.config import Config
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:  # pragma: no cover - boto3 not installed
    boto3 = None  # type: ignore[assignment]
    Config = None  # type: ignore[assignment]
    BotoCoreError = ClientError = Exception  # type: ignore[misc]

logger = logging.getLogger(__name__)


class BedrockInvocationError(RuntimeError):
    """Raised when the Bedrock runtime returns an error or an invalid payload."""


class BedrockRuntimeClient:
    """Minimal Bedrock runtime client that operates with JSON payloads."""

    def __init__(self, *, region: str, timeout_seconds: int) -> None:
        if boto3 is None or Config is None:
            raise BedrockInvocationError("boto3 is required to invoke Amazon Bedrock")

        if timeout_seconds <= 0:
            timeout_seconds = 30

        config = Config(
            region_name=region,
            read_timeout=timeout_seconds,
            connect_timeout=timeout_seconds,
        )
        self._client = boto3.client("bedrock-runtime", config=config)

    def invoke_model(self, model_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        """Invoke a Bedrock model and return the parsed JSON response."""

        requested_model = (model_id or "").strip()
        if not requested_model:
            raise BedrockInvocationError("Bedrock model identifier must be non-empty")

        body = json.dumps(payload, ensure_ascii=False)
        try:
            response = self._client.invoke_model(
                modelId=requested_model,
                body=body,
                contentType="application/json",
                accept="application/json",
            )
        except (BotoCoreError, ClientError) as exc:
            logger.exception("Bedrock invocation failed: model=%s", requested_model)
            raise BedrockInvocationError("Bedrock invocation failed") from exc

        stream = response.get("body")
        if hasattr(stream, "read"):
            raw = stream.read()
        else:
            raw = stream
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")

        if not raw:
            raise BedrockInvocationError("Bedrock returned an empty response body")

        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise BedrockInvocationError("Failed to decode Bedrock response body") from exc


__all__ = ["BedrockInvocationError", "BedrockRuntimeClient"]
