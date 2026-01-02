from __future__ import annotations

import os

import pytest

from dotenv import load_dotenv

RUN_SAMPLE = os.getenv("RUN_GEMINI_SAMPLE") == "1"

pytestmark = pytest.mark.skipif(not RUN_SAMPLE, reason="Gemini sample disabled; set RUN_GEMINI_SAMPLE=1 to enable.")


def test_gemini_generate_content() -> None:
    load_dotenv()

    api_key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not api_key:
        pytest.skip("GEMINI_API_KEY is not configured; skipping Gemini integration sample.")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    model = (os.getenv("GEMINI_MODEL") or os.getenv("GEMINI_DEFAULT_MODEL") or "gemini-3-flash-preview").strip()
    response = client.models.generate_content(
        model=model,
        config=types.GenerateContentConfig(system_instruction="あなたは猫です。名前はマルゲリータです。"),
        contents="こんにちわ",
    )

    assert response is not None
