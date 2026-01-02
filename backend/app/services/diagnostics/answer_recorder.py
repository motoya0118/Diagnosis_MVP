from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy import Select, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.core.registry import compute_version_options_hash
from app.models.diagnostic import AnswerChoice, DiagnosticSession, VersionOption


def _fetch_session(db: Session, session_code: str) -> DiagnosticSession:
    stmt: Select[DiagnosticSession] = select(DiagnosticSession).where(
        DiagnosticSession.session_code == session_code
    )
    session = db.execute(stmt).scalar_one_or_none()
    if session is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND)
    return session


def _normalise_answered_at(answered_at: datetime | None) -> datetime:
    if answered_at is None:
        return datetime.now(timezone.utc)
    if answered_at.tzinfo is None:
        return answered_at.replace(tzinfo=timezone.utc)
    return answered_at.astimezone(timezone.utc)


def _ensure_option_membership(
    db: Session,
    *,
    version_id: int,
    option_ids: Iterable[int],
) -> None:
    ids = list(option_ids)
    stmt = select(VersionOption.id).where(
        VersionOption.version_id == version_id,
        VersionOption.id.in_(ids),
    )
    found = {row for row in db.scalars(stmt)}
    if len(found) != len(ids):
        raise_app_error(ErrorCode.DIAGNOSTICS_OPTION_OUT_OF_VERSION)


def _is_duplicate_answer(exc: IntegrityError) -> bool:
    orig = getattr(exc, "orig", None)
    if orig is None:  # pragma: no cover - defensive guard
        return False

    pgcode = getattr(orig, "pgcode", None)
    if pgcode == "23505":
        return True

    args = getattr(orig, "args", ()) or ()
    if args:
        first = args[0]
        if str(first) in {"1062", "2627"}:
            return True

    message = str(orig).lower()
    return "duplicate" in message and "answer_choices" in message


def submit_session_answers(
    db: Session,
    *,
    session_code: str,
    version_option_ids: list[int],
    answered_at: datetime | None,
) -> str:
    session = _fetch_session(db, session_code)

    if not version_option_ids or len(version_option_ids) > 20:
        raise_app_error(ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD)

    _ensure_option_membership(db, version_id=session.version_id, option_ids=version_option_ids)

    timestamp = _normalise_answered_at(answered_at)

    records = [
        AnswerChoice(
            session_id=session.id,
            version_option_id=option_id,
            answered_at=timestamp,
        )
        for option_id in version_option_ids
    ]
    db.add_all(records)

    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        if _is_duplicate_answer(exc):
            raise_app_error(ErrorCode.DIAGNOSTICS_DUPLICATE_ANSWER)
        raise

    new_hash = compute_version_options_hash(session.version_id, version_option_ids)
    session.version_options_hash = new_hash
    db.flush()

    return new_hash


__all__ = ["submit_session_answers"]
