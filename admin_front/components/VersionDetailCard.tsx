import React, { useCallback, useMemo, useState } from "react"

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient"
import { DiagnosticOption } from "../hooks/useDiagnostics"
import { VersionDetail } from "../hooks/useVersionDetail"
import { formatJstTimestamp } from "../lib/date"
import { VersionSelectOption } from "./ImportStructureCard"

type VersionDetailCardProps = {
  token: string | null
  diagnosticOptions: DiagnosticOption[]
  selectedDiagnosticId: string | null
  onSelectDiagnostic: (value: string) => void
  versionOptions: VersionSelectOption[]
  selectedVersionId: string | null
  onSelectVersion: (value: string) => void
  detail: VersionDetail | null
  isLoading: boolean
  errorMessage: string | null
  errorAction: string | null
  onReload: () => void
}

const STATUS_LABEL: Record<"draft" | "finalized", string> = {
  draft: "Draft",
  finalized: "Finalized",
}

export function VersionDetailCard({
  token,
  diagnosticOptions,
  selectedDiagnosticId,
  onSelectDiagnostic,
  versionOptions,
  selectedVersionId,
  onSelectVersion,
  detail,
  isLoading,
  errorMessage,
  errorAction,
  onReload,
}: VersionDetailCardProps) {
  const [fullPrompt, setFullPrompt] = useState<string | null>(null)
  const [showFullPrompt, setShowFullPrompt] = useState(false)
  const [loadingPrompt, setLoadingPrompt] = useState(false)
  const [promptError, setPromptError] = useState<string | null>(null)
  const [promptAction, setPromptAction] = useState<string | null>(null)

  const canSelectVersion = useMemo(
    () => !!selectedDiagnosticId && versionOptions.length > 0,
    [selectedDiagnosticId, versionOptions],
  )

  const handleReload = useCallback(() => {
    if (isLoading) return
    onReload()
  }, [isLoading, onReload])

  const handleTogglePrompt = useCallback(async () => {
    if (!token || !selectedVersionId || selectedVersionId === "0") return

    if (showFullPrompt) {
      setShowFullPrompt(false)
      return
    }

    if (fullPrompt) {
      setShowFullPrompt(true)
      return
    }

    setLoadingPrompt(true)
    setPromptError(null)
    setPromptAction(null)

    try {
      const response = await adminFetch(
        adminProxyPath(`/admin/diagnostics/versions/${selectedVersionId}/system-prompt`),
        {
          method: "GET",
        },
      )
      const payload = (await response.json()) as { system_prompt: string | null }
      setFullPrompt(payload.system_prompt ?? "")
      setShowFullPrompt(true)
    } catch (err) {
      if (err instanceof AdminApiError) {
        const resolved = resolveAdminError(err.code)
        setPromptError(resolved?.message ?? err.message)
        setPromptAction(resolved?.action ?? null)
      } else if (err instanceof Error) {
        setPromptError(err.message === "Failed to fetch" ? "SYSTEM_PROMPTの取得に失敗しました" : err.message)
        setPromptAction(null)
      } else {
        setPromptError("SYSTEM_PROMPTの取得に失敗しました")
        setPromptAction(null)
      }
    } finally {
      setLoadingPrompt(false)
    }
  }, [token, selectedVersionId, fullPrompt, showFullPrompt])

  const renderDetailContent = () => {
    if (!token) {
      return <p style={{ margin: 0, color: "#64748b" }}>JWTを読み込んでから詳細を確認できます。</p>
    }
    if (!selectedDiagnosticId) {
      return <p style={{ margin: 0, color: "#64748b" }}>診断を選択すると版の詳細が表示されます。</p>
    }
    if (!selectedVersionId || selectedVersionId === "") {
      return <p style={{ margin: 0, color: "#64748b" }}>版を選択してください。</p>
    }
    if (selectedVersionId === "0") {
      return <p style={{ margin: 0, color: "#b45309" }}>初期テンプレートはAPI対象外のため詳細情報は表示できません。</p>
    }
    if (isLoading) {
      return <p style={{ margin: 0, color: "#64748b" }}>版詳細を読み込んでいます...</p>
    }
    if (errorMessage) {
      return (
        <div role="alert" style={{ color: "#b42318", display: "grid", gap: "0.3rem" }}>
          <span>{errorMessage}</span>
          {errorAction ? <span>{errorAction}</span> : null}
        </div>
      )
    }
    if (!detail) {
      return <p style={{ margin: 0, color: "#64748b" }}>版詳細を取得できませんでした。</p>
    }

    return (
      <div style={{ display: "grid", gap: "0.75rem" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 600 }}>{detail.name}</span>
          <span
            style={{
              padding: "0.2rem 0.6rem",
              borderRadius: "9999px",
              background: detail.status === "draft" ? "#0369a1" : "#059669",
              color: "white",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {STATUS_LABEL[detail.status]}
          </span>
        </div>

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
          <dt style={{ fontWeight: 600 }}>説明</dt>
          <dd style={{ margin: 0 }}>{detail.description ?? "説明は登録されていません。"}</dd>
          <dt style={{ fontWeight: 600 }}>メモ</dt>
          <dd style={{ margin: 0 }}>{detail.note ?? "メモは登録されていません。"}</dd>
          <dt style={{ fontWeight: 600 }}>作成者</dt>
          <dd style={{ margin: 0 }}>{detail.createdByAdminId}</dd>
          <dt style={{ fontWeight: 600 }}>更新者</dt>
          <dd style={{ margin: 0 }}>{detail.updatedByAdminId}</dd>
          <dt style={{ fontWeight: 600 }}>作成日時</dt>
          <dd style={{ margin: 0 }}>{formatJstTimestamp(detail.createdAt)}</dd>
          <dt style={{ fontWeight: 600 }}>更新日時</dt>
          <dd style={{ margin: 0 }}>{formatJstTimestamp(detail.updatedAt)}</dd>
        </dl>

        <div style={{ background: "#f8fafc", borderRadius: "0.65rem", padding: "0.75rem", color: "#334155" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>サマリ</p>
          <p style={{ margin: "0.25rem 0 0" }}>
            {`質問: ${detail.summary.questions} / 選択肢: ${detail.summary.options} / アウトカム: ${detail.summary.outcomes}`}
          </p>
        </div>

        <div style={{ background: "#f8fafc", borderRadius: "0.65rem", padding: "0.75rem", display: "grid", gap: "0.35rem" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#334155" }}>監査ログ</p>
          <p style={{ margin: 0 }}>
            最終取込: {formatJstTimestamp(detail.audit?.lastImportedAt)}
            {`（ID: ${detail.audit?.lastImportedByAdminId ?? "--"}）`}
          </p>
          <p style={{ margin: 0 }}>
            Finalize: {formatJstTimestamp(detail.audit?.finalizedAt)}
            {`（ID: ${detail.audit?.finalizedByAdminId ?? "--"}）`}
          </p>
        </div>

        <div style={{ display: "grid", gap: "0.4rem" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#334155" }}>SYSTEM_PROMPT プレビュー</p>
          <p style={{ margin: 0, color: "#475569", whiteSpace: "pre-wrap" }}>
            {detail.systemPromptPreview ?? "SYSTEM_PROMPT は登録されていません。"}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={handleTogglePrompt}
              disabled={loadingPrompt || !token}
              style={{
                padding: "0.5rem 0.9rem",
                borderRadius: "9999px",
                border: "1px solid #2563eb",
                background: loadingPrompt ? "#f8fafc" : "#2563eb",
                color: loadingPrompt ? "#2563eb" : "white",
                fontWeight: 600,
              }}
            >
              {loadingPrompt
                ? "全文を取得中..."
                : showFullPrompt
                ? "全文を閉じる"
                : fullPrompt
                ? "全文を表示"
                : "全文を取得"}
            </button>
            <button
              type="button"
              onClick={() => {
                setFullPrompt(null)
                setShowFullPrompt(false)
                setPromptError(null)
                setPromptAction(null)
              }}
              style={{
                padding: "0.5rem 0.9rem",
                borderRadius: "9999px",
                border: "1px solid #94a3b8",
                background: "white",
                color: "#334155",
                fontWeight: 600,
              }}
            >
              リセット
            </button>
          </div>
          {promptError ? (
            <div role="alert" style={{ color: "#b42318", display: "grid", gap: "0.3rem" }}>
              <span>{promptError}</span>
              {promptAction ? <span>{promptAction}</span> : null}
            </div>
          ) : null}
          {showFullPrompt ? (
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "0.65rem",
                padding: "0.75rem",
                background: "#f1f5f9",
                maxHeight: "240px",
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                color: "#1f2937",
              }}
            >
              {fullPrompt ?? ""}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>版詳細</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
            選択中の版のステータス・監査情報・SYSTEM_PROMPTプレビューを確認します。
          </p>
        </div>
        <button
          type="button"
          onClick={handleReload}
          disabled={isLoading || !token || !selectedVersionId || selectedVersionId === "0"}
          style={{
            padding: "0.45rem 0.9rem",
            borderRadius: "9999px",
            border: "1px solid #2563eb",
            background: isLoading ? "#f8fafc" : "#2563eb",
            color: isLoading ? "#2563eb" : "white",
            fontWeight: 600,
          }}
        >
          {isLoading ? "再読み込み中..." : "再読み込み"}
        </button>
      </header>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>診断名</span>
        <select
          value={selectedDiagnosticId ?? ""}
          onChange={(event) => onSelectDiagnostic(event.target.value)}
          disabled={isLoading || diagnosticOptions.length === 0}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: isLoading ? "#f8fafc" : "white",
          }}
        >
          {diagnosticOptions.length === 0 ? (
            <option value="">{isLoading ? "診断を読み込んでいます..." : "診断が登録されていません"}</option>
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
        <span style={{ fontWeight: 600 }}>版</span>
        <select
          value={selectedVersionId ?? ""}
          onChange={(event) => onSelectVersion(event.target.value)}
          disabled={!canSelectVersion || isLoading}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: !canSelectVersion || isLoading ? "#f8fafc" : "white",
          }}
        >
          {!selectedDiagnosticId ? (
            <option value="">診断を選択してください</option>
          ) : versionOptions.length === 0 ? (
            <option value="">版が存在しません</option>
          ) : (
            versionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          )}
        </select>
      </label>

      {renderDetailContent()}
    </div>
  )
}
