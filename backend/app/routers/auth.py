from datetime import datetime, timezone
from typing import Any

import httpx
from authlib.integrations.httpx_client import OAuth2Client
from authlib.integrations.base_client.errors import OAuthError
from fastapi import APIRouter, Body, Depends, Request
import logging
from sqlalchemy import select, delete, update as sa_update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import BaseAppException, raise_app_error
from app.core.errors import ErrorCode
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.deps.auth import get_current_user, get_db
from app.models.user import OAuthAccount, RefreshToken, User
from app.schemas.auth import (
    LinkSessionRequest,
    LinkSessionResponse,
    LoginRequest,
    OAuthGithubRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
)
from app.services.diagnostics.session_linker import link_sessions_to_user
from pydantic import ValidationError


router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


import hashlib


def _hash_rt(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_tokens(user: User, db: Session, *, record_refresh: bool = True, device_id: str | None = None) -> TokenPair:
    access = create_access_token(str(user.id), extra={"email": user.email})
    refresh = ""
    if record_refresh:
        refresh, expires_at = create_refresh_token(str(user.id))
        db.add(RefreshToken(user_id=user.id, rt_hash=_hash_rt(refresh), device_id=device_id, expires_at=expires_at))
        db.commit()
    return TokenPair(access_token=access, refresh_token=refresh, expires_in=60 * settings.access_token_expire_minutes)


def _to_aware_utc(dt: datetime) -> datetime:
    """Normalize datetime to timezone-aware UTC for safe comparisons."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.post("/register", response_model=TokenPair)
def register(payload: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    exists = db.scalar(select(User).where(User.email == payload.email))
    if exists:
        raise_app_error(ErrorCode.AUTH_EMAIL_ALREADY_REGISTERED)
    user = User(email=payload.email, hashed_password=get_password_hash(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    device_id = payload.device_id or request.headers.get("X-Device-Id")
    return issue_tokens(user, db, record_refresh=payload.remember_me, device_id=device_id)


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user: User | None = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise_app_error(ErrorCode.AUTH_INVALID_CREDENTIALS)
    device_id = payload.device_id or request.headers.get("X-Device-Id")
    return issue_tokens(user, db, record_refresh=payload.remember_me, device_id=device_id)


@router.post("/oauth/github", response_model=TokenPair)
def oauth_github(payload: OAuthGithubRequest, request: Request, db: Session = Depends(get_db)):
    if not settings.github_client_id or not settings.github_client_secret:
        raise_app_error(ErrorCode.AUTH_GITHUB_NOT_CONFIGURED)

    token_url = "https://github.com/login/oauth/access_token"
    user_url = "https://api.github.com/user"
    emails_url = "https://api.github.com/user/emails"
    headers = {
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }

    access_token: str | None = payload.access_token
    try:
        if not access_token:
            if not payload.code:
                raise_app_error(ErrorCode.AUTH_GITHUB_CODE_REQUIRED)
            with OAuth2Client(settings.github_client_id, settings.github_client_secret, timeout=10.0) as oauth:
                token = oauth.fetch_token(
                    token_url,
                    code=payload.code,
                    grant_type="authorization_code",
                    redirect_uri=settings.github_redirect_uri,
                )
                access_token = token.get("access_token")
                if not access_token:
                    raise_app_error(ErrorCode.AUTH_GITHUB_TOKEN_MISSING)

        with OAuth2Client(settings.github_client_id, settings.github_client_secret, timeout=10.0) as oauth:
            oauth.token = {"access_token": access_token, "token_type": "Bearer"}
            gh_res = oauth.get(user_url, headers=headers)
            if gh_res.status_code != 200:
                raise_app_error(ErrorCode.AUTH_GITHUB_USER_FETCH_FAILED)
            gh = gh_res.json()
    except OAuthError as e:
        raise_app_error(ErrorCode.AUTH_GITHUB_OAUTH_ERROR, detail=f"oauth_error:{e.error}")

    provider = "github"
    provider_user_id = str(gh.get("id"))
    if not provider_user_id:
        raise_app_error(ErrorCode.AUTH_GITHUB_USER_ID_MISSING)

    # Link or create user
    account = db.scalar(
        select(OAuthAccount).where(
            OAuthAccount.provider == provider, OAuthAccount.provider_user_id == provider_user_id
        )
    )
    if account:
        user = db.get(User, account.user_id)
    else:
        # Prefer public email from /user; if missing, try /user/emails (requires user:email scope)
        email = gh.get("email")
        if not email:
            with OAuth2Client(settings.github_client_id, settings.github_client_secret, timeout=10.0) as oauth:
                oauth.token = {"access_token": access_token, "token_type": "Bearer"}
                em_res = oauth.get(emails_url, headers=headers)
                if em_res.status_code == 200:
                    emails = em_res.json() or []
                    primary = next((e["email"] for e in emails if e.get("primary") and e.get("verified")), None)
                    if not primary:
                        primary = next((e["email"] for e in emails if e.get("verified")), None)
                    email = primary or (emails[0]["email"] if emails else None)
        # If email is still unavailable, reject instead of creating a placeholder
        if not email:
            raise_app_error(
                ErrorCode.AUTH_GITHUB_EMAIL_REQUIRED,
                detail=(
                    "GitHub email not available. Please grant 'user:email' permission, "
                    "verify your email, or make a public email on GitHub."
                ),
            )
        user = db.scalar(select(User).where(User.email == email))
        if not user:
            user = User(email=email, hashed_password=get_password_hash(""))
            db.add(user)
            db.commit()
            db.refresh(user)
        db.add(OAuthAccount(user_id=user.id, provider=provider, provider_user_id=provider_user_id))
        db.commit()
    device_id = payload.device_id or request.headers.get("X-Device-Id")
    return issue_tokens(user, db, record_refresh=payload.remember_me, device_id=device_id)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    rt_hash = _hash_rt(payload.refresh_token)
    token_row: RefreshToken | None = db.scalar(select(RefreshToken).where(RefreshToken.rt_hash == rt_hash))
    if not token_row:
        raise_app_error(ErrorCode.AUTH_INVALID_REFRESH_TOKEN)
    if token_row.revoked:
        # Compromised token usage → revoke all tokens for this user and alert
        logger.warning("Revoked RT used. Clearing all sessions for user_id=%s from ip=%s", token_row.user_id, request.client.host if request.client else "-")
        db.execute(
            sa_update(RefreshToken).where(RefreshToken.user_id == token_row.user_id).values(revoked=True)
        )
        db.commit()
        raise_app_error(
            ErrorCode.AUTH_REFRESH_TOKEN_REVOKED,
            detail="Refresh token revoked. All sessions cleared.",
        )
    # If a device_id is provided or present, enforce matching
    req_device_id = payload.device_id or request.headers.get("X-Device-Id")
    if token_row.device_id and req_device_id and token_row.device_id != req_device_id:
        # Device mismatch -> revoke all for safety
        logger.warning(
            "Device mismatch on refresh. user_id=%s token_device=%s req_device=%s ip=%s",
            token_row.user_id,
            token_row.device_id,
            req_device_id,
            request.client.host if request.client else "-",
        )
        db.execute(
            sa_update(RefreshToken).where(RefreshToken.user_id == token_row.user_id).values(revoked=True)
        )
        db.commit()
        raise_app_error(
            ErrorCode.AUTH_REFRESH_DEVICE_MISMATCH,
            detail="Device mismatch. All sessions cleared.",
        )

    if _to_aware_utc(token_row.expires_at) <= datetime.now(timezone.utc):
        token_row.revoked = True
        db.commit()
        raise_app_error(ErrorCode.AUTH_REFRESH_TOKEN_EXPIRED)

    user = db.get(User, token_row.user_id)
    if not user:
        raise_app_error(ErrorCode.AUTH_USER_NOT_FOUND)

    # Rotate: revoke old and create new
    token_row.revoked = True
    db.commit()
    return issue_tokens(user, db, record_refresh=True, device_id=token_row.device_id)


@router.post("/link-session", response_model=LinkSessionResponse)
def link_session(
    raw_payload: dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LinkSessionResponse:
    try:
        payload = LinkSessionRequest.model_validate(raw_payload)
    except ValidationError:
        raise_app_error(ErrorCode.DIAGNOSTICS_INVALID_SESSION_CODE)

    try:
        linked, already_linked = link_sessions_to_user(
            db,
            user_id=current_user.id,
            session_codes=payload.session_codes,
        )
        db.commit()
    except BaseAppException:
        raise
    except Exception:
        db.rollback()
        raise

    return LinkSessionResponse(linked=linked, already_linked=already_linked)


@router.post("/logout")
def logout(payload: RefreshRequest, request: Request, db: Session = Depends(get_db)):
    rt_hash = _hash_rt(payload.refresh_token)
    token_row: RefreshToken | None = db.scalar(select(RefreshToken).where(RefreshToken.rt_hash == rt_hash))
    if not token_row:
        return {"detail": "Already logged out"}
    req_device_id = payload.device_id or request.headers.get("X-Device-Id")
    if token_row.device_id and req_device_id and token_row.device_id != req_device_id:
        # Do not revoke other device's token from here
        return {"detail": "Already logged out"}
    token_row.revoked = True
    db.commit()
    return {"detail": "Logged out"}


@router.post("/logout_all")
def logout_all(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(sa_update(RefreshToken).where(RefreshToken.user_id == current_user.id).values(revoked=True))
    db.commit()
    return {"detail": "All sessions revoked"}
