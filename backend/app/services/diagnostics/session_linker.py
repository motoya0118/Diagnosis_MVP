from __future__ import annotations

from datetime import timezone
from typing import Sequence

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.models.diagnostic import DiagnosticSession, utcnow


def link_sessions_to_user(
    db: Session,
    *,
    user_id: int,
    session_codes: Sequence[str],
) -> tuple[list[str], list[str]]:
    if not session_codes:
        raise_app_error(ErrorCode.DIAGNOSTICS_INVALID_SESSION_CODE)

    unique_codes = list(dict.fromkeys(session_codes))

    fetched_sessions = (
        db.execute(
            select(DiagnosticSession).where(
                DiagnosticSession.session_code.in_(unique_codes)
            )
        )
        .scalars()
        .all()
    )
    by_code = {session.session_code: session for session in fetched_sessions}

    linked: list[str] = []
    already_linked: list[str] = []
    linkable: list[DiagnosticSession] = []

    for code in unique_codes:
        session = by_code.get(code)
        if session is None:
            raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND)
        if session.user_id is not None and session.user_id != user_id:
            raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_OWNED_BY_OTHER)
        if session.user_id == user_id:
            if code not in already_linked:
                already_linked.append(code)
            continue

        linkable.append(session)
        linked.append(code)

    if linkable:
        timestamp = utcnow()
        for session in linkable:
            session.user_id = user_id
            if session.ended_at is None:
                session.ended_at = timestamp
            session.updated_at = timestamp
        db.flush()

        for session in linkable:
            if session.ended_at is not None and session.ended_at.tzinfo is None:
                session.ended_at = session.ended_at.replace(tzinfo=timezone.utc)
            if session.updated_at.tzinfo is None:
                session.updated_at = session.updated_at.replace(tzinfo=timezone.utc)

    return linked, already_linked


__all__ = ["link_sessions_to_user"]
