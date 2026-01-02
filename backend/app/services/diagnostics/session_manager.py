"""Session management helpers for user-facing diagnostics APIs."""

from __future__ import annotations

import base64
import logging
import secrets
from collections.abc import Iterable

from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.core.registry import compute_version_options_hash
from app.models.diagnostic import (
    CfgActiveVersion,
    Diagnostic,
    DiagnosticSession,
    DiagnosticVersion,
)

logger = logging.getLogger(__name__)

SESSION_CODE_MAX_ATTEMPTS = 3


def generate_session_code() -> str:
    """Generate a random, URL-safe session code.

    A 128-bit random payload is encoded using Crockford-style base32 without
    padding. The resulting identifier is stable in length (26 characters) and
    restricted to the character set ``[A-Z2-7]`` which is URL-friendly and easy
    to communicate verbally.
    """

    payload = secrets.token_bytes(16)
    return base64.b32encode(payload).decode("ascii").rstrip("=")


def _active_version_lookup_query(diagnostic_code: str) -> Select[tuple[int, bool, int | None]]:
    return (
        select(
            Diagnostic.id,
            Diagnostic.is_active,
            CfgActiveVersion.version_id,
        )
        .outerjoin(
            CfgActiveVersion,
            CfgActiveVersion.diagnostic_id == Diagnostic.id,
        )
        .where(Diagnostic.code == diagnostic_code)
    )


def _resolve_active_version_id(db: Session, diagnostic_code: str) -> tuple[int, int]:
    result = db.execute(_active_version_lookup_query(diagnostic_code)).first()
    if result is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND)

    diagnostic_id, is_active, version_id = result
    if not is_active:
        raise_app_error(ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND)

    if version_id is None and settings.diagnostics_allow_fallback_version:
        version_id = db.scalar(
            select(DiagnosticVersion.id)
            .where(
                DiagnosticVersion.diagnostic_id == diagnostic_id,
                DiagnosticVersion.src_hash.is_not(None),
            )
            .order_by(
                DiagnosticVersion.finalized_at.desc(),
                DiagnosticVersion.id.desc(),
            )
        )

    if version_id is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)

    return diagnostic_id, version_id


def _is_session_code_conflict(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    if orig is None:  # pragma: no cover - defensive guard
        return False

    pgcode = getattr(orig, "pgcode", None)
    if pgcode == "23505":
        return True

    args = getattr(orig, "args", ()) or ()
    if args:
        first = args[0]
        if str(first) in {"1062", "2627"}:  # MySQL / SQL Server duplicate key
            return True

    message = str(orig).lower()
    return "duplicate" in message and "session_code" in message


def create_diagnostic_session(
    db: Session,
    diagnostic_code: str,
    *,
    user_id: int | None,
    option_ids: Iterable[int | str] | None = None,
) -> DiagnosticSession:
    """Create a new diagnostic session for the given diagnostic code.

    Parameters
    ----------
    db:
        Database session bound to the current request.
    diagnostic_code:
        Public identifier of the diagnostic to run.
    user_id:
        Optional authenticated user identifier. ``None`` indicates an
        anonymous session.
    option_ids:
        Optional collection of answer option identifiers to seed the
        ``version_options_hash``. Defaults to an empty collection.
    """

    option_ids = tuple(option_ids or ())

    def _resolve_version_hash() -> tuple[int, int, str]:
        diag_id, diag_version_id = _resolve_active_version_id(db, diagnostic_code)
        return diag_id, diag_version_id, compute_version_options_hash(diag_version_id, option_ids)

    diagnostic_id, version_id, version_hash = _resolve_version_hash()

    last_error: IntegrityError | None = None
    for attempt in range(SESSION_CODE_MAX_ATTEMPTS):
        session_code = generate_session_code()
        conflict = db.scalar(
            select(DiagnosticSession.id).where(
                DiagnosticSession.session_code == session_code
            )
        )
        if conflict is not None:
            logger.warning(
                "Session code collision detected before insert for diagnostic_code=%s attempt=%s",
                diagnostic_code,
                attempt + 1,
            )
            continue

        session = DiagnosticSession(
            user_id=user_id,
            session_code=session_code,
            diagnostic_id=diagnostic_id,
            version_id=version_id,
            version_options_hash=version_hash,
        )
        db.add(session)
        try:
            db.flush()
        except IntegrityError as exc:
            if _is_session_code_conflict(exc):
                last_error = exc
                logger.warning(
                    "Session code collision detected during insert for diagnostic_code=%s attempt=%s",
                    diagnostic_code,
                    attempt + 1,
                )
                db.rollback()
                diagnostic_id, version_id, version_hash = _resolve_version_hash()
                continue
            db.rollback()
            raise
        return session

    logger.error(
        "Failed to allocate unique session_code for diagnostic_code=%s after %s attempts",
        diagnostic_code,
        SESSION_CODE_MAX_ATTEMPTS,
        exc_info=last_error,
    )
    raise_app_error(
        ErrorCode.COMMON_UNEXPECTED_ERROR,
        detail="Unable to allocate a unique session code. Please retry.",
    )


__all__ = [
    "SESSION_CODE_MAX_ATTEMPTS",
    "create_diagnostic_session",
    "generate_session_code",
]
