from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict, model_validator

from app.services.diagnostics.session_reader import SESSION_CODE_PATTERN


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True
    device_id: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = True
    device_id: str | None = None


class OAuthGithubRequest(BaseModel):
    code: str | None = None
    access_token: str | None = None
    remember_me: bool = True
    device_id: str | None = None


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int | None = None


class RefreshRequest(BaseModel):
    refresh_token: str
    device_id: str | None = None


class LogoutRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class LinkSessionRequest(BaseModel):
    session_codes: list[str]

    model_config = ConfigDict(extra="ignore")

    @model_validator(mode="after")
    def _validate_session_codes(self) -> "LinkSessionRequest":
        codes = list(self.session_codes)
        if not codes:
            raise ValueError("session_codes must not be empty")
        if len(codes) > 20:
            raise ValueError("session_codes must contain at most 20 items")

        unique: list[str] = []
        seen: set[str] = set()
        for entry in codes:
            if not isinstance(entry, str):
                raise ValueError("session_codes must contain strings")
            value = entry.strip()
            if not value:
                raise ValueError("session_codes must not contain blank values")
            if not SESSION_CODE_PATTERN.fullmatch(value):
                raise ValueError("session_codes must match required pattern")
            if value in seen:
                continue
            seen.add(value)
            unique.append(value)

        self.session_codes = unique
        return self


class LinkSessionResponse(BaseModel):
    linked: list[str]
    already_linked: list[str]
