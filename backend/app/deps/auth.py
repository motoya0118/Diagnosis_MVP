from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import raise_app_error
from app.core.errors import ErrorCode
from app.core.security import validate_jwt_token
from app.db.session import SessionLocal
from app.models.user import User


security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)


def _resolve_user(token: str, db: Session) -> User:
    claims = validate_jwt_token(
        token,
        required_roles={"user", "admin"},
        error_on_invalid=ErrorCode.AUTH_INVALID_TOKEN,
        error_on_expired=ErrorCode.AUTH_INVALID_TOKEN,
        error_on_forbidden=ErrorCode.COMMON_PERMISSION_DENIED,
    )

    try:
        user_id = int(claims.subject)
    except (TypeError, ValueError):
        raise_app_error(ErrorCode.AUTH_INVALID_TOKEN)

    user = db.get(User, user_id)
    if not user:
        raise_app_error(ErrorCode.AUTH_USER_NOT_FOUND)
    return user


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    token = credentials.credentials
    return _resolve_user(token, db)


def get_optional_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    token = credentials.credentials
    return _resolve_user(token, db)


__all__ = [
    "get_db",
    "get_current_user",
    "get_optional_current_user",
    "security",
    "optional_security",
]
