from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Sequence

import secrets
from jose import JWTError, jwt
from passlib.context import CryptContext

from .errors import ErrorCode
from .exceptions import raise_app_error
from .config import settings


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@dataclass(slots=True)
class TokenClaims:
    subject: str
    roles: set[str]
    payload: dict[str, Any]


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, expires_delta_minutes: Optional[int] = None, extra: Optional[dict[str, Any]] = None) -> str:
    expire_minutes = expires_delta_minutes or settings.access_token_expire_minutes
    to_encode: dict[str, Any] = {"sub": subject, "exp": datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)}
    if extra:
        to_encode.update(extra)
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_refresh_token(subject: str, expires_delta_days: Optional[int] = None) -> tuple[str, datetime]:
    """
    Generate an opaque, high-entropy refresh token.
    - Not a JWT; use a random URL-safe string so it cannot be predicted or forged.
    - Token value is stored in DB and matched verbatim on refresh/logout.
    """
    days = expires_delta_days or settings.refresh_token_expire_days
    expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    # ~384 bits of entropy; base64url without padding
    token = secrets.token_urlsafe(48)
    return token, expires_at


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])


def _normalize_roles(payload: dict[str, Any]) -> set[str]:
    roles: set[str] = set()
    raw_roles = payload.get("roles")
    if isinstance(raw_roles, str):
        roles.add(raw_roles)
    elif isinstance(raw_roles, Sequence):
        for role in raw_roles:
            if isinstance(role, str):
                roles.add(role)
            else:
                roles.add(str(role))

    single_role = payload.get("role")
    if isinstance(single_role, str):
        roles.add(single_role)
    elif single_role not in (None, ""):
        roles.add(str(single_role))

    normalized = {value.strip().lower() for value in roles if str(value).strip()}
    if not normalized:
        return {"user"}
    return normalized


def validate_jwt_token(
    token: str,
    *,
    required_roles: set[str] | None = None,
    error_on_invalid: ErrorCode = ErrorCode.COMMON_UNAUTHENTICATED,
    error_on_expired: ErrorCode | None = None,
    error_on_forbidden: ErrorCode = ErrorCode.COMMON_PERMISSION_DENIED,
) -> TokenClaims:
    """Validate JWT signature, expiration, and role membership.

    Returns a normalized claim set (`sub`, `roles`, `payload`) or raises an application error.
    """

    if not token:
        raise_app_error(error_on_invalid)

    error_on_expired = error_on_expired or error_on_invalid

    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"verify_aud": False, "verify_exp": False},
        )
    except JWTError:
        raise_app_error(error_on_invalid)

    if not isinstance(payload, dict):
        raise_app_error(error_on_invalid)

    exp_raw = payload.get("exp")
    if exp_raw is None:
        raise_app_error(error_on_invalid)
    try:
        exp_value = int(exp_raw)
    except (TypeError, ValueError):
        raise_app_error(error_on_invalid)

    expires_at = datetime.fromtimestamp(exp_value, tz=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise_app_error(error_on_expired)

    subject = payload.get("sub")
    if subject in (None, ""):
        raise_app_error(error_on_invalid)
    subject_str = str(subject)

    roles = _normalize_roles(payload)
    if required_roles:
        if roles.isdisjoint(required_roles):
            raise_app_error(error_on_forbidden)

    return TokenClaims(subject=subject_str, roles=roles, payload=dict(payload))
