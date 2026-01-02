import React, { useCallback, useEffect, useMemo, useState } from "react";

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient";
import { DiagnosticOption } from "../hooks/useDiagnostics";
import { VersionSelectOption } from "./ImportStructureCard";

export type FinalizeVersionResponse = {
  version_id: number
  src_hash: string
  summary: {
    questions: number
    options: number
    outcomes: number
  }
  finalized_at: string
  finalized_by_admin_id: number
};

export type FinalizeVersionCardProps = {
  token: string | null
  diagnosticOptions: DiagnosticOption[]
  selectedDiagnosticId: string | null
  onSelectDiagnostic: (value: string) => void
  versionOptions: VersionSelectOption[]
  selectedVersionId: string | null
  onSelectVersion: (value: string) => void
  onFinalized?: (payload: FinalizeVersionResponse) => void
  isLoading: boolean
};

export function FinalizeVersionCard({
  token,
  diagnosticOptions,
  selectedDiagnosticId,
  onSelectDiagnostic,
  versionOptions,
  selectedVersionId,
  onSelectVersion,
  onFinalized,
  isLoading,
}: FinalizeVersionCardProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [modalDetail, setModalDetail] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastSummary, setLastSummary] = useState<FinalizeVersionResponse["summary"] | null>(null);

  const draftOptions = useMemo(
    () => versionOptions.filter((option) => option.status === "draft" && option.value !== "0"),
    [versionOptions],
  );

  const selectedDraft = useMemo(
    () => draftOptions.find((option) => option.value === (selectedVersionId ?? "")) ?? null,
    [draftOptions, selectedVersionId],
  );

  const canOpenDialog = useMemo(() => {
    if (!token) return false;
    if (!selectedDiagnosticId) return false;
    if (!selectedDraft) return false;
    if (isLoading) return false;
    return true;
  }, [token, selectedDiagnosticId, selectedDraft, isLoading]);

  useEffect(() => {
    setModalError(null);
    setModalAction(null);
    setModalDetail(null);
    setSuccessMessage(null);
    setLastSummary(null);
  }, [selectedDiagnosticId]);

  const handleOpen = useCallback(() => {
    if (!canOpenDialog) return;
    setModalError(null);
    setModalAction(null);
    setModalDetail(null);
    setShowDialog(true);
  }, [canOpenDialog]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setShowDialog(false);
    setModalError(null);
    setModalAction(null);
    setModalDetail(null);
  }, [submitting]);

  const handleConfirm = useCallback(async () => {
    if (!token || !selectedDraft) return;
    setSubmitting(true);
    setModalError(null);
    setModalAction(null);
    setModalDetail(null);

    try {
      const response = await adminFetch(
        adminProxyPath(`/admin/diagnostics/versions/${selectedDraft.value}/finalize`),
        {
          method: "POST",
        },
      );
      const payload = (await response.json()) as FinalizeVersionResponse;
      setSubmitting(false);
      setShowDialog(false);
      setSuccessMessage("版をフリーズしました");
      setLastSummary(payload.summary);
      onFinalized?.(payload);
    } catch (err) {
      if (err instanceof AdminApiError) {
        const resolved = resolveAdminError(err.code);
        setModalError(resolved?.message ?? err.message ?? "版のフリーズに失敗しました");
        setModalAction(resolved?.action ?? null);
        try {
          const body = (await err.response?.json()) as any;
          const detail = body?.error?.detail;
          setModalDetail(typeof detail === "string" ? detail : null);
        } catch {
          setModalDetail(null);
        }
      } else if (err instanceof Error) {
        setModalError(err.message === "Failed to fetch" ? "Finalize の通信に失敗しました" : err.message);
        setModalAction(null);
        setModalDetail(null);
      } else {
        setModalError("版のフリーズに失敗しました");
        setModalAction(null);
        setModalDetail(null);
      }
      setSubmitting(false);
    }
  }, [token, selectedDraft, onFinalized]);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
      <header>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>版フリーズ</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
          Draft 版を固定し、参照APIで利用できるようにします。Finalize 後は編集できません。
        </p>
      </header>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>診断名</span>
        <select
          value={selectedDiagnosticId ?? ""}
          onChange={(event) => onSelectDiagnostic(event.target.value)}
          disabled={isLoading || diagnosticOptions.length === 0 || !token}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !token || isLoading ? "#f8fafc" : "white",
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
      </label>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>版（Draft）</span>
        <select
          value={selectedVersionId ?? ""}
          onChange={(event) => onSelectVersion(event.target.value)}
          disabled={!selectedDiagnosticId || isLoading}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !selectedDiagnosticId || isLoading ? "#f8fafc" : "white",
          }}
        >
          {!selectedDiagnosticId ? (
            <option value="">診断を選択してください</option>
          ) : draftOptions.length === 0 ? (
            <option value="">Draft 版が存在しません</option>
          ) : (
            draftOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
        </select>
        {selectedVersionId === "0" ? (
          <span style={{ color: "#b45309", fontSize: "0.85rem" }}>初期テンプレートは Finalize 対象外です。</span>
        ) : null}
      </label>

      <button
        type="button"
        onClick={handleOpen}
        disabled={!canOpenDialog}
        style={{
          padding: "0.6rem 1rem",
          borderRadius: "9999px",
          border: "none",
          background: canOpenDialog ? "#2563eb" : "#94a3b8",
          color: "white",
          fontWeight: 600,
          cursor: canOpenDialog ? "pointer" : "not-allowed",
        }}
      >
        版フリーズ
      </button>

      {successMessage && lastSummary ? (
        <div
          role="status"
          style={{
            background: "#ecfdf5",
            borderRadius: "0.75rem",
            padding: "0.75rem",
            border: "1px solid #86efac",
            color: "#14532d",
            display: "grid",
            gap: "0.35rem",
          }}
        >
          <span style={{ fontWeight: 600 }}>{successMessage}</span>
          <span>{`質問: ${lastSummary.questions} / 選択肢: ${lastSummary.options} / アウトカム: ${lastSummary.outcomes}`}</span>
        </div>
      ) : null}

      {showDialog ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            zIndex: 9999,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              background: "white",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              width: "min(400px, 100%)",
              boxShadow: "0 25px 50px -12px rgba(30, 64, 175, 0.25)",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <header>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>版をフリーズしますか？</h3>
              <p style={{ margin: "0.35rem 0 0", color: "#475569" }}>
                {selectedDraft ? `${selectedDraft.label} を Finalize すると編集できなくなります。` : "Draft 版を選択してください。"}
              </p>
            </header>

            {modalError ? (
              <div role="alert" style={{ color: "#b42318", display: "grid", gap: "0.25rem" }}>
                <span>{modalError}</span>
                {modalAction ? <span>{modalAction}</span> : null}
                {modalDetail ? <span>{modalDetail}</span> : null}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "9999px",
                  border: "1px solid #334155",
                  background: "white",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: submitting ? "not-allowed" : "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={submitting || !selectedDraft}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "9999px",
                  border: "none",
                  background: submitting || !selectedDraft ? "#94a3b8" : "#15803d",
                  color: "white",
                  fontWeight: 600,
                  cursor: submitting || !selectedDraft ? "not-allowed" : "pointer",
                }}
              >
                {submitting ? "実行中..." : "実行する"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
