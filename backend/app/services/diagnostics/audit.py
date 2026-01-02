"""Shared helpers for diagnostic version audit logging."""

from __future__ import annotations

from typing import Any
import json

from sqlalchemy.orm import Session

from app.models.diagnostic import DiagnosticVersionAuditLog


def _normalise(value: Any) -> str | None:
    """Convert payloads into the persisted representation.

    Values that are already strings pass through unchanged. Dicts and
    lists are serialised as deterministic JSON so downstream consumers of
    the audit log can safely parse them. Other primitive types are
    wrapped in ``str`` to keep the column format consistent.
    """

    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return str(value)


def record_diagnostic_version_log(
    db: Session,
    *,
    version_id: int,
    admin_user_id: int,
    action: str,
    note: Any | None = None,
    field_name: str | None = None,
    old_value: Any | None = None,
    new_value: Any | None = None,
) -> DiagnosticVersionAuditLog:
    """Persist a row to ``aud_diagnostic_version_logs``.

    This wrapper guarantees consistent normalisation of structured
    payloads and keeps the calling code concise. The caller remains in
    control of the transaction boundary.
    """

    log = DiagnosticVersionAuditLog(
        version_id=version_id,
        admin_user_id=admin_user_id,
        action=action,
        field_name=field_name,
        note=_normalise(note),
        old_value=_normalise(old_value),
        new_value=_normalise(new_value),
    )
    db.add(log)
    db.flush()
    return log


__all__ = [
    "record_diagnostic_version_log",
]

