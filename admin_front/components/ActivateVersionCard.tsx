import React, { useCallback, useMemo, useState } from "react";

import { ActiveVersionListItem } from "../hooks/useActiveVersions";
import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient";

type VersionListItem = {
  id: number;
  name: string;
  status: "draft" | "finalized";
  isActive: boolean;
};

type ActivateVersionCardProps = {
  token: string | null;
  items: ActiveVersionListItem[];
  isLoading: boolean;
  error: { message: string; action: string | null } | null;
  onReloadActiveVersions: () => void;
  onReloadVersions: (diagnosticId: number) => void;
};

type VersionsApiResponse = {
  diagnostic_id: number;
  items: Array<{
    id: number;
    name: string;
    status: "draft" | "finalized";
    description: string | null;
    note: string | null;
    is_active: boolean;
    system_prompt_state: "present" | "empty";
    created_at: string;
    updated_at: string;
  }>;
};

function buildErrorMessage(err: AdminApiError, fallback: string): { message: string; action: string | null } {
  if (err.code === "E030") {
    return {
      message: "Finalize 済みの版のみアクティブ化できます",
      action: null,
    };
  }
  if (err.code === "E012") {
    return {
      message: "指定した診断と版が一致しません",
      action: null,
    };
  }

  const resolved = resolveAdminError(err.code);
  return {
    message: resolved?.message ?? err.message ?? fallback,
    action: resolved?.action ?? null,
  };
}

export function ActivateVersionCard({
  token,
  items,
  isLoading,
  error,
  onReloadActiveVersions,
  onReloadVersions,
}: ActivateVersionCardProps) {
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<ActiveVersionListItem | null>(null);
  const [modalOptions, setModalOptions] = useState<VersionListItem[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalAction, setModalAction] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const canOpen = useMemo(() => {
    if (!token) return false;
    if (isLoading) return false;
    return true;
  }, [token, isLoading]);

  const resetModal = useCallback(() => {
    setModalVisible(false);
    setSelectedDiagnostic(null);
    setModalOptions([]);
    setSelectedVersionId("");
    setModalLoading(false);
    setModalSubmitting(false);
    setModalError(null);
    setModalAction(null);
  }, []);

  const handleOpen = useCallback(
    async (item: ActiveVersionListItem) => {
      if (!token || !canOpen) return;

      setSuccessMessage(null);
      setSelectedDiagnostic(item);
      setModalVisible(true);
      setModalLoading(true);
      setModalSubmitting(false);
      setModalError(null);
      setModalAction(null);

      try {
        const response = await adminFetch(
          adminProxyPath(`/admin/diagnostics/${item.diagnosticId}/versions`),
          {
            method: "GET",
          },
        );
        const payload = (await response.json()) as VersionsApiResponse;
        const options = payload.items.map<VersionListItem>((entry) => ({
          id: entry.id,
          name: entry.name,
          status: entry.status,
          isActive: entry.is_active,
        }));
        setModalOptions(options);

        const defaultId =
          item.activeVersion?.versionId?.toString() ??
          options.find((option) => option.status === "finalized")?.id.toString() ??
          "";
        setSelectedVersionId(defaultId);
      } catch (err) {
        if (err instanceof AdminApiError) {
          const resolved = buildErrorMessage(err, "版一覧の取得に失敗しました");
          setModalError(resolved.message);
          setModalAction(resolved.action);
        } else if (err instanceof Error) {
          setModalError(err.message === "Failed to fetch" ? "版一覧の取得に失敗しました" : err.message);
          setModalAction(null);
        } else {
          setModalError("版一覧の取得に失敗しました");
          setModalAction(null);
        }
      } finally {
        setModalLoading(false);
      }
    },
    [token, canOpen],
  );

  const handleClose = useCallback(() => {
    if (modalSubmitting) return;
    resetModal();
  }, [modalSubmitting, resetModal]);

  const handleConfirm = useCallback(async () => {
    if (!token || !selectedDiagnostic || !selectedVersionId) {
      return;
    }
    const targetDiagnosticId = selectedDiagnostic.diagnosticId;
    setModalSubmitting(true);
    setModalError(null);
    setModalAction(null);

    try {
      const response = await adminFetch(
        adminProxyPath(`/admin/diagnostics/versions/${selectedVersionId}/activate`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ diagnostic_id: selectedDiagnostic.diagnosticId }),
        },
      );
      await response.json();
      setModalSubmitting(false);
      resetModal();
      setSuccessMessage("アクティブ版を切り替えました");
      onReloadActiveVersions();
      onReloadVersions(targetDiagnosticId);
    } catch (err) {
      if (err instanceof AdminApiError) {
        const resolved = buildErrorMessage(err, "アクティブ版の切り替えに失敗しました");
        setModalError(resolved.message);
        setModalAction(resolved.action);
        try {
          const body = (await err.response?.json()) as any;
          if (typeof body?.error?.detail === "string" && err.code !== "E030") {
            setModalError(body.error.detail);
          }
        } catch {
          // ignore parse errors
        }
      } else if (err instanceof Error) {
        setModalError(err.message === "Failed to fetch" ? "アクティブ版の切り替えに失敗しました" : err.message);
        setModalAction(null);
      } else {
        setModalError("アクティブ版の切り替えに失敗しました");
        setModalAction(null);
      }
      setModalSubmitting(false);
    }
  }, [
    token,
    selectedDiagnostic,
    selectedVersionId,
    onReloadActiveVersions,
    onReloadVersions,
    resetModal,
  ]);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>アクティブ版一覧</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            各診断の公開中バージョンを確認し、必要に応じて切り替えます。
          </p>
        </div>
        <button
          type="button"
          onClick={onReloadActiveVersions}
          disabled={isLoading}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "9999px",
            border: "1px solid #2563eb",
            background: isLoading ? "white" : "#2563eb",
            color: isLoading ? "#2563eb" : "white",
            fontWeight: 600,
            fontSize: "0.85rem",
          }}
        >
          {isLoading ? "更新中..." : "再読み込み"}
        </button>
      </header>

      {successMessage ? (
        <div role="status" style={{ color: "#15803d", fontWeight: 600 }}>
          {successMessage}
        </div>
      ) : null}

      {error ? (
        <div role="alert" style={{ color: "#b42318" }}>
          <p style={{ margin: 0 }}>{error.message}</p>
          {error.action ? <p style={{ margin: 0 }}>{error.action}</p> : null}
        </div>
      ) : null}

      {items.length === 0 && !isLoading ? (
        <p style={{ margin: 0, color: "#64748b" }}>アクティブ版の情報が見つかりません。</p>
      ) : null}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
        {items.map((item) => (
          <li
            key={item.diagnosticId}
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "0.65rem",
              padding: "0.75rem",
              display: "grid",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{item.displayName}</p>
                <p style={{ margin: "0.25rem 0 0", color: "#475569", fontSize: "0.9rem" }}>
                  コード: {item.diagnosticCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpen(item)}
                disabled={!canOpen}
                style={{
                  padding: "0.45rem 0.9rem",
                  borderRadius: "9999px",
                  border: "1px solid #0f172a",
                  background: !canOpen ? "white" : "#0f172a",
                  color: !canOpen ? "#0f172a" : "white",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                  cursor: !canOpen ? "not-allowed" : "pointer",
                }}
              >
                切り替え
              </button>
            </div>
            <div style={{ background: "#f8fafc", borderRadius: "0.5rem", padding: "0.75rem", display: "grid", gap: "0.35rem" }}>
              {item.activeVersion ? (
                <>
                  <span style={{ fontWeight: 600 }}>現在のアクティブ版</span>
                  <span>{item.activeVersion.name}</span>
                  <span style={{ fontSize: "0.85rem", color: "#475569" }}>
                    最終更新: {new Date(item.activeVersion.activatedAt).toLocaleString()}（Admin #{item.activeVersion.activatedByAdminId}）
                  </span>
                </>
              ) : (
                <span style={{ color: "#b45309", fontWeight: 600 }}>未設定（公開版が選択されていません）</span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {modalVisible ? (
        <div
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
              width: "min(440px, 100%)",
              boxShadow: "0 25px 50px -12px rgba(30, 64, 175, 0.25)",
              display: "grid",
              gap: "0.75rem",
            }}
          >
            <header>
              <h3 style={{ margin: 0, fontSize: "1.1rem" }}>
                {selectedDiagnostic?.displayName ?? "診断"} のアクティブ版を切り替え
              </h3>
              <p style={{ margin: "0.35rem 0 0", color: "#475569" }}>
                Finalize 済みの版のみ選択できます。Draft は事前に Finalize してください。
              </p>
            </header>

            {modalError ? (
              <div role="alert" style={{ color: "#b42318", display: "grid", gap: "0.25rem" }}>
                <span>{modalError}</span>
                {modalAction ? <span>{modalAction}</span> : null}
              </div>
            ) : null}

            <div style={{ maxHeight: "260px", overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: "0.65rem", padding: "0.5rem" }}>
              {modalLoading ? (
                <p style={{ margin: 0, color: "#475569" }}>版一覧を読み込み中...</p>
              ) : modalOptions.length === 0 ? (
                <p style={{ margin: 0, color: "#475569" }}>候補となる版が見つかりませんでした。</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
                  {modalOptions.map((option) => {
                    const value = option.id.toString();
                    const disabled = option.status !== "finalized";
                    return (
                      <li key={option.id}>
                        <label style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                          <input
                            type="radio"
                            name="active-version"
                            value={value}
                            checked={selectedVersionId === value}
                            aria-label={option.name}
                            onChange={() => setSelectedVersionId(value)}
                            disabled={disabled || modalSubmitting || modalLoading}
                          />
                          <div>
                            <span style={{ fontWeight: 600 }}>{option.name}</span>
                            <div style={{ fontSize: "0.85rem", color: "#475569" }}>
                              {option.status === "finalized" ? "Finalize 済み" : "Draft"}
                              {option.isActive ? " ・ 現在のアクティブ版" : ""}
                            </div>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleClose}
                disabled={modalSubmitting}
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "9999px",
                  border: "1px solid #334155",
                  background: "white",
                  color: "#334155",
                  fontWeight: 600,
                  cursor: modalSubmitting ? "not-allowed" : "pointer",
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={
                  modalSubmitting ||
                  modalLoading ||
                  !selectedVersionId ||
                  modalOptions.every((option) => option.status !== "finalized")
                }
                style={{
                  padding: "0.6rem 1rem",
                  borderRadius: "9999px",
                  border: "none",
                  background:
                    modalSubmitting ||
                    modalLoading ||
                    !selectedVersionId ||
                    modalOptions.every((option) => option.status !== "finalized")
                      ? "#94a3b8"
                      : "#15803d",
                  color: "white",
                  fontWeight: 600,
                  cursor:
                    modalSubmitting ||
                    modalLoading ||
                    !selectedVersionId ||
                    modalOptions.every((option) => option.status !== "finalized")
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                {modalSubmitting ? "実行中..." : "アクティブ版に切り替える"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
