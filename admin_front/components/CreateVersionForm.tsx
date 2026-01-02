import React, { FormEvent, useMemo, useState } from "react";

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient";
import { DiagnosticOption } from "../hooks/useDiagnostics";

export type CreatedDiagnosticVersion = {
  id: number
  diagnostic_id: number
  name: string
  description: string | null
  system_prompt: string | null
  note: string | null
  src_hash: string | null
  created_by_admin_id: number
  updated_by_admin_id: number
  created_at: string
  updated_at: string
};

type FieldErrors = {
  diagnosticId: string | null
  name: string | null
};

export type CreateVersionFormProps = {
  token: string | null
  diagnosticOptions: DiagnosticOption[]
  selectedDiagnosticId: string | null
  onSelectDiagnostic: (diagnosticId: string | null) => void
  onCreated?: (payload: CreatedDiagnosticVersion) => void
};

function buildFieldErrors(): FieldErrors {
  return {
    diagnosticId: null,
    name: null,
  };
}

export function CreateVersionForm({
  token,
  diagnosticOptions,
  selectedDiagnosticId,
  onSelectDiagnostic,
  onCreated,
}: CreateVersionFormProps) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(buildFieldErrors);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiAction, setApiAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => {
    return Boolean(token) && diagnosticOptions.length > 0 && !isSubmitting;
  }, [token, diagnosticOptions.length, isSubmitting]);

  const resetForm = () => {
    setName("");
    setNote("");
    setFieldErrors(buildFieldErrors());
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    setFieldErrors(buildFieldErrors());
    setApiError(null);
    setApiAction(null);
    setSuccessMessage(null);

    const errors = buildFieldErrors();
    if (!selectedDiagnosticId) {
      errors.diagnosticId = "診断を選択してください";
    }
    const trimmedName = name.trim();
    if (!trimmedName) {
      errors.name = "版名を入力してください";
    } else if (trimmedName.length > 128) {
      errors.name = "版名は128文字以内で入力してください";
    }

    if (errors.diagnosticId || errors.name) {
      setFieldErrors(errors);
      return;
    }

    const payload = {
      diagnostic_id: Number(selectedDiagnosticId),
      name: trimmedName,
      description: null,
      system_prompt: null,
      note: note.trim() ? note.trim() : null,
    };

    setIsSubmitting(true);
    try {
      const response = await adminFetch(adminProxyPath("/admin/diagnostics/versions"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const body = (await response.json()) as CreatedDiagnosticVersion;
      setSuccessMessage("診断版を作成しました");
      resetForm();
      onCreated?.(body);
    } catch (error) {
      if (error instanceof AdminApiError) {
        const resolved = resolveAdminError(error.code);
        setApiError(resolved?.message ?? error.message ?? "診断版の作成に失敗しました");
        setApiAction(resolved?.action ?? null);
      } else if (error instanceof Error) {
        setApiError(error.message);
        setApiAction(null);
      } else {
        setApiError("診断版の作成に失敗しました");
        setApiAction(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      role="form"
      aria-label="create-version-form"
      onSubmit={handleSubmit}
      style={{
        display: "grid",
        gap: "0.75rem",
      }}
    >
      <div style={{ display: "grid", gap: "0.35rem" }}>
        <label htmlFor="diagnostic-select" style={{ fontWeight: 600 }}>
          診断名
        </label>
        <select
          id="diagnostic-select"
          value={selectedDiagnosticId ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            onSelectDiagnostic(value === "" ? null : value);
            setFieldErrors((prev) => ({ ...prev, diagnosticId: null }));
          }}
          disabled={diagnosticOptions.length === 0 || !token || isSubmitting}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !token ? "#f1f5f9" : "white",
          }}
        >
          <option value="">診断を選択してください</option>
          {diagnosticOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
              {option.isActive ? "" : "（非アクティブ）"}
            </option>
          ))}
        </select>
        {fieldErrors.diagnosticId ? (
          <span style={{ color: "#b42318", fontSize: "0.85rem" }}>{fieldErrors.diagnosticId}</span>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "0.35rem" }}>
        <label htmlFor="version-name" style={{ fontWeight: 600 }}>
          版名
        </label>
        <input
          id="version-name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setFieldErrors((prev) => ({ ...prev, name: null }));
          }}
          maxLength={256}
          placeholder="例: v2024-09-draft"
          disabled={!token || isSubmitting}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !token ? "#f1f5f9" : "white",
          }}
        />
        {fieldErrors.name ? (
          <span style={{ color: "#b42318", fontSize: "0.85rem" }}>{fieldErrors.name}</span>
        ) : null}
      </div>

      <div style={{ display: "grid", gap: "0.35rem" }}>
        <label htmlFor="version-note" style={{ fontWeight: 600 }}>
          作成メモ
        </label>
        <textarea
          id="version-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="初期下書きの背景やメモ"
          disabled={!token || isSubmitting}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !token ? "#f1f5f9" : "white",
          }}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          padding: "0.65rem 1.1rem",
          borderRadius: "9999px",
          border: "none",
          background: canSubmit ? "#2563eb" : "#94a3b8",
          color: "white",
          fontWeight: 600,
        }}
      >
        {isSubmitting ? "作成中..." : "新規作成"}
      </button>

      {successMessage ? (
        <div role="status" style={{ color: "#166534", fontWeight: 600 }}>
          {successMessage}
        </div>
      ) : null}

      {apiError ? (
        <div role="alert" style={{ color: "#b42318" }}>
          <p style={{ margin: 0 }}>{apiError}</p>
          {apiAction ? <p style={{ margin: 0 }}>{apiAction}</p> : null}
        </div>
      ) : null}
    </form>
  );
}
