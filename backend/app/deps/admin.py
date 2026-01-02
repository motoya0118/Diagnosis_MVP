from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import raise_app_error
from app.core.errors import ErrorCode
from app.core.security import validate_jwt_token
from app.db.session import SessionLocal
from app.models.admin_user import AdminUser


security = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> AdminUser:
    token = credentials.credentials
    claims = validate_jwt_token(
        token,
        required_roles={"admin"},
        error_on_invalid=ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_INVALID,
        error_on_expired=ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_INVALID,
        error_on_forbidden=ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_SCOPE_INVALID,
    )

    try:
        admin_id = int(claims.subject)
    except (TypeError, ValueError):
        raise_app_error(ErrorCode.ADMIN_AUTH_ADMIN_TOKEN_INVALID)

    admin = db.get(AdminUser, admin_id)
    if not admin or not admin.is_active:
        raise_app_error(ErrorCode.ADMIN_AUTH_ADMIN_NOT_FOUND_OR_INACTIVE)
    return admin


__all__ = ["get_current_admin", "get_db", "security"]
