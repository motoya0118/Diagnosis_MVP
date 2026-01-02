from __future__ import annotations

import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _determine_env_file() -> str:
    env_name = os.getenv("ENV", "development")
    candidate = Path(__file__).resolve().parent.parent.parent / f".env.{env_name}"
    if candidate.exists():
        return str(candidate)
    # fallback to legacy `.env`
    legacy = Path(__file__).resolve().parent.parent.parent / ".env"
    return str(legacy)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_determine_env_file(), case_sensitive=False, extra="ignore")
    # General
    app_name: str = "Auth API"
    environment: str = "development"
    mode: str = "bedrock"

    # Database
    database_url: str = "mysql+pymysql://user:password@localhost:3306/app"

    # Security
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60  # 1 hour
    refresh_token_expire_days: int = 7     # 1 week

    # OAuth - GitHub
    github_client_id: str | None = None
    github_client_secret: str | None = None
    github_redirect_uri: str | None = None

    # CORS
    cors_allowed_origins: str | None = None  # comma-separated list

    # Bedrock / LLM
    bedrock_region: str | None = None
    bedrock_default_model: str = "anthropic.claude-3-sonnet-20240229-v1:0"
    bedrock_default_inference_profile: str | None = None
    bedrock_default_temperature: float = 0.2
    bedrock_default_top_p: float = 0.95
    bedrock_request_timeout_seconds: int = 180
    gemini_api_key: str | None = None
    gemini_default_model: str = "gemini-3-flash-preview"
    gemini_default_temperature: float = 0.2
    gemini_default_top_p: float = 0.95

    # Diagnostics
    diagnostics_allow_fallback_version: bool = False

settings = Settings()
