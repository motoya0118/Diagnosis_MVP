from __future__ import annotations

import copy
import re
from collections.abc import Mapping
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.models.diagnostic import DiagnosticSession, VersionOutcome

SESSION_CODE_PATTERN = re.compile(r"^[A-Za-z0-9_-]+$")
PUBLIC_LLM_RESULT_KEYS = ("raw", "generated_at")


def _validate_session_code(session_code: str) -> None:
    if not SESSION_CODE_PATTERN.fullmatch(session_code):
        raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND)


def _sanitise_llm_result(document: Any) -> dict[str, Any] | None:
    if not isinstance(document, Mapping):
        return None

    sanitised: dict[str, Any] = {}
    for key in PUBLIC_LLM_RESULT_KEYS:
        value = document.get(key)
        if key == "raw" and value is not None:
            sanitised[key] = copy.deepcopy(value)
        else:
            sanitised[key] = value
    return sanitised


def _sanitise_outcome_meta(document: Any) -> dict[str, Any] | None:
    if not isinstance(document, Mapping):
        return {}
    return copy.deepcopy(document)


def get_public_session_payload(db: Session, *, session_code: str) -> dict[str, Any]:
    _validate_session_code(session_code)

    stmt: Select[tuple[int, dict[str, Any] | None]] = select(
        DiagnosticSession.version_id,
        DiagnosticSession.llm_result,
    ).where(DiagnosticSession.session_code == session_code)
    row = db.execute(stmt).first()
    if row is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_SESSION_NOT_FOUND)

    version_id, llm_result = row

    outcomes_stmt: Select[tuple[int, int, dict[str, Any] | None]] = (
        select(
            VersionOutcome.outcome_id,
            VersionOutcome.sort_order,
            VersionOutcome.outcome_meta_json,
        )
        .where(VersionOutcome.version_id == version_id)
        .order_by(VersionOutcome.sort_order, VersionOutcome.outcome_id)
    )
    outcomes = [
        {
            "outcome_id": outcome_id,
            "sort_order": sort_order,
            "meta": _sanitise_outcome_meta(meta),
        }
        for outcome_id, sort_order, meta in db.execute(outcomes_stmt).all()
    ]

    return {
        "version_id": version_id,
        "outcomes": outcomes,
        "llm_result": _sanitise_llm_result(llm_result),
    }


__all__ = [
    "PUBLIC_LLM_RESULT_KEYS",
    "SESSION_CODE_PATTERN",
    "get_public_session_payload",
]
