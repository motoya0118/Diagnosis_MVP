"""Diagnostics domain service helpers."""

from __future__ import annotations

from importlib import import_module
from typing import Any

_LAZY_IMPORTS: dict[str, tuple[str, str]] = {
    "SESSION_CODE_MAX_ATTEMPTS": (
        "app.services.diagnostics.session_manager",
        "SESSION_CODE_MAX_ATTEMPTS",
    ),
    "StructureImportBatch": (
        "app.services.diagnostics.structure_importer",
        "StructureImportBatch",
    ),
    "StructureImportParseError": (
        "app.services.diagnostics.structure_importer",
        "StructureImportParseError",
    ),
    "StructureImportSummary": (
        "app.services.diagnostics.structure_importer",
        "StructureImportSummary",
    ),
    "StructureImporter": (
        "app.services.diagnostics.structure_importer",
        "StructureImporter",
    ),
    "submit_session_answers": (
        "app.services.diagnostics.answer_recorder",
        "submit_session_answers",
    ),
    "ensure_option_buckets": (
        "app.services.diagnostics.form_loader",
        "ensure_option_buckets",
    ),
    "load_finalized_version": (
        "app.services.diagnostics.form_loader",
        "load_finalized_version",
    ),
    "sorted_options": (
        "app.services.diagnostics.form_loader",
        "sorted_options",
    ),
    "sorted_outcomes": (
        "app.services.diagnostics.form_loader",
        "sorted_outcomes",
    ),
    "sorted_questions": (
        "app.services.diagnostics.form_loader",
        "sorted_questions",
    ),
    "TemplateExporter": (
        "app.services.diagnostics.template_exporter",
        "TemplateExporter",
    ),
    "create_diagnostic_session": (
        "app.services.diagnostics.session_manager",
        "create_diagnostic_session",
    ),
    "generate_session_code": (
        "app.services.diagnostics.session_manager",
        "generate_session_code",
    ),
    "record_diagnostic_version_log": (
        "app.services.diagnostics.audit",
        "record_diagnostic_version_log",
    ),
    "call_session_llm": (
        "app.services.diagnostics.llm_executor",
        "call_session_llm",
    ),
    "create_bedrock_client": (
        "app.services.diagnostics.llm_executor",
        "create_bedrock_client",
    ),
    "set_bedrock_client_factory": (
        "app.services.diagnostics.llm_executor",
        "set_bedrock_client_factory",
    ),
    "create_gemini_client": (
        "app.services.diagnostics.llm_executor",
        "create_gemini_client",
    ),
    "set_gemini_client_factory": (
        "app.services.diagnostics.llm_executor",
        "set_gemini_client_factory",
    ),
}

__all__ = sorted(_LAZY_IMPORTS)


def __getattr__(name: str) -> Any:
    try:
        module_path, attribute = _LAZY_IMPORTS[name]
    except KeyError as exc:  # pragma: no cover - defensive branch
        raise AttributeError(name) from exc

    module = import_module(module_path)
    value = getattr(module, attribute)
    globals()[name] = value
    return value


def __dir__() -> list[str]:  # pragma: no cover - simple proxy
    return list(__all__)
