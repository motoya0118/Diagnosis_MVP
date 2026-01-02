"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

import { AdminApiError, resolveAdminError } from "../../lib/apiClient";
import { downloadVersionTemplate } from "../../lib/templateDownloader";
import { useAdminDiagnostics } from "../../hooks/useDiagnostics";
import { useDiagnosticVersions } from "../../hooks/useDiagnosticVersions";
import { useVersionDetail } from "../../hooks/useVersionDetail";
import { CreateVersionForm } from "../../components/CreateVersionForm";
import { ImportStructureCard } from "../../components/ImportStructureCard";
import { FinalizeVersionCard } from "../../components/FinalizeVersionCard";
import { SystemPromptCard } from "../../components/SystemPromptCard";
import { useActiveVersions } from "../../hooks/useActiveVersions";
import { ActivateVersionCard } from "../../components/ActivateVersionCard";
import { VersionDetailCard } from "../../components/VersionDetailCard";
import { useAdminLayout } from "../providers";
import type { VersionSelectOption } from "../../components/ImportStructureCard";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}分${secs.toString().padStart(2, "0")}秒`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { setHeaderVisible, setHeaderConfig, resetHeaderConfig } = useAdminLayout();
  const { data: session, status, update } = useSession();
  const token = session?.backendAccessToken ?? null;
  const adminUserId = session?.adminUserId ?? null;
  const issuedAt = session?.backendTokenIssuedAt ?? null;
  const expiresAt = session?.backendTokenExpiresAt ?? null;
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selectedDiagnosticId, setSelectedDiagnosticId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>("0");
  const [downloading, setDownloading] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templateErrorAction, setTemplateErrorAction] = useState<string | null>(null);
  const {
    diagnostics,
    options: diagnosticOptions,
    isLoading: diagnosticsLoading,
    error: diagnosticsError,
    reload: reloadDiagnostics,
  } = useAdminDiagnostics({
    includeInactive,
  });
  const {
    versions,
    isLoading: versionsLoading,
    error: versionsError,
    reload: reloadVersions,
  } = useDiagnosticVersions({
    diagnosticId: selectedDiagnosticId,
  });
  const {
    detail: versionDetail,
    isLoading: versionDetailLoading,
    error: versionDetailError,
    reload: reloadVersionDetail,
  } = useVersionDetail({
    versionId: selectedVersionId,
  });
  const {
    items: activeVersionItems,
    isLoading: activeVersionsLoading,
    error: activeVersionsError,
    reload: reloadActiveVersions,
  } = useActiveVersions({
    diagnosticId: null,
    diagnosticCode: null,
  });
  const selectedDiagnostic = selectedDiagnosticId
    ? diagnostics.find((diagnostic) => String(diagnostic.id) === selectedDiagnosticId)
    : null;
  const versionOptions = useMemo<VersionSelectOption[]>(() => {
    if (!selectedDiagnosticId) return [];
    const options: VersionSelectOption[] = [
      {
        value: "0",
        label: "初期テンプレート（Draft コピー）",
        status: "draft",
        isActive: true,
      },
    ];
    versions.forEach((version) => {
      const statusLabel = version.status === "draft" ? "Draft" : "Finalized";
      const activeLabel = version.isActive ? "・アクティブ" : "";
      options.push({
        value: String(version.id),
        label: `${version.name}（${statusLabel}${activeLabel}）`,
        status: version.status,
        isActive: version.isActive,
      });
    });
    return options;
  }, [versions, selectedDiagnosticId]);
  const draftVersionOptions = useMemo(
    () => versionOptions.filter((option) => option.value !== "0" && option.status === "draft"),
    [versionOptions],
  );
  const promptVersionOptions = useMemo(
    () => versionOptions.filter((option) => option.value !== "0"),
    [versionOptions],
  );
  const downloadDisabled =
    !token || !selectedDiagnosticId || !selectedVersionId || versionsLoading || downloading;
  const detailCardLoading = versionDetailLoading || versionsLoading;
  const versionDetailErrorMessage = versionDetailError?.message ?? null;
  const versionDetailErrorAction = versionDetailError?.action ?? null;

  useEffect(() => {
    setHeaderVisible(true);
  }, [setHeaderVisible]);

  useEffect(() => {
    if (adminUserId) {
      setHeaderConfig({
        brandSubLabel: `ログイン中: ${adminUserId}`,
      });
      return () => {
        resetHeaderConfig();
      };
    }
    resetHeaderConfig();
    return undefined;
  }, [adminUserId, resetHeaderConfig, setHeaderConfig]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    }
  }, [router, status]);

  useEffect(() => {
    const expiresAt = session?.backendTokenExpiresAt ?? null;
    if (!expiresAt) {
      setTimeLeft(0);
      return;
    }

    const compute = () => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
    };

    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [session?.backendTokenExpiresAt]);

  useEffect(() => {
    if (!diagnosticOptions.length) {
      setSelectedDiagnosticId(null);
      return;
    }
    if (!selectedDiagnosticId || !diagnosticOptions.some((option) => option.value === selectedDiagnosticId)) {
      setSelectedDiagnosticId(diagnosticOptions[0].value);
    }
  }, [diagnosticOptions, selectedDiagnosticId]);

  useEffect(() => {
    if (!diagnosticsError) return;
    if (diagnosticsError.status === 401) {
      void signOut({ callbackUrl: "/" });
    }
  }, [diagnosticsError]);

  useEffect(() => {
    if (!selectedDiagnosticId) {
      setSelectedVersionId("");
      setTemplateError(null);
      setTemplateErrorAction(null);
      return;
    }
    setSelectedVersionId("0");
    setTemplateError(null);
    setTemplateErrorAction(null);
  }, [selectedDiagnosticId]);

  useEffect(() => {
    setTemplateError(null);
    setTemplateErrorAction(null);
  }, [selectedVersionId]);

  useEffect(() => {
    if (!selectedDiagnosticId) return;
    if (
      selectedVersionId &&
      selectedVersionId !== "0" &&
      draftVersionOptions.some((option) => option.value === selectedVersionId)
    ) {
      return;
    }
    const firstDraft = draftVersionOptions[0];
    if (firstDraft) {
      setSelectedVersionId(firstDraft.value);
    }
  }, [draftVersionOptions, selectedDiagnosticId, selectedVersionId]);

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error(err);
      setError("クリップボードへコピーできませんでした");
    }
  };

  const handleRefresh = async () => {
    if (!token) return;
    setRefreshing(true);
    setError(null);
    setErrorAction(null);

    try {
      const nextSession = await update({ action: "refresh" });
      if (!nextSession) {
        setError("トークンの更新に失敗しました");
        setErrorAction("再度ログインしてください");
        await signOut({ callbackUrl: "/" });
        return;
      }

      const nextError = (nextSession as any).error as string | undefined | null;
      if (nextError) {
        const resolved = resolveAdminError(nextError);
        setError(resolved?.message ?? "トークンの更新に失敗しました");
        const shouldForceLogout = ["HTTP_401", "E11104", "E11105", "E11106", "E11107"].includes(nextError);
        setErrorAction(
          resolved?.action ?? (shouldForceLogout ? "再度ログインしてください" : null),
        );
        if (shouldForceLogout) {
          await signOut({ callbackUrl: "/" });
        }
        return;
      }

      reloadDiagnostics();
      setError(null);
      setErrorAction(null);
    } catch (err) {
      console.error(err);
      if (err instanceof Error && err.message === "Failed to fetch") {
        setError("ネットワークエラーが発生しました");
        setErrorAction(null);
      } else if (err instanceof Error && err.message) {
        const resolved = resolveAdminError(err.message);
        setError(resolved?.message ?? err.message);
        setErrorAction(resolved?.action ?? null);
      } else {
        setError("トークンの更新に失敗しました");
        setErrorAction(null);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const handleDownloadTemplate = async () => {
    if (!token || !selectedDiagnosticId || !selectedVersionId) return;
    setTemplateError(null);
    setTemplateErrorAction(null);
    setDownloading(true);
    try {
      await downloadVersionTemplate({
        token,
        diagnosticId: selectedDiagnosticId,
        versionId: selectedVersionId,
      });
    } catch (err) {
      console.error(err);
      if (err instanceof AdminApiError) {
        const resolved = resolveAdminError(err.code);
        setTemplateError(resolved?.message ?? err.message);
        setTemplateErrorAction(resolved?.action ?? null);
      } else if (err instanceof Error) {
        setTemplateError(err.message === "Failed to fetch" ? "テンプレートのダウンロードに失敗しました" : err.message);
        setTemplateErrorAction(null);
      } else {
        setTemplateError("テンプレートのダウンロードに失敗しました");
        setTemplateErrorAction(null);
      }
    } finally {
      setDownloading(false);
    }
  };

  if (status === "loading") {
    return null;
  }

  if (!token) {
    return null;
  }

  return (
    <section className="card" aria-label="admin-dashboard">
      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>Admin Dashboard</h1>
        <p style={{ color: "#52606d" }}>ユーザーID: {adminUserId ?? "不明"}</p>
      </header>

      <article style={{ display: "grid", gap: "1rem" }}>
        <div>
          <span style={{ fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>現在のJWT</span>
          <textarea
            readOnly
            value={token}
            rows={5}
            style={{
              width: "100%",
              padding: "0.75rem",
              borderRadius: "0.75rem",
              border: "1px solid #cbd2d9",
              fontFamily: "monospace",
              fontSize: "0.88rem",
            }}
          />
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              type="button"
              onClick={handleCopy}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "none",
                background: copied ? "#16a34a" : "#2563eb",
                color: "white",
                fontWeight: 600,
              }}
            >
              {copied ? "コピーしました" : "コピー"}
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "9999px",
                border: "1px solid #2563eb",
                background: "white",
                color: "#2563eb",
                fontWeight: 600,
              }}
            >
              {refreshing ? "更新中..." : "トークン更新"}
            </button>
          </div>
        </div>

        <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "0.75rem" }}>
          <p style={{ margin: 0, color: "#334155", fontWeight: 600 }}>トークン状態</p>
          <ul style={{ listStyle: "none", padding: 0, marginTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
            <li>発行時刻: {issuedAt ? new Date(issuedAt).toLocaleString() : "-"}</li>
            <li>有効期限: {expiresAt ? new Date(expiresAt).toLocaleString() : "-"}</li>
            <li>残り時間: {formatDuration(timeLeft)}</li>
          </ul>
        </div>

        <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>診断フィルタ</h2>
            <button
              type="button"
              onClick={reloadDiagnostics}
              disabled={diagnosticsLoading}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "9999px",
                border: "1px solid #2563eb",
                background: diagnosticsLoading ? "white" : "#2563eb",
                color: diagnosticsLoading ? "#2563eb" : "white",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              {diagnosticsLoading ? "再読み込み中..." : "再読み込み"}
            </button>
          </header>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>診断名</span>
            <select
              value={selectedDiagnosticId ?? ""}
              onChange={(event) => setSelectedDiagnosticId(event.target.value)}
              disabled={diagnosticsLoading || diagnosticOptions.length === 0}
              style={{
                padding: "0.65rem",
                borderRadius: "0.65rem",
                border: "1px solid #cbd2d9",
                background: diagnosticsLoading ? "#f8fafc" : "white",
              }}
            >
              {diagnosticOptions.length === 0 ? (
                <option value="">{diagnosticsLoading ? "診断を読み込み中..." : "診断が登録されていません"}</option>
              ) : (
                diagnosticOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.isActive ? "" : "（非アクティブ）"}
                  </option>
                ))
              )}
            </select>
            {diagnosticsLoading ? (
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>診断一覧を読み込んでいます...</span>
            ) : null}
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(event) => setIncludeInactive(event.target.checked)}
              disabled={diagnosticsLoading}
            />
            <span>非アクティブ診断も表示</span>
          </label>

          {diagnosticsError ? (
            <div role="alert" style={{ color: "#b42318" }}>
              <p style={{ margin: 0 }}>{diagnosticsError.message}</p>
              {diagnosticsError.action && <p style={{ margin: 0 }}>{diagnosticsError.action}</p>}
            </div>
          ) : null}

          {!diagnosticsLoading && !diagnosticsError && diagnosticOptions.length === 0 ? (
            <p style={{ margin: 0, color: "#64748b" }}>診断データが存在しません。</p>
          ) : null}

          {selectedDiagnostic ? (
            <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "0.65rem", display: "grid", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>{selectedDiagnostic.displayName}</span>
                {!selectedDiagnostic.isActive ? (
                  <span
                    style={{
                      padding: "0.15rem 0.6rem",
                      borderRadius: "9999px",
                      background: "#f97316",
                      color: "white",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                    }}
                  >
                    非アクティブ
                  </span>
                ) : null}
              </div>
              <p style={{ margin: 0, color: selectedDiagnostic.description ? "#475569" : "#94a3b8" }}>
                {selectedDiagnostic.description ?? "説明は登録されていません。"}
              </p>
              <dl
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr",
                  gap: "0.35rem 0.75rem",
                  margin: 0,
                  color: "#475569",
                  fontSize: "0.9rem",
                }}
              >
                <dt style={{ fontWeight: 600 }}>コード</dt>
                <dd style={{ margin: 0 }}>{selectedDiagnostic.code}</dd>
                <dt style={{ fontWeight: 600 }}>アウトカムテーブル</dt>
                <dd style={{ margin: 0 }}>{selectedDiagnostic.outcomeTableName}</dd>
              </dl>
            </div>
          ) : null}
        </div>

        <VersionDetailCard
          token={token}
          diagnosticOptions={diagnosticOptions}
          selectedDiagnosticId={selectedDiagnosticId}
          onSelectDiagnostic={setSelectedDiagnosticId}
          versionOptions={versionOptions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
          detail={versionDetail}
          isLoading={detailCardLoading}
          errorMessage={versionDetailErrorMessage}
          errorAction={versionDetailErrorAction}
          onReload={reloadVersionDetail}
        />

        <ImportStructureCard
          token={token}
          diagnosticOptions={diagnosticOptions}
          selectedDiagnosticId={selectedDiagnosticId}
          onSelectDiagnostic={setSelectedDiagnosticId}
          versionOptions={draftVersionOptions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
          onImportSuccess={() => {
            reloadVersions();
            reloadVersionDetail();
          }}
          isLoading={diagnosticsLoading || versionsLoading}
        />

        <FinalizeVersionCard
          token={token}
          diagnosticOptions={diagnosticOptions}
          selectedDiagnosticId={selectedDiagnosticId}
          onSelectDiagnostic={setSelectedDiagnosticId}
          versionOptions={versionOptions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
          onFinalized={() => {
            reloadVersions();
            reloadVersionDetail();
          }}
          isLoading={diagnosticsLoading || versionsLoading}
        />

        <SystemPromptCard
          token={token}
          diagnosticOptions={diagnosticOptions}
          selectedDiagnosticId={selectedDiagnosticId}
          onSelectDiagnostic={setSelectedDiagnosticId}
          versionOptions={promptVersionOptions}
          selectedVersionId={selectedVersionId}
          onSelectVersion={setSelectedVersionId}
          versionDetail={versionDetail}
          isLoadingDetail={detailCardLoading}
          onReloadVersionDetail={reloadVersionDetail}
          onReloadVersions={reloadVersions}
        />

        <ActivateVersionCard
          token={token}
          items={activeVersionItems}
          isLoading={activeVersionsLoading}
          error={
            activeVersionsError
              ? { message: activeVersionsError.message, action: activeVersionsError.action }
              : null
          }
          onReloadActiveVersions={reloadActiveVersions}
          onReloadVersions={(_diagnosticId) => {
            reloadVersions();
          }}
        />

        <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "1.1rem" }}>テンプレートダウンロード</h2>
              <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
                選択した診断と版のテンプレートを Excel 形式でダウンロードします。
              </p>
            </div>
            <button
              type="button"
              onClick={reloadVersions}
              disabled={versionsLoading || !selectedDiagnosticId || !session}
              style={{
                padding: "0.45rem 0.9rem",
                borderRadius: "9999px",
                border: "1px solid #0f172a",
                background: versionsLoading ? "white" : "#0f172a",
                color: versionsLoading ? "#0f172a" : "white",
                fontWeight: 600,
                fontSize: "0.85rem",
              }}
            >
              {versionsLoading ? "版一覧を更新中..." : "版一覧を更新"}
            </button>
          </header>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>診断名</span>
            <select
              value={selectedDiagnosticId ?? ""}
              onChange={(event) => setSelectedDiagnosticId(event.target.value)}
              disabled={diagnosticsLoading || diagnosticOptions.length === 0}
              style={{
                padding: "0.65rem",
                borderRadius: "0.65rem",
                border: "1px solid #cbd2d9",
                background: diagnosticsLoading ? "#f8fafc" : "white",
              }}
            >
              {diagnosticOptions.length === 0 ? (
                <option value="">{diagnosticsLoading ? "診断を読み込み中..." : "診断が登録されていません"}</option>
              ) : (
                diagnosticOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                    {option.isActive ? "" : "（非アクティブ）"}
                  </option>
                ))
              )}
            </select>
          </label>

          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>バージョン</span>
            <select
              value={selectedVersionId}
              onChange={(event) => setSelectedVersionId(event.target.value)}
              disabled={!selectedDiagnosticId || versionsLoading}
              style={{
                padding: "0.65rem",
                borderRadius: "0.65rem",
                border: "1px solid #cbd2d9",
                background: !selectedDiagnosticId || versionsLoading ? "#f8fafc" : "white",
              }}
            >
              {selectedDiagnosticId ? (
                versionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))
              ) : (
                <option value="">診断を選択してください</option>
              )}
            </select>
            {!selectedDiagnosticId ? (
              <span style={{ color: "#64748b", fontSize: "0.85rem" }}>
                ダウンロードする診断を選択してください。
              </span>
            ) : null}
          </label>

          {versionsError ? (
            <div role="alert" style={{ color: "#b42318" }}>
              <p style={{ margin: 0 }}>{versionsError.message}</p>
              {versionsError.action ? <p style={{ margin: 0 }}>{versionsError.action}</p> : null}
            </div>
          ) : null}

          {templateError ? (
            <div role="alert" style={{ color: "#b42318" }}>
              <p style={{ margin: 0 }}>{templateError}</p>
              {templateErrorAction ? <p style={{ margin: 0 }}>{templateErrorAction}</p> : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={handleDownloadTemplate}
            disabled={downloadDisabled}
            style={{
              padding: "0.6rem 1rem",
              borderRadius: "9999px",
              border: "none",
              background: downloadDisabled ? "#94a3b8" : "#2563eb",
              color: "white",
              fontWeight: 600,
              cursor:
                downloadDisabled ? "not-allowed" : "pointer",
            }}
          >
            {downloading ? "ダウンロード中..." : "テンプレートDL"}
          </button>
        </div>

        <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
          <header>
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>版の新規作成</h2>
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
              Draft 版を作成するとテンプレートの編集やインポートを開始できます。
            </p>
          </header>

          <CreateVersionForm
            token={token}
            diagnosticOptions={diagnosticOptions}
            selectedDiagnosticId={selectedDiagnosticId}
            onSelectDiagnostic={setSelectedDiagnosticId}
          />
        </div>

        {error ? (
          <div role="alert" style={{ color: "#b42318" }}>
            <p>{error}</p>
            {errorAction && <p>{errorAction}</p>}
          </div>
        ) : null}
      </article>
    </section>
  );
}
