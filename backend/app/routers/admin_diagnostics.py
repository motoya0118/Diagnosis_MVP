from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends, File, Query, Response, UploadFile, status
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.errors import ErrorCode
from app.core.exceptions import BaseAppException, raise_app_error
from app.deps import admin as admin_deps
from app.models.admin_user import AdminUser
from app.models.diagnostic import (
    CfgActiveVersion,
    Diagnostic,
    DiagnosticVersion,
    DiagnosticVersionAuditLog,
    VersionOption,
    VersionOutcome,
    VersionQuestion,
    utcnow,
)
from app.schemas.diagnostics import (
    AdminActiveVersion,
    AdminActiveVersionItem,
    AdminActiveVersionsResponse,
    AdminCreateVersionRequest,
    AdminDiagnosticItem,
    AdminDiagnosticVersion,
    AdminDiagnosticVersionListItem,
    AdminDiagnosticVersionDetail,
    AdminDiagnosticVersionAudit,
    AdminDiagnosticVersionsResponse,
    AdminDiagnosticsResponse,
    AdminFinalizeSummary,
    AdminFinalizeVersionResponse,
    AdminImportStructureResponse,
    AdminActivateVersionRequest,
    AdminActivateVersionResponse,
    AdminUpdateSystemPromptRequest,
    AdminUpdateSystemPromptResponse,
)
from app.services.diagnostics.audit import record_diagnostic_version_log
from app.services.diagnostics.template_exporter import TemplateExporter
from app.services.diagnostics.structure_importer import (
    StructureImportParseError,
    StructureImporter,
)


router = APIRouter(prefix="/admin/diagnostics", tags=["admin_diagnostics"])

_BOOL_VALUES = {"true": True, "false": False}
_STATUS_FILTERS = {"draft", "finalized"}


def _parse_include_inactive(raw: str | None) -> bool:
    if raw is None:
        return False
    normalized = raw.strip().lower()
    if normalized in _BOOL_VALUES:
        return _BOOL_VALUES[normalized]
    raise_app_error(ErrorCode.DIAGNOSTICS_STATUS_INVALID)


def _normalise_status(raw: str | None) -> str | None:
    if raw is None:
        return None
    value = raw.strip().lower()
    if not value:
        return None
    if value not in _STATUS_FILTERS:
        raise_app_error(ErrorCode.DIAGNOSTICS_STATUS_INVALID)
    return value


def _normalise_limit(raw: int | None) -> int | None:
    if raw is None:
        return None
    if raw < 1 or raw > 1000:
        raise_app_error(ErrorCode.DIAGNOSTICS_LIMIT_INVALID)
    return raw


@router.get("", response_model=AdminDiagnosticsResponse)
def list_diagnostics(
    include_inactive: str | None = Query(default=None),
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminDiagnosticsResponse:
    include_all = _parse_include_inactive(include_inactive)

    stmt = select(Diagnostic).order_by(Diagnostic.code)
    if not include_all:
        stmt = stmt.where(Diagnostic.is_active.is_(True))

    diagnostics = db.execute(stmt).scalars().all()
    items = [
        AdminDiagnosticItem(
            id=diag.id,
            code=diag.code,
            display_name=diag.code,
            description=diag.description,
            outcome_table_name=diag.outcome_table_name,
            is_active=diag.is_active,
        )
        for diag in diagnostics
    ]
    return AdminDiagnosticsResponse(items=items)


@router.get(
    "/active-versions",
    response_model=AdminActiveVersionsResponse,
)
def get_active_diagnostic_versions(
    diagnostic_id: int | None = Query(default=None),
    diagnostic_code: str | None = Query(default=None),
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminActiveVersionsResponse:
    code_filter = _normalise_optional(diagnostic_code)
    if diagnostic_id is not None and code_filter is not None:
        raise_app_error(ErrorCode.DIAGNOSTICS_INVALID_FILTER)

    stmt = (
        select(
            Diagnostic.id.label("diagnostic_id"),
            Diagnostic.code,
            Diagnostic.description,
            CfgActiveVersion.version_id,
            CfgActiveVersion.updated_at,
            CfgActiveVersion.updated_by_admin_id,
        )
        .outerjoin(CfgActiveVersion, CfgActiveVersion.diagnostic_id == Diagnostic.id)
    )

    if diagnostic_id is not None:
        stmt = stmt.where(Diagnostic.id == diagnostic_id)
    elif code_filter is not None:
        stmt = stmt.where(Diagnostic.code == code_filter)

    stmt = stmt.order_by(Diagnostic.code)

    rows = db.execute(stmt).all()
    if not rows and (diagnostic_id is not None or code_filter is not None):
        raise_app_error(ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND)

    version_ids = {row.version_id for row in rows if row.version_id is not None}
    version_map: dict[int, DiagnosticVersion] = {}
    if version_ids:
        versions = (
            db.execute(select(DiagnosticVersion).where(DiagnosticVersion.id.in_(version_ids)))
            .scalars()
            .all()
        )
        version_map = {version.id: version for version in versions}

    items: list[AdminActiveVersionItem] = []
    for row in rows:
        active_version = None
        if row.version_id is not None:
            version = version_map.get(row.version_id)
            if version is not None and row.updated_at is not None and row.updated_by_admin_id is not None:
                active_version = AdminActiveVersion(
                    version_id=version.id,
                    name=version.name,
                    src_hash=version.src_hash,
                    activated_at=_format_activated_at(row.updated_at),
                    activated_by_admin_id=row.updated_by_admin_id,
                )

        items.append(
            AdminActiveVersionItem(
                diagnostic_id=row.diagnostic_id,
                diagnostic_code=row.code,
                display_name=row.description or row.code,
                active_version=active_version,
            )
        )

    return AdminActiveVersionsResponse(items=items)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _format_activated_at(value: datetime) -> str:
    return _as_utc(value).isoformat().replace("+00:00", "Z")


def _normalise_optional(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


_PROMPT_PREVIEW_LENGTH = 200


def _system_prompt_preview(value: str | None) -> str | None:
    if value is None:
        return None
    if len(value) <= _PROMPT_PREVIEW_LENGTH:
        return value
    return value[:_PROMPT_PREVIEW_LENGTH] + "..."


def _normalise_json_payload(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, dict):
        return {key: _normalise_json_payload(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_normalise_json_payload(item) for item in value]
    return value


def _build_src_hash(
    version: DiagnosticVersion,
    *,
    questions: list[VersionQuestion],
    options: list[VersionOption],
    outcomes: list[VersionOutcome],
) -> str:
    questions_payload = [
        {
            "q_code": question.q_code,
            "display_text": question.display_text,
            "multi": question.multi,
            "sort_order": question.sort_order,
            "is_active": question.is_active,
        }
        for question in questions
    ]
    options_payload = [
        {
            "q_code": option.q_code,
            "opt_code": option.opt_code,
            "display_label": option.display_label,
            "llm_op": _normalise_json_payload(option.llm_op),
            "sort_order": option.sort_order,
            "is_active": option.is_active,
        }
        for option in options
    ]
    outcomes_payload = [
        {
            "outcome_id": outcome.outcome_id,
            "sort_order": outcome.sort_order,
            "meta": _normalise_json_payload(outcome.outcome_meta_json),
        }
        for outcome in outcomes
    ]
    parts = [
        version.system_prompt or "",
        json.dumps(questions_payload, ensure_ascii=False, separators=(",", ":")),
        json.dumps(options_payload, ensure_ascii=False, separators=(",", ":")),
        json.dumps(outcomes_payload, ensure_ascii=False, separators=(",", ":")),
    ]
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


@router.post(
    "/versions",
    response_model=AdminDiagnosticVersion,
    status_code=status.HTTP_201_CREATED,
)
def create_diagnostic_version(
    payload: AdminCreateVersionRequest,
    admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminDiagnosticVersion:
    diagnostic = db.get(Diagnostic, payload.diagnostic_id)
    if diagnostic is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND)

    name = payload.name.strip()
    if not name or len(name) > 128:
        raise_app_error(ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION)

    existing_stmt = select(DiagnosticVersion.id).where(
        DiagnosticVersion.diagnostic_id == payload.diagnostic_id,
        DiagnosticVersion.name == name,
    )
    if db.execute(existing_stmt).first():
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NAME_DUP)

    version = DiagnosticVersion(
        diagnostic_id=payload.diagnostic_id,
        name=name,
        description=_normalise_optional(payload.description),
        system_prompt=_normalise_optional(payload.system_prompt),
        note=_normalise_optional(payload.note),
        created_by_admin_id=admin.id,
        updated_by_admin_id=admin.id,
    )

    db.add(version)
    db.flush()

    record_diagnostic_version_log(
        db,
        version_id=version.id,
        admin_user_id=admin.id,
        action="CREATE",
        new_value={
            "name": version.name,
            "description": version.description,
            "system_prompt": version.system_prompt,
            "note": version.note,
        },
    )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NAME_DUP)

    db.refresh(version)
    return AdminDiagnosticVersion.model_validate(version)


@router.get(
    "/{diagnostic_id}/versions",
    response_model=AdminDiagnosticVersionsResponse,
)
def list_diagnostic_versions(
    diagnostic_id: int,
    status: str | None = Query(default=None),
    limit: int | None = Query(default=None),
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminDiagnosticVersionsResponse:
    status_filter = _normalise_status(status)
    limit_value = _normalise_limit(limit)

    diagnostic = db.get(Diagnostic, diagnostic_id)
    if diagnostic is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_DIAGNOSTIC_NOT_FOUND)

    status_case = case(
        (DiagnosticVersion.src_hash.is_(None), "draft"),
        else_="finalized",
    )
    system_prompt_state_case = case(
        (DiagnosticVersion.system_prompt.is_(None), "empty"),
        else_="present",
    )
    status_order_case = case(
        (DiagnosticVersion.src_hash.is_(None), 1),
        else_=0,
    )
    is_active_case = case(
        (CfgActiveVersion.version_id.isnot(None), True),
        else_=False,
    )

    stmt = (
        select(
            DiagnosticVersion.id,
            DiagnosticVersion.name,
            DiagnosticVersion.description,
            DiagnosticVersion.note,
            DiagnosticVersion.created_by_admin_id,
            DiagnosticVersion.updated_by_admin_id,
            DiagnosticVersion.created_at,
            DiagnosticVersion.updated_at,
            status_case.label("status"),
            system_prompt_state_case.label("system_prompt_state"),
            is_active_case.label("is_active"),
        )
        .outerjoin(
            CfgActiveVersion,
            (CfgActiveVersion.diagnostic_id == DiagnosticVersion.diagnostic_id)
            & (CfgActiveVersion.version_id == DiagnosticVersion.id),
        )
        .where(DiagnosticVersion.diagnostic_id == diagnostic_id)
    )

    if status_filter is not None:
        stmt = stmt.where(status_case == status_filter)

    stmt = stmt.order_by(
        status_order_case,
        DiagnosticVersion.updated_at.desc(),
        DiagnosticVersion.id.desc(),
    ).limit(limit_value or 1000)

    rows = db.execute(stmt).all()
    items = [
        AdminDiagnosticVersionListItem(
            id=row.id,
            name=row.name,
            status=row.status,
            description=row.description,
            note=row.note,
            created_by_admin_id=row.created_by_admin_id,
            updated_by_admin_id=row.updated_by_admin_id,
            created_at=row.created_at,
            updated_at=row.updated_at,
            system_prompt_state=row.system_prompt_state,
            is_active=bool(row.is_active),
        )
        for row in rows
    ]

    return AdminDiagnosticVersionsResponse(
        diagnostic_id=diagnostic_id,
        items=items,
    )


def _fetch_latest_audit_log(
    db: Session,
    *,
    version_id: int,
    action: str,
) -> DiagnosticVersionAuditLog | None:
    stmt = (
        select(DiagnosticVersionAuditLog)
        .where(
            DiagnosticVersionAuditLog.version_id == version_id,
            DiagnosticVersionAuditLog.action == action,
        )
        .order_by(
            DiagnosticVersionAuditLog.created_at.desc(),
            DiagnosticVersionAuditLog.id.desc(),
        )
    )
    return db.execute(stmt).scalars().first()


@router.get(
    "/versions/{version_id}",
    response_model=AdminDiagnosticVersionDetail,
)
def get_diagnostic_version_detail(
    version_id: int,
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminDiagnosticVersionDetail:
    version = db.get(DiagnosticVersion, version_id)
    if version is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)

    questions_count = db.execute(
        select(func.count())
        .select_from(VersionQuestion)
        .where(VersionQuestion.version_id == version_id)
    ).scalar_one()
    options_count = db.execute(
        select(func.count())
        .select_from(VersionOption)
        .where(VersionOption.version_id == version_id)
    ).scalar_one()
    outcomes_count = db.execute(
        select(func.count())
        .select_from(VersionOutcome)
        .where(VersionOutcome.version_id == version_id)
    ).scalar_one()

    summary = AdminFinalizeSummary(
        questions=int(questions_count or 0),
        options=int(options_count or 0),
        outcomes=int(outcomes_count or 0),
    )

    import_log = _fetch_latest_audit_log(db, version_id=version_id, action="IMPORT")
    finalize_log = _fetch_latest_audit_log(db, version_id=version_id, action="FINALIZE")

    audit: AdminDiagnosticVersionAudit | None = None
    if import_log or finalize_log:
        audit = AdminDiagnosticVersionAudit(
            last_imported_at=import_log.created_at if import_log else None,
            last_imported_by_admin_id=import_log.admin_user_id if import_log else None,
            finalized_at=finalize_log.created_at if finalize_log else None,
            finalized_by_admin_id=finalize_log.admin_user_id if finalize_log else None,
        )

    status = "draft" if version.src_hash is None else "finalized"

    return AdminDiagnosticVersionDetail(
        id=version.id,
        diagnostic_id=version.diagnostic_id,
        name=version.name,
        description=version.description,
        note=version.note,
        status=status,
        system_prompt_preview=_system_prompt_preview(version.system_prompt),
        src_hash=version.src_hash,
        created_by_admin_id=version.created_by_admin_id,
        updated_by_admin_id=version.updated_by_admin_id,
        created_at=version.created_at,
        updated_at=version.updated_at,
        summary=summary,
        audit=audit,
    )


@router.get(
    "/versions/{version_id}/system-prompt",
    response_model=AdminUpdateSystemPromptResponse,
)
def get_system_prompt(
    version_id: int,
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminUpdateSystemPromptResponse:
    version = db.get(DiagnosticVersion, version_id)
    if version is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)
    return AdminUpdateSystemPromptResponse.model_validate(version)


@router.put(
    "/versions/{version_id}/system-prompt",
    response_model=AdminUpdateSystemPromptResponse,
)
def update_system_prompt(
    version_id: int,
    payload: AdminUpdateSystemPromptRequest,
    admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminUpdateSystemPromptResponse:
    system_prompt_value = payload.system_prompt
    if isinstance(system_prompt_value, str) and len(system_prompt_value) > 100_000:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION,
            detail="system_prompt must be 100000 characters or fewer",
        )
    if system_prompt_value == "":
        system_prompt_value = None

    version = db.get(DiagnosticVersion, version_id)
    if version is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)
    if version.src_hash is not None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_FROZEN)

    note_for_log = None
    if "note" in payload.model_fields_set:
        note_for_log = _normalise_optional(payload.note)
        if note_for_log is not None:
            version.note = note_for_log
    version.system_prompt = system_prompt_value
    version.updated_by_admin_id = admin.id

    prompt_hash = hashlib.sha256((system_prompt_value or "").encode("utf-8")).hexdigest()

    try:
        db.flush()
        record_diagnostic_version_log(
            db,
            version_id=version.id,
            admin_user_id=admin.id,
            action="PROMPT_UPDATE",
            new_value={"system_prompt_sha256": prompt_hash},
            note=note_for_log,
        )
        db.commit()
    except BaseAppException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise_app_error(ErrorCode.COMMON_UNEXPECTED_ERROR)

    db.refresh(version)
    return AdminUpdateSystemPromptResponse.model_validate(version)


@router.get(
    "/versions/{version_id}/template",
    response_class=Response,
)
def download_diagnostic_template(
    version_id: int,
    diagnostic_id: int | None = Query(default=None),
    _: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> Response:
    exporter = TemplateExporter(db)
    result = exporter.build(version_id=version_id, diagnostic_id=diagnostic_id)
    return Response(
        content=result.content,
        media_type=TemplateExporter.FILE_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
    )


@router.post(
    "/versions/{version_id}/structure/import",
    response_model=AdminImportStructureResponse,
)
async def import_diagnostic_structure(
    version_id: int,
    file: UploadFile = File(...),
    admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminImportStructureResponse:
    content = await file.read()
    if not content:
        raise_app_error(ErrorCode.DIAGNOSTICS_IMPORT_VALIDATION, detail="空のファイルは取り込めません")

    importer = StructureImporter(db)
    nested_tx = db.begin_nested()
    try:
        summary = importer.import_version_structure(
            version_id=version_id,
            admin_id=admin.id,
            content=content,
        )
        nested_tx.commit()
        db.commit()
    except StructureImportParseError as exc:
        if nested_tx.is_active:
            nested_tx.rollback()
        if exc.error_code in {
            ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND,
            ErrorCode.DIAGNOSTICS_VERSION_FROZEN,
        }:
            raise_app_error(exc.error_code, detail=exc.detail)
        raise_app_error(
            exc.error_code,
            detail=exc.detail,
            extra={"invalid_cells": exc.invalid_cells} if exc.invalid_cells else None,
        )
    except BaseAppException:
        if nested_tx.is_active:
            nested_tx.rollback()
        raise
    except Exception:
        if nested_tx.is_active:
            nested_tx.rollback()
        raise_app_error(ErrorCode.COMMON_UNEXPECTED_ERROR)

    return AdminImportStructureResponse(
        version_id=summary.version_id,
        questions_imported=summary.questions_imported,
        options_imported=summary.options_imported,
        outcomes_imported=summary.outcomes_imported,
        warnings=summary.warnings,
    )


@router.post(
    "/versions/{version_id}/finalize",
    response_model=AdminFinalizeVersionResponse,
)
def finalize_diagnostic_version(
    version_id: int,
    admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminFinalizeVersionResponse:
    stmt = (
        select(DiagnosticVersion)
        .where(DiagnosticVersion.id == version_id)
        .with_for_update()
    )
    version = db.execute(stmt).scalar_one_or_none()
    if version is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)
    if version.src_hash is not None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_FROZEN)

    questions = list(
        db.execute(
            select(VersionQuestion)
            .where(VersionQuestion.version_id == version_id)
            .order_by(VersionQuestion.sort_order.asc(), VersionQuestion.id.asc())
        ).scalars()
    )
    if not questions:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_DEP_MISSING,
            detail="Finalize には少なくとも1件の質問が必要です",
        )

    options = list(
        db.execute(
            select(VersionOption)
            .where(VersionOption.version_id == version_id)
            .order_by(
                VersionOption.version_question_id.asc(),
                VersionOption.sort_order.asc(),
                VersionOption.id.asc(),
            )
        ).scalars()
    )
    active_counts: dict[int, int] = {}
    for option in options:
        if option.is_active:
            key = option.version_question_id
            active_counts[key] = active_counts.get(key, 0) + 1

    missing_active = next(
        (question for question in questions if active_counts.get(question.id, 0) == 0),
        None,
    )
    if missing_active is not None:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_DEP_MISSING,
            detail="各質問にアクティブな選択肢を1件以上紐付けてください",
        )

    active_option_count = sum(1 for option in options if option.is_active)
    if active_option_count == 0:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_DEP_MISSING,
            detail="Finalize にはアクティブな選択肢が必要です",
        )

    outcomes = list(
        db.execute(
            select(VersionOutcome)
            .where(VersionOutcome.version_id == version_id)
            .order_by(
                VersionOutcome.sort_order.asc(),
                VersionOutcome.outcome_id.asc(),
                VersionOutcome.id.asc(),
            )
        ).scalars()
    )
    if not outcomes:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_DEP_MISSING,
            detail="Finalize にはアウトカムが必要です",
        )

    src_hash = _build_src_hash(
        version,
        questions=questions,
        options=options,
        outcomes=outcomes,
    )

    question_count = len(questions)
    outcome_count = len(outcomes)

    finalized_at = utcnow()
    version.src_hash = src_hash
    version.finalized_at = finalized_at
    version.finalized_by_admin_id = admin.id
    version.updated_by_admin_id = admin.id

    try:
        db.flush()
        record_diagnostic_version_log(
            db,
            version_id=version.id,
            admin_user_id=admin.id,
            action="FINALIZE",
            new_value={
                "src_hash": src_hash,
                "questions": question_count,
                "options": active_option_count,
                "outcomes": outcome_count,
            },
        )
        db.commit()
    except BaseAppException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise_app_error(ErrorCode.COMMON_UNEXPECTED_ERROR)

    db.refresh(version)

    return AdminFinalizeVersionResponse(
        version_id=version.id,
        src_hash=src_hash,
        summary=AdminFinalizeSummary(
            questions=question_count,
            options=active_option_count,
            outcomes=outcome_count,
        ),
        finalized_at=version.finalized_at,
        finalized_by_admin_id=version.finalized_by_admin_id or admin.id,
    )


@router.post(
    "/versions/{version_id}/activate",
    response_model=AdminActivateVersionResponse,
)
def activate_diagnostic_version(
    version_id: int,
    payload: AdminActivateVersionRequest | None = Body(default=None),
    admin: AdminUser = Depends(admin_deps.get_current_admin),
    db: Session = Depends(admin_deps.get_db),
) -> AdminActivateVersionResponse:
    stmt = (
        select(DiagnosticVersion)
        .where(DiagnosticVersion.id == version_id)
        .with_for_update()
    )
    version = db.execute(stmt).scalar_one_or_none()
    if version is None:
        raise_app_error(ErrorCode.DIAGNOSTICS_VERSION_NOT_FOUND)
    if version.src_hash is None:
        raise_app_error(
            ErrorCode.DIAGNOSTICS_DEP_MISSING,
            detail="Finalize 前の版はアクティブ化できません",
        )

    diagnostic_id = version.diagnostic_id
    if payload is not None and payload.diagnostic_id is not None:
        if payload.diagnostic_id != diagnostic_id:
            raise_app_error(
                ErrorCode.DIAGNOSTICS_LIMIT_INVALID,
                detail="指定診断と版が一致しません",
            )

    active_stmt = (
        select(CfgActiveVersion)
        .where(CfgActiveVersion.diagnostic_id == diagnostic_id)
        .with_for_update()
    )
    active = db.execute(active_stmt).scalar_one_or_none()
    previous_version_id = active.version_id if active is not None else None

    activated_at = utcnow()
    if active is None:
        active = CfgActiveVersion(
            diagnostic_id=diagnostic_id,
            version_id=version_id,
            created_by_admin_id=admin.id,
            updated_by_admin_id=admin.id,
            created_at=activated_at,
            updated_at=activated_at,
        )
        db.add(active)
    else:
        active.version_id = version_id
        active.updated_by_admin_id = admin.id
        active.updated_at = activated_at

    version.updated_by_admin_id = admin.id
    version.updated_at = activated_at

    note_previous = (
        f"previous_version_id={previous_version_id}"
        if previous_version_id is not None
        else "previous_version_id=NULL"
    )

    try:
        db.flush()
        record_diagnostic_version_log(
            db,
            version_id=version.id,
            admin_user_id=admin.id,
            action="ACTIVATE",
            new_value={
                "diagnostic_id": diagnostic_id,
                "previous_version_id": previous_version_id,
                "activated_version_id": version.id,
            },
            note=note_previous,
        )
        db.commit()
    except BaseAppException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise_app_error(ErrorCode.COMMON_UNEXPECTED_ERROR)

    db.refresh(active)

    return AdminActivateVersionResponse(
        diagnostic_id=diagnostic_id,
        version_id=version.id,
        activated_at=active.updated_at,
        activated_by_admin_id=admin.id,
    )
