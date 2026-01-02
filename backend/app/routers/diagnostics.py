from __future__ import annotations

from fastapi import APIRouter, Depends, Header, Response, status
from sqlalchemy.orm import Session

from app.deps.auth import get_db, get_optional_current_user
from app.models.user import User
from app.schemas.diagnostics import (
    UserFormOption,
    UserFormOutcome,
    UserFormQuestion,
    UserGetFormResponse,
    UserSessionStartResponse,
)
from app.services.diagnostics import (
    create_diagnostic_session,
    ensure_option_buckets,
    load_finalized_version,
    sorted_options,
    sorted_outcomes,
    sorted_questions,
)


router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])

CACHE_CONTROL_VALUE = "public, max-age=86400, stale-while-revalidate=86400"


def _normalize_if_none_match(value: str) -> set[str]:
    tokens: set[str] = set()
    for raw in value.split(","):
        candidate = raw.strip()
        if not candidate:
            continue
        if candidate.startswith("W/"):
            candidate = candidate[2:].strip()
        if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in {'"', "'"}:
            candidate = candidate[1:-1]
        tokens.add(candidate)
    return tokens


def _format_etag(value: str) -> str:
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
        return value
    return f'"{value}"'


@router.post(
    "/{diagnostic_code}/sessions",
    response_model=UserSessionStartResponse,
    status_code=status.HTTP_201_CREATED,
)
async def start_session(
    diagnostic_code: str,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
) -> UserSessionStartResponse:
    """Start a diagnostic session for the requested diagnostic code."""

    session = create_diagnostic_session(
        db,
        diagnostic_code,
        user_id=current_user.id if current_user else None,
    )
    db.commit()
    db.refresh(session)
    return UserSessionStartResponse(
        session_code=session.session_code,
        diagnostic_id=session.diagnostic_id,
        version_id=session.version_id,
        started_at=session.created_at,
    )


@router.get(
    "/versions/{version_id}/form",
    response_model=UserGetFormResponse,
)
async def get_version_form(
    version_id: int,
    response: Response,
    db: Session = Depends(get_db),
    if_none_match: str | None = Header(default=None),
) -> UserGetFormResponse | Response:
    version = load_finalized_version(db, version_id=version_id)

    if version.src_hash:
        if if_none_match:
            candidates = _normalize_if_none_match(if_none_match)
            if "*" in candidates or version.src_hash in candidates:
                not_modified = Response(status_code=status.HTTP_304_NOT_MODIFIED)
                not_modified.headers["ETag"] = _format_etag(version.src_hash)
                not_modified.headers["Cache-Control"] = CACHE_CONTROL_VALUE
                return not_modified
        response.headers["ETag"] = _format_etag(version.src_hash)
    response.headers["Cache-Control"] = CACHE_CONTROL_VALUE

    questions = sorted_questions(version)
    options = sorted_options(version)
    outcomes = sorted_outcomes(version)

    option_buckets = ensure_option_buckets(questions)
    options_payload: dict[str, list[UserFormOption]] = {
        key: [] for key in option_buckets
    }
    option_lookup: dict[str, dict[str, str]] = {}

    for option in options:
        key = str(option.version_question_id)
        options_payload.setdefault(key, []).append(
            UserFormOption(
                version_option_id=option.id,
                opt_code=option.opt_code,
                display_label=option.display_label,
                sort_order=option.sort_order,
                is_active=option.is_active,
                llm_op=option.llm_op,
            )
        )
        option_lookup[str(option.id)] = {
            "q_code": option.q_code,
            "opt_code": option.opt_code,
        }

    questions_payload = [
        UserFormQuestion(
            id=question.id,
            q_code=question.q_code,
            display_text=question.display_text,
            multi=question.multi,
            sort_order=question.sort_order,
            is_active=question.is_active,
        )
        for question in questions
    ]

    outcomes_payload = [
        UserFormOutcome(
            outcome_id=outcome.outcome_id,
            sort_order=outcome.sort_order,
            meta=outcome.outcome_meta_json or {},
        )
        for outcome in outcomes
    ]

    return UserGetFormResponse(
        version_id=version.id,
        questions=questions_payload,
        options=options_payload,
        option_lookup=option_lookup,
        outcomes=outcomes_payload,
    )


__all__ = ["router"]
