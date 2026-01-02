"""Utility script to exercise the diagnostics Bedrock runtime client."""

from __future__ import annotations

import argparse
import json
from typing import Any

from app.core.config import settings
from app.services.diagnostics.bedrock_runtime import BedrockRuntimeClient, BedrockInvocationError
from app.services.diagnostics.llm_executor import (
    _build_bedrock_payload,
    _resolve_sampling_parameters,
    _select_invocation_model_id,
)


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call Amazon Bedrock using the diagnostics runtime client."
    )
    parser.add_argument(
        "--model",
        default=settings.bedrock_default_model or "anthropic.claude-3-sonnet-20240229-v1:0",
        help="Bedrock model or inference profile identifier.",
    )
    parser.add_argument(
        "--system-prompt",
        default="You are Claude Sonnet 4.5 responding in Japanese.",
        help="System prompt passed to the model.",
    )
    parser.add_argument(
        "--user-payload",
        default='[{"message": "疎通テストです。応答してください。"}]',
        help="JSON string payload sent as the user message.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=None,
        help="Sampling temperature (default: project setting or provider default).",
    )
    parser.add_argument(
        "--top-p",
        type=float,
        default=None,
        help="Top-p nucleus sampling value (default: project setting or provider default).",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=settings.bedrock_request_timeout_seconds or 30,
        help="Request timeout in seconds.",
    )
    parser.add_argument(
        "--region",
        default=settings.bedrock_region or "ap-northeast-1",
        help="Bedrock region.",
    )
    parser.add_argument(
        "--show-request",
        action="store_true",
        help="Print the outgoing payload before sending.",
    )
    return parser.parse_args()


def _main() -> int:
    args = _parse_args()

    client = BedrockRuntimeClient(region=args.region, timeout_seconds=args.timeout)
    default_temperature = getattr(settings, "bedrock_default_temperature", None)
    default_top_p = getattr(settings, "bedrock_default_top_p", None)

    resolved_temperature, resolved_top_p = _resolve_sampling_parameters(
        temperature=args.temperature,
        top_p=args.top_p,
        default_temperature=default_temperature,
        default_top_p=default_top_p,
        temperature_was_provided=args.temperature is not None,
        top_p_was_provided=args.top_p is not None,
    )

    payload = _build_bedrock_payload(
        system_prompt=args.system_prompt,
        user_payload=args.user_payload,
        temperature=resolved_temperature,
        top_p=resolved_top_p,
    )

    if args.show_request:
        print("=== Request Payload ===")
        print(json.dumps(payload, ensure_ascii=False, indent=2))

    try:
        invocation_model_id = _select_invocation_model_id(args.model)
        response: dict[str, Any] = client.invoke_model(invocation_model_id, payload)
        if invocation_model_id != args.model:
            print(f"Invoked via inference profile: {invocation_model_id}")
    except BedrockInvocationError as exc:
        print(f"Bedrock invocation failed: {exc}")
        return 1

    print("=== Bedrock Response ===")
    print(json.dumps(response, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
