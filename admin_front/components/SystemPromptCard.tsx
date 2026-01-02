"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient"
import { DiagnosticOption } from "../hooks/useDiagnostics"
import { VersionDetail } from "../hooks/useVersionDetail"
import { formatJstTimestamp } from "../lib/date"
import { VersionSelectOption } from "./ImportStructureCard"

const MAX_PROMPT_LENGTH = 100_000

type SystemPromptResponse = {
  system_prompt: string | null
}

type AdminUpdateSystemPromptResponse = {
  id: number
  system_prompt: string | null
  updated_at: string
  updated_by_admin_id: number
}

export type SystemPromptCardProps = {
  token: string | null
  diagnosticOptions: DiagnosticOption[]
  selectedDiagnosticId: string | null
  onSelectDiagnostic: (value: string) => void
  versionOptions: VersionSelectOption[]
  selectedVersionId: string | null
  onSelectVersion: (value: string) => void
  versionDetail: VersionDetail | null
  isLoadingDetail: boolean
  onReloadVersionDetail: () => void
  onReloadVersions?: () => void
}

export function SystemPromptCard({
  token,
  diagnosticOptions,
  selectedDiagnosticId,
  onSelectDiagnostic,
  versionOptions,
  selectedVersionId,
  onSelectVersion,
  versionDetail,
  isLoadingDetail,
  onReloadVersionDetail,
  onReloadVersions,
}: SystemPromptCardProps) {
  const [systemPrompt, setSystemPrompt] = useState("")
  const [originalPrompt, setOriginalPrompt] = useState("")
  const [note, setNote] = useState("")
  const [originalNote, setOriginalNote] = useState("")
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<string | null>(null)

  const selectedVersionOption = useMemo(
    () => versionOptions.find((option) => option.value === (selectedVersionId ?? "")) ?? null,
    [versionOptions, selectedVersionId],
  )
  const hasCurrentDetail = useMemo(() => {
    if (!versionDetail || !selectedVersionId) return false
    return String(versionDetail.id) === selectedVersionId
  }, [versionDetail, selectedVersionId])
  const overLimit = systemPrompt.length > MAX_PROMPT_LENGTH
  const isFetching = isLoadingDetail || isLoadingPrompt
  const isReady =
    !!token && !!selectedDiagnosticId && !!selectedVersionId && selectedVersionId !== "0" && hasCurrentDetail

  useEffect(() => {
    setMessage(null)
    setError(null)
    setErrorAction(null)
  }, [selectedVersionId, selectedDiagnosticId])

  useEffect(() => {
    if (!versionDetail || !selectedVersionId || String(versionDetail.id) !== selectedVersionId) {
      setNote("")
      setOriginalNote("")
      return
    }
    const initialNote = versionDetail.note ?? ""
    setNote(initialNote)
    setOriginalNote(initialNote)
  }, [versionDetail, selectedVersionId])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const resetPrompt = () => {
      setSystemPrompt("")
      setOriginalPrompt("")
    }

    if (!token || !selectedDiagnosticId || !selectedVersionId || selectedVersionId === "0") {
      resetPrompt()
      setIsLoadingPrompt(false)
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    if (!versionDetail || String(versionDetail.id) !== selectedVersionId) {
      resetPrompt()
      setIsLoadingPrompt(false)
      return () => {
        cancelled = true
        controller.abort()
      }
    }

    setIsLoadingPrompt(true)
    resetPrompt()

    const loadPrompt = async () => {
      try {
        const response = await adminFetch(
          adminProxyPath(`/admin/diagnostics/versions/${selectedVersionId}/system-prompt`),
          {
            method: "GET",
            signal: controller.signal,
          },
        )
        const payload = (await response.json()) as SystemPromptResponse
        if (cancelled) return
        const promptValue = payload.system_prompt ?? ""
        setSystemPrompt(promptValue)
        setOriginalPrompt(promptValue)
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        if (err instanceof AdminApiError) {
          const resolved = resolveAdminError(err.code)
          setError(resolved?.message ?? err.message)
          setErrorAction(resolved?.action ?? null)
        } else if (err instanceof Error) {
          setError(err.message === "Failed to fetch" ? "SYSTEM_PROMPTの取得に失敗しました" : err.message)
          setErrorAction(null)
        } else {
          setError("SYSTEM_PROMPTの取得に失敗しました")
          setErrorAction(null)
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPrompt(false)
        }
      }
    }

    void loadPrompt()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, selectedDiagnosticId, selectedVersionId, versionDetail])

  const handlePromptChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(event.target.value);
  }, []);

  const handleNoteChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(event.target.value);
  }, []);

  const handleReset = useCallback(() => {
    setSystemPrompt(originalPrompt);
    setNote(originalNote);
    setMessage(null);
    setError(null);
    setErrorAction(null);
  }, [originalPrompt, originalNote]);

  const handleSave = useCallback(async () => {
    if (!token || !versionDetail || !selectedVersionId || selectedVersionId === "0") return
    if (String(versionDetail.id) !== selectedVersionId) return
    if (versionDetail.status !== "draft") return
    if (overLimit) return

    setIsSaving(true)
    setMessage(null)
    setError(null)
    setErrorAction(null)

    const trimmedNote = note.trim()
    const payload = {
      system_prompt: systemPrompt,
      note: trimmedNote ? trimmedNote : null,
    }

    try {
      const response = await adminFetch(
        adminProxyPath(`/admin/diagnostics/versions/${selectedVersionId}/system-prompt`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      )
      const body = (await response.json()) as AdminUpdateSystemPromptResponse
      setMessage("SYSTEM_PROMPTを保存しました")
      const updatedPrompt = body.system_prompt ?? ""
      setSystemPrompt(updatedPrompt)
      setOriginalPrompt(updatedPrompt)
      const nextNote = payload.note ?? ""
      setNote(nextNote)
      setOriginalNote(nextNote)
      onReloadVersionDetail()
      onReloadVersions?.()
    } catch (err) {
      if (err instanceof AdminApiError) {
        const resolved = resolveAdminError(err.code)
        setError(resolved?.message ?? err.message)
        setErrorAction(resolved?.action ?? null)
      } else if (err instanceof Error) {
        setError(err.message === "Failed to fetch" ? "SYSTEM_PROMPTの保存に失敗しました" : err.message)
        setErrorAction(null)
      } else {
        setError("SYSTEM_PROMPTの保存に失敗しました")
        setErrorAction(null)
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    token,
    versionDetail,
    selectedVersionId,
    overLimit,
    note,
    systemPrompt,
    onReloadVersionDetail,
    onReloadVersions,
  ])

  const canSave = useMemo(() => {
    if (!token || !versionDetail) return false
    if (!selectedVersionId || String(versionDetail.id) !== selectedVersionId) return false
    if (versionDetail.status !== "draft") return false
    if (isFetching || isSaving) return false
    if (overLimit) return false
    return true
  }, [token, versionDetail, selectedVersionId, isFetching, isSaving, overLimit])

  const canReset = useMemo(() => {
    if (isFetching || isSaving) return false;
    return systemPrompt !== originalPrompt || note !== originalNote;
  }, [isFetching, isSaving, systemPrompt, originalPrompt, note, originalNote]);

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
      <header>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>SYSTEM_PROMPT 編集</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
          Draft 版の SYSTEM_PROMPT を編集し、LLM への指示文を最新化します。
        </p>
      </header>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>診断名</span>
        <select
          value={selectedDiagnosticId ?? ""}
          onChange={(event) => onSelectDiagnostic(event.target.value)}
          disabled={isFetching || isSaving || diagnosticOptions.length === 0}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: isFetching ? "#f8fafc" : "white",
          }}
        >
          {diagnosticOptions.length === 0 ? (
            <option value="">{isFetching ? "診断を読み込んでいます..." : "診断が登録されていません"}</option>
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
          value={selectedVersionId ?? ""}
          onChange={(event) => onSelectVersion(event.target.value)}
          disabled={isFetching || isSaving || !selectedDiagnosticId}
          style={{
            padding: "0.65rem",
            borderRadius: "0.65rem",
            border: "1px solid #cbd2d9",
            background: isFetching || !selectedDiagnosticId ? "#f8fafc" : "white",
          }}
        >
          {!selectedDiagnosticId ? (
            <option value="">診断を選択してください</option>
          ) : versionOptions.length === 0 ? (
            <option value="">Draft 版が存在しません</option>
          ) : (
            versionOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.status !== "draft"}>
                {option.label}
                {option.status !== "draft" ? "（finalize済）" : ""}
              </option>
            ))
          )}
        </select>
        {selectedVersionOption?.status !== "draft" ? (
          <span style={{ color: "#b45309", fontSize: "0.85rem" }}>
            Finalize 済みの版は編集できません。Draft 版を選択してください。
          </span>
        ) : null}
      </label>

      {versionDetail?.systemPromptPreview ? (
        <div style={{ background: "#f8fafc", padding: "0.75rem", borderRadius: "0.65rem" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#334155" }}>プレビュー</p>
          <p style={{ margin: "0.35rem 0 0", color: "#475569", whiteSpace: "pre-wrap" }}>
            {versionDetail.systemPromptPreview}
          </p>
        </div>
      ) : null}

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>SYSTEM_PROMPT</span>
        <textarea
          aria-label="SYSTEM_PROMPT"
          value={systemPrompt}
          onChange={handlePromptChange}
          rows={12}
          disabled={!isReady || isFetching || isSaving || selectedVersionOption?.status !== "draft"}
          style={{
            width: "100%",
            borderRadius: "0.75rem",
            border: "1px solid #cbd2d9",
            padding: "0.75rem",
            fontFamily: "monospace",
            minHeight: "200px",
            resize: "vertical",
            background: !isReady || isFetching ? "#f8fafc" : "white",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.85rem", color: overLimit ? "#b91c1c" : "#475569" }}>
          <span>{`${systemPrompt.length} / ${MAX_PROMPT_LENGTH}`}</span>
          {overLimit ? <span>上限（100000文字）を超えています</span> : null}
        </div>
      </label>

      <label style={{ display: "grid", gap: "0.35rem" }}>
        <span style={{ fontWeight: 600 }}>更新メモ</span>
        <textarea
          aria-label="更新メモ"
          value={note}
          onChange={handleNoteChange}
          rows={3}
          disabled={!isReady || isFetching || isSaving}
          style={{
            width: "100%",
            borderRadius: "0.75rem",
            border: "1px solid #cbd2d9",
            padding: "0.65rem",
            background: !isReady || isFetching ? "#f8fafc" : "white",
          }}
        />
      </label>

      <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
        最終更新: {formatJstTimestamp(versionDetail?.updatedAt)}（ID: {versionDetail?.updatedByAdminId ?? "--"}）
      </p>

      {message ? (
        <div role="status" style={{ color: "#16a34a" }}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div role="alert" style={{ color: "#b42318", display: "grid", gap: "0.25rem" }}>
          <span>{error}</span>
          {errorAction ? <span>{errorAction}</span> : null}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: "9999px",
            border: "none",
            background: canSave ? "#2563eb" : "#94a3b8",
            color: "white",
            fontWeight: 600,
            cursor: canSave ? "pointer" : "not-allowed",
          }}
        >
          保存
        </button>
        <button
          type="button"
          onClick={handleReset}
          disabled={!canReset}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: "9999px",
            border: "1px solid #334155",
            background: canReset ? "white" : "#f8fafc",
            color: "#334155",
            fontWeight: 600,
            cursor: canReset ? "pointer" : "not-allowed",
          }}
        >
          リセット
        </button>
      </div>
    </div>
  );
}
