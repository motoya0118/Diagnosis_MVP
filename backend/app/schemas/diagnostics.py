from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


class AdminDiagnosticItem(BaseModel):
    id: int
    code: str
    display_name: str
    description: str | None = None
    outcome_table_name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class AdminDiagnosticsResponse(BaseModel):
    items: list[AdminDiagnosticItem]


class AdminActiveVersion(BaseModel):
    version_id: int
    name: str
    src_hash: str | None
    activated_at: str
    activated_by_admin_id: int


class AdminActiveVersionItem(BaseModel):
    diagnostic_id: int
    diagnostic_code: str
    display_name: str
    active_version: AdminActiveVersion | None


class AdminActiveVersionsResponse(BaseModel):
    items: list[AdminActiveVersionItem]


class AdminCreateVersionRequest(BaseModel):
    diagnostic_id: int
    name: str
    description: str | None = None
    system_prompt: str | None = None
    note: str | None = None


class AdminDiagnosticVersion(BaseModel):
    id: int
    diagnostic_id: int
    name: str
    description: str | None
    system_prompt: str | None
    note: str | None
    src_hash: str | None
    created_by_admin_id: int
    updated_by_admin_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AdminDiagnosticVersionListItem(BaseModel):
    id: int
    name: str
    status: Literal["draft", "finalized"]
    description: str | None
    note: str | None
    created_by_admin_id: int
    updated_by_admin_id: int
    created_at: datetime
    updated_at: datetime
    system_prompt_state: Literal["present", "empty"]
    is_active: bool


class AdminDiagnosticVersionsResponse(BaseModel):
    diagnostic_id: int
    items: list[AdminDiagnosticVersionListItem]


class AdminDiagnosticVersionAudit(BaseModel):
    last_imported_at: datetime | None
    last_imported_by_admin_id: int | None
    finalized_at: datetime | None
    finalized_by_admin_id: int | None


class AdminDiagnosticVersionDetail(BaseModel):
    id: int
    diagnostic_id: int
    name: str
    description: str | None
    note: str | None
    status: Literal["draft", "finalized"]
    system_prompt_preview: str | None
    src_hash: str | None
    created_by_admin_id: int
    updated_by_admin_id: int
    created_at: datetime
    updated_at: datetime
    summary: AdminFinalizeSummary
    audit: AdminDiagnosticVersionAudit | None


class AdminImportStructureResponse(BaseModel):
    version_id: int
    questions_imported: int
    options_imported: int
    outcomes_imported: int
    warnings: list[str]


class AdminUpdateSystemPromptRequest(BaseModel):
    system_prompt: str | None
    note: str | None = None


class AdminUpdateSystemPromptResponse(BaseModel):
    id: int
    system_prompt: str | None
    updated_at: datetime
    updated_by_admin_id: int

    model_config = ConfigDict(from_attributes=True)


class AdminFinalizeSummary(BaseModel):
    questions: int
    options: int
    outcomes: int


class AdminFinalizeVersionResponse(BaseModel):
    version_id: int
    src_hash: str
    summary: AdminFinalizeSummary
    finalized_at: datetime
    finalized_by_admin_id: int


class AdminActivateVersionRequest(BaseModel):
    diagnostic_id: int | None = None


class AdminActivateVersionResponse(BaseModel):
    diagnostic_id: int
    version_id: int
    activated_at: datetime
    activated_by_admin_id: int


class UserSessionStartResponse(BaseModel):
    session_code: str
    diagnostic_id: int
    version_id: int
    started_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UserFormQuestion(BaseModel):
    id: int
    q_code: str
    display_text: str
    multi: bool
    sort_order: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class UserFormOption(BaseModel):
    version_option_id: int
    opt_code: str
    display_label: str
    sort_order: int
    is_active: bool
    llm_op: dict[str, Any] | None = None


class UserFormOutcome(BaseModel):
    outcome_id: int
    sort_order: int
    meta: dict[str, Any] | None = None


class UserGetFormResponse(BaseModel):
    version_id: int
    questions: list[UserFormQuestion]
    options: dict[str, list[UserFormOption]]
    option_lookup: dict[str, dict[str, str]]
    outcomes: list[UserFormOutcome]
