from __future__ import annotations

import json

import pytest
import uuid

from app.core.registry import (
    OutcomeModelResolutionError,
    compute_version_options_hash,
    resolve_outcome_model,
)
from app.db.session import SessionLocal
from app.models.diagnostic import (
    Diagnostic,
    DiagnosticVersion,
    DiagnosticVersionAuditLog,
)
from app.models.mst_ai_job import MstAiJob
from app.services.diagnostics.audit import record_diagnostic_version_log

from tests.factories import AdminUserFactory, set_factory_session
from tests.utils.db import truncate_tables, DEFAULT_TABLES


@pytest.fixture
def db_session():
    session = SessionLocal()
    truncate_tables(session.get_bind(), DEFAULT_TABLES + ("mst_ai_jobs",))
    set_factory_session(session)
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        set_factory_session(None)


def test_compute_version_options_hash_is_stable():
    ids = [302, 101, 205]
    hash1 = compute_version_options_hash(5, ids)
    hash2 = compute_version_options_hash(5, [str(i) for i in reversed(ids)])
    assert hash1 == hash2

    # Different version id produces a distinct hash even if ids match
    other = compute_version_options_hash(6, ids)
    assert other != hash1


def test_resolve_outcome_model_returns_binding():
    binding = resolve_outcome_model("mst_ai_jobs")
    assert binding.model is MstAiJob
    assert binding.default_label_column.key == "name"
    assert binding.key_columns == ("name",)


def test_resolve_outcome_model_raises_on_unknown_table():
    with pytest.raises(OutcomeModelResolutionError):
        resolve_outcome_model("unknown_table")


def test_record_diagnostic_version_log_persists_row(db_session):
    unique_code = f"diag_log_{uuid.uuid4().hex[:8]}"
    admin = AdminUserFactory(is_active=True)
    diagnostic = Diagnostic(
        code=unique_code,
        description="",
        outcome_table_name="mst_ai_jobs",
        is_active=True,
    )
    db_session.add(diagnostic)
    db_session.flush()
    version = DiagnosticVersion(
        diagnostic_id=diagnostic.id,
        name="Log Test Version",
        description="",
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )
    db_session.add(version)
    db_session.flush()
    log = record_diagnostic_version_log(
        db_session,
        version_id=version.id,
        admin_user_id=version.created_by_admin_id,
        action="IMPORT",
        note={"rows": 3},
        old_value={"before": True},
        new_value={"after": False},
    )

    fetched = db_session.get(DiagnosticVersionAuditLog, log.id)
    assert fetched is not None
    assert fetched.action == "IMPORT"
    assert fetched.version_id == version.id
    assert json.loads(fetched.note or "{}") == {"rows": 3}
    assert json.loads(fetched.old_value or "{}") == {"before": True}
    assert json.loads(fetched.new_value or "{}") == {"after": False}
