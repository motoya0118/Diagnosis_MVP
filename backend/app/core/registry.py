"""Common registry utilities for diagnostics module.

This module centralises two pieces of shared logic required across the
diagnostics endpoints:

* Stable computation of the `version_options_hash` that is stored on
  `sessions` to act as a cache key for LLM results.
* Lookup of the concrete SQLAlchemy model that backs a diagnostic's
  outcome master table based on the value stored in
  `diagnostics.outcome_table_name`.

Keeping the implementation here avoids multiple modules re-implementing
string normalisation or hashing rules and guarantees that the behaviour
matches the API/DB specifications documented under
`_documents/diagnostics/ai_career/APIs/00_common.md`.
"""

from __future__ import annotations

from collections.abc import Iterable
import hashlib
from typing import Any, Final, NamedTuple, Type

from sqlalchemy.orm import InstrumentedAttribute

from app.db.base import Base
from app.models.mst_ai_job import MstAiJob


class OutcomeModelBinding(NamedTuple):
    """Represents a resolvable outcome master table."""

    model: Type[Base]
    default_label_column: InstrumentedAttribute[Any]
    key_columns: tuple[str, ...]


OutcomeModel = Type[Base]


OUTCOME_MODEL_REGISTRY: Final[dict[str, OutcomeModelBinding]] = {
    "MST_AI_JOBS": OutcomeModelBinding(MstAiJob, MstAiJob.name, ("name",)),
}


class OutcomeModelResolutionError(LookupError):
    """Raised when an outcome table name cannot be resolved."""


def resolve_outcome_model(table_name: str) -> OutcomeModelBinding:
    """Return the outcome model binding for a given table name.

    Parameters
    ----------
    table_name:
        The value stored in `diagnostics.outcome_table_name`. Any leading
        or trailing whitespace is ignored and the lookup is performed in a
        case-insensitive manner by normalising to upper case.

    Raises
    ------
    OutcomeModelResolutionError
        When the supplied name is not registered.
    """

    key = table_name.strip().upper()
    try:
        return OUTCOME_MODEL_REGISTRY[key]
    except KeyError as exc:  # pragma: no cover - defensive branch
        raise OutcomeModelResolutionError(f"Unsupported outcome table: {table_name}") from exc


def compute_version_options_hash(version_id: int, option_ids: Iterable[int | str]) -> str:
    """Compute the canonical hash for a set of option ids.

    The implementation follows the contract described in the common API
    specification: option identifiers are transformed into strings,
    sorted in ascending order, joined with commas, prefixed with the
    version identifier, and finally hashed via SHA-256.

    Parameters
    ----------
    version_id:
        Identifier of the diagnostic version the options belong to. It
        is embedded in the hash input to prevent collisions across
        versions that may reuse the same option ids.
    option_ids:
        An iterable of identifiers (integers or strings are supported).

    Returns
    -------
    str
        Lowercase hexadecimal SHA-256 digest.
    """

    sorted_ids = sorted(str(opt_id) for opt_id in option_ids)
    payload = ",".join(sorted_ids)
    raw = f"v{version_id}:{payload}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


__all__ = [
    "OutcomeModelBinding",
    "OutcomeModelResolutionError",
    "OUTCOME_MODEL_REGISTRY",
    "compute_version_options_hash",
    "resolve_outcome_model",
]
