from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, model_validator


class UserSubmitAnswersRequest(BaseModel):
    """Request payload for posting answer choices to a diagnostic session."""

    version_option_ids: list[int]
    answered_at: datetime | None = None

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def _validate_option_ids(self) -> "UserSubmitAnswersRequest":
        ids = list(self.version_option_ids)
        if not ids:
            raise ValueError("version_option_ids must not be empty")
        if len(ids) > 20:
            raise ValueError("version_option_ids must contain at most 20 items")

        seen: set[int] = set()
        normalised: list[int] = []
        for value in ids:
            if not isinstance(value, int):
                raise ValueError("version_option_ids must contain integers")
            if value <= 0:
                raise ValueError("version_option_ids must be positive integers")
            if value in seen:
                raise ValueError("version_option_ids must be unique")
            seen.add(value)
            normalised.append(value)

        self.version_option_ids = normalised
        return self


class UserCallLlmRequest(BaseModel):
    """Request payload for executing an LLM run for a session."""

    model: str | None = None
    temperature: float | None = None
    top_p: float | None = None
    force_regenerate: bool = False

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def _validate_ranges(self) -> "UserCallLlmRequest":
        def _validate_range(name: str, value: float | None) -> None:
            if value is None:
                return
            if not (0.0 <= value <= 1.0):
                raise ValueError(f"{name} must be between 0 and 1")

        _validate_range("temperature", self.temperature)
        _validate_range("top_p", self.top_p)
        return self


class LlmMessage(BaseModel):
    role: Literal["system", "user"]
    content: str


class UserCallLlmResult(BaseModel):
    raw: Any
    generated_at: str


class UserCallLlmResponse(BaseModel):
    session_code: str
    version_id: int
    model: str
    messages: list[LlmMessage]
    llm_result: UserCallLlmResult


class SessionOutcome(BaseModel):
    outcome_id: int
    sort_order: int
    meta: dict[str, Any] | None = None


class UserGetSessionResponse(BaseModel):
    """Response payload for retrieving a session's public information."""

    version_id: int
    outcomes: list[SessionOutcome]
    llm_result: UserCallLlmResult | None


__all__ = [
    "LlmMessage",
    "UserCallLlmRequest",
    "UserCallLlmResponse",
    "UserCallLlmResult",
    "SessionOutcome",
    "UserGetSessionResponse",
    "UserSubmitAnswersRequest",
]
