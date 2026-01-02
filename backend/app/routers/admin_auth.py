from datetime import datetime, timezone
import hashlib

from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, update as sa_update
from sqlalchemy.orm import Session

from app.core.exceptions import raise_app_error
from app.core.errors import ErrorCode
from app.core.security import create_access_token, create_refresh_token, verify_password
from app.deps import admin as admin_deps
from app.models.admin_refresh_token import AdminRefreshToken
from app.models.admin_user import AdminUser
from app.schemas.admin_auth import (
    AdminLoginRequest,
    AdminRefreshRequest,
    AdminTokenResponse,
    AdminUserOut,
)


TOKEN_EXPIRE_MINUTES = 15
router = APIRouter(prefix="/admin_auth", tags=["admin_auth"])


def _hash_rt(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _to_aware_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def issue_admin_tokens(
    admin: AdminUser,
    db: Session,
    *,
    record_refresh: bool = True,
    device_id: str | None = None,
) -> AdminTokenResponse:
    issued_at = datetime.now(timezone.utc)
    access_token = create_access_token(
        str(admin.id),
        expires_delta_minutes=TOKEN_EXPIRE_MINUTES,
        extra={
            "role": "admin",
            "user_id": admin.user_id,
        },
    )
    refresh_token = None
    if record_refresh:
        refresh_token, expires_at = create_refresh_token(str(admin.id))
        db.add(
            AdminRefreshToken(
                admin_id=admin.id,
                rt_hash=_hash_rt(refresh_token),
                device_id=device_id,
                expires_at=expires_at,
            ),
        )
        db.commit()

    return AdminTokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=TOKEN_EXPIRE_MINUTES * 60,
        issued_at=issued_at,
    )


@router.post("/login", response_model=AdminTokenResponse)
def admin_login(
    payload: AdminLoginRequest,
    request: Request,
    db: Session = Depends(admin_deps.get_db),
) -> AdminTokenResponse:
    admin = db.scalar(select(AdminUser).where(AdminUser.user_id == payload.user_id))
    if not admin or not admin.is_active:
        raise_app_error(ErrorCode.ADMIN_AUTH_INVALID_ADMIN_CREDENTIALS)

    if not verify_password(payload.password, admin.hashed_password):
        raise_app_error(ErrorCode.ADMIN_AUTH_INVALID_ADMIN_CREDENTIALS)

    device_id = payload.device_id or request.headers.get("X-Device-Id")
    return issue_admin_tokens(admin, db, record_refresh=payload.remember_me, device_id=device_id)


@router.post("/refresh", response_model=AdminTokenResponse)
def refresh_token(
    payload: AdminRefreshRequest,
    request: Request,
    db: Session = Depends(admin_deps.get_db),
) -> AdminTokenResponse:
    rt_hash = _hash_rt(payload.refresh_token)
    token_row = db.scalar(select(AdminRefreshToken).where(AdminRefreshToken.rt_hash == rt_hash))
    if not token_row:
        raise_app_error(ErrorCode.ADMIN_AUTH_REFRESH_TOKEN_INVALID)

    if token_row.revoked:
        raise_app_error(ErrorCode.ADMIN_AUTH_REFRESH_TOKEN_REVOKED)

    req_device_id = payload.device_id or request.headers.get("X-Device-Id")
    if token_row.device_id and req_device_id and token_row.device_id != req_device_id:
        db.execute(
            sa_update(AdminRefreshToken)
            .where(AdminRefreshToken.admin_id == token_row.admin_id)
            .values(revoked=True)
        )
        db.commit()
        raise_app_error(ErrorCode.ADMIN_AUTH_REFRESH_DEVICE_MISMATCH)

    if _to_aware_utc(token_row.expires_at) <= datetime.now(timezone.utc):
        token_row.revoked = True
        db.commit()
        raise_app_error(ErrorCode.ADMIN_AUTH_REFRESH_TOKEN_EXPIRED)

    admin = db.get(AdminUser, token_row.admin_id)
    if not admin or not admin.is_active:
        raise_app_error(ErrorCode.ADMIN_AUTH_ADMIN_NOT_FOUND_OR_INACTIVE)

    token_row.revoked = True
    db.commit()
    return issue_admin_tokens(admin, db, record_refresh=True, device_id=token_row.device_id)


@router.post("/logout")
def logout(
    payload: AdminRefreshRequest,
    request: Request,
    db: Session = Depends(admin_deps.get_db),
):
    rt_hash = _hash_rt(payload.refresh_token)
    token_row = db.scalar(select(AdminRefreshToken).where(AdminRefreshToken.rt_hash == rt_hash))
    if not token_row:
        return {"detail": "Already logged out"}

    req_device_id = payload.device_id or request.headers.get("X-Device-Id")
    if token_row.device_id and req_device_id and token_row.device_id != req_device_id:
        return {"detail": "Already logged out"}

    token_row.revoked = True
    db.commit()
    return {"detail": "Logged out"}


@router.post("/logout_all")
def logout_all(
    current_admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
):
    db.execute(
        sa_update(AdminRefreshToken)
        .where(AdminRefreshToken.admin_id == current_admin.id)
        .values(revoked=True)
    )
    db.commit()
    return {"detail": "All sessions revoked"}


@router.get("/me", response_model=AdminUserOut)
def get_me(current_admin: AdminUser = Depends(admin_deps.get_current_admin)) -> AdminUserOut:
    return current_admin
