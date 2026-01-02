"""Minimal Amazon Bedrock sample that calls Claude 3 Sonnet via boto3."""

from __future__ import annotations

import argparse
import json
import os
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError


MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "jp.anthropic.claude-sonnet-4-5-20250929-v1:0")
INFERENCE_PROFILE_ID = (
    os.environ.get("BEDROCK_INFERENCE_PROFILE_ID")
    or "jp.anthropic.claude-sonnet-4-5-20250929-v1:0"
)
DEFAULT_REGION = os.environ.get("BEDROCK_REGION", "ap-northeast-1")
DEFAULT_PROMPT = "Avanti backend sampleより、ご挨拶メッセージを生成してください。"


def _create_payload(prompt: str, max_tokens: int, temperature: float) -> dict[str, Any]:
    return {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": [
            {
                "role": "user",
                "content": [{"type": "text", "text": prompt}],
            }
        ],
    }


def invoke_claude(
    prompt: str,
    *,
    region: str = DEFAULT_REGION,
    max_tokens: int = 512,
    temperature: float = 0.2,
) -> dict[str, Any]:
    client = boto3.client("bedrock-runtime", region_name=region)
    invocation_target = INFERENCE_PROFILE_ID or MODEL_ID
    response = client.invoke_model(
        modelId=invocation_target,
        contentType="application/json",
        accept="application/json",
        body=json.dumps(_create_payload(prompt, max_tokens, temperature)),
    )
    if INFERENCE_PROFILE_ID:
        print(f"Invoked via inference profile: {invocation_target}")

    body = response.get("body")
    if hasattr(body, "read"):
        body = body.read()
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    if not body:
        raise RuntimeError("Empty response body from Bedrock.")
    return json.loads(body)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Invoke Anthropic Claude Sonnet 4.5 on Amazon Bedrock using boto3."
    )
    parser.add_argument(
        "prompt",
        nargs="?",
        default=DEFAULT_PROMPT,
        help="Prompt to send to Claude (default: %(default)s)",
    )
    parser.add_argument(
        "--region",
        default=DEFAULT_REGION,
        help=f"Bedrock region (default: {DEFAULT_REGION})",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=512,
        help="Maximum tokens to generate.",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.2,
        help="Sampling temperature.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        result = invoke_claude(
            args.prompt,
            region=args.region,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
        )
    except (BotoCoreError, ClientError) as exc:
        print(f"Bedrock request failed: {exc}")
        return 1
    except RuntimeError as exc:
        print(f"Error: {exc}")
        return 1

    for block in result.get("content", []):
        if block.get("type") == "text":
            print(block.get("text", "").strip())
            return 0

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
