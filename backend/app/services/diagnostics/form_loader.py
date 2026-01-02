"""Utilities for assembling diagnostic form payloads for end users."""

from __future__ import annotations

from typing import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload
from starlette import status

from app.core.errors import ErrorCode
from app.core.exceptions import raise_app_error
from app.models.diagnostic import (
    DiagnosticVersion,
    VersionOption,
    VersionOutcome,
    VersionQuestion,
)


def load_finalized_version(
    db: Session, *, version_id: int
) -> DiagnosticVersion:
    """Load a finalized diagnostic version with its related form structure."""

    statement = (
        select(DiagnosticVersion)
        .options(
            selectinload(DiagnosticVersion.version_questions),
            selectinload(DiagnosticVersion.version_options),
            selectinload(DiagnosticVersion.version_outcomes),
        )
        .where(DiagnosticVersion.id == version_id)
    )

    version = db.execute(statement).scalar_one_or_none()
    if version is None:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND,
            status_code=status.HTTP_404_NOT_FOUND,
        )
    if version.src_hash is None:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_VERSION_FROZEN,
            status_code=status.HTTP_404_NOT_FOUND,
        )
    return version


def sorted_questions(version: DiagnosticVersion) -> list[VersionQuestion]:
    return sorted(
        version.version_questions,
        key=lambda question: (question.sort_order, question.id),
    )


def sorted_options(version: DiagnosticVersion) -> list[VersionOption]:
    return sorted(
        version.version_options,
        key=lambda option: (
            option.version_question_id,
            option.sort_order,
            option.id,
        ),
    )


def sorted_outcomes(version: DiagnosticVersion) -> list[VersionOutcome]:
    return sorted(
        version.version_outcomes,
        key=lambda outcome: (outcome.sort_order, outcome.outcome_id),
    )


def ensure_option_buckets(
    questions: Iterable[VersionQuestion],
) -> dict[str, list[VersionOption]]:
    buckets: dict[str, list[VersionOption]] = {}
    for question in questions:
        buckets[str(question.id)] = []
    return buckets


__all__ = [
    "load_finalized_version",
    "sorted_questions",
    "sorted_options",
    "sorted_outcomes",
    "ensure_option_buckets",
]
