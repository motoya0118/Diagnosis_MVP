from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict


class AdminLoginRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)
    remember_me: bool = True
    device_id: str | None = None


class AdminTokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in: int
    issued_at: datetime | None = None


class AdminUserOut(BaseModel):
    id: int
    user_id: str
    display_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class AdminRefreshRequest(BaseModel):
    refresh_token: str
    device_id: str | None = None
