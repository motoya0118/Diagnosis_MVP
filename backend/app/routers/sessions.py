from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Response, status
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.deps.auth import get_db
from app.schemas.sessions import (
    UserCallLlmRequest,
    UserCallLlmResponse,
    UserGetSessionResponse,
    UserSubmitAnswersRequest,
)
from app.services.diagnostics import llm_executor, submit_session_answers
from app.services.diagnostics.session_reader import get_public_session_payload


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.get("/{session_code}", response_model=UserGetSessionResponse)
def get_session(session_code: str, db: Session = Depends(get_db)) -> UserGetSessionResponse:
    payload = get_public_session_payload(db, session_code=session_code)
    return UserGetSessionResponse.model_validate(payload)


@router.post("/{session_code}/answers", status_code=status.HTTP_204_NO_CONTENT)
def submit_answers(
    session_code: str,
    raw_payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
) -> Response:
    try:
        payload = UserSubmitAnswersRequest.model_validate(raw_payload)
    except ValidationError:
        raise_app_error(ErrorCode.DIAGNOSTICS_INVALID_PAYLOAD)

    submit_session_answers(
        db,
        session_code=session_code,
        version_option_ids=payload.version_option_ids,
        answered_at=payload.answered_at,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{session_code}/llm", response_model=UserCallLlmResponse)
def execute_llm(
    session_code: str,
    payload: UserCallLlmRequest = Body(...),
    db: Session = Depends(get_db),
) -> UserCallLlmResponse:
    result = llm_executor.call_session_llm(
        db,
        session_code=session_code,
        model_id=payload.model,
        temperature=payload.temperature,
        top_p=payload.top_p,
        force_regenerate=payload.force_regenerate,
    )
    db.commit()
    return UserCallLlmResponse.model_validate(result)


__all__ = ["router"]
