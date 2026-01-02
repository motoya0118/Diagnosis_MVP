import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  AdminApiError,
  API_BASE,
  adminFetchWithAuth,
  resolveAdminError,
} from "../lib/apiClient";

export type VersionDetail = {
  id: number
  diagnosticId: number
  name: string
  description: string | null
  note: string | null
  status: "draft" | "finalized"
  systemPromptPreview: string | null
  srcHash: string | null
  createdByAdminId: number
  updatedByAdminId: number
  createdAt: string
  updatedAt: string
  summary: {
    questions: number
    options: number
    outcomes: number
  }
  audit: {
    lastImportedAt: string | null
    lastImportedByAdminId: number | null
    finalizedAt: string | null
    finalizedByAdminId: number | null
  } | null
}

export type VersionDetailError = {
  status?: number
  code?: string
  message: string
  action: string | null
}

export type UseVersionDetailArgs = {
  versionId: string | null;
};

export type UseVersionDetailResult = {
  detail: VersionDetail | null
  isLoading: boolean
  error: VersionDetailError | null
  reload: () => void
}

export function useVersionDetail({ versionId }: UseVersionDetailArgs): UseVersionDetailResult {
  const [detail, setDetail] = useState<VersionDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<VersionDetailError | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const { data: session } = useSession()
  const token = session?.backendAccessToken ?? null

  const reload = useCallback(() => {
    setRefreshIndex((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!token || !versionId || versionId === "0") {
      setDetail(null)
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    const fetchDetail = async () => {
      try {
        const response = await adminFetchWithAuth(
          `${API_BASE}/admin/diagnostics/versions/${versionId}`,
          {
            method: "GET",
            signal: controller.signal,
          },
          { token },
        )
        const payload = await response.json()
        if (cancelled) return

        setDetail({
          id: payload.id,
          diagnosticId: payload.diagnostic_id,
          name: payload.name,
          description: payload.description ?? null,
          note: payload.note ?? null,
          status: payload.status,
          systemPromptPreview: payload.system_prompt_preview ?? null,
          srcHash: payload.src_hash ?? null,
          createdByAdminId: payload.created_by_admin_id,
          updatedByAdminId: payload.updated_by_admin_id,
          createdAt: payload.created_at,
          updatedAt: payload.updated_at,
          summary: {
            questions: payload.summary?.questions ?? 0,
            options: payload.summary?.options ?? 0,
            outcomes: payload.summary?.outcomes ?? 0,
          },
          audit: payload.audit
            ? {
                lastImportedAt: payload.audit.last_imported_at ?? null,
                lastImportedByAdminId: payload.audit.last_imported_by_admin_id ?? null,
                finalizedAt: payload.audit.finalized_at ?? null,
                finalizedByAdminId: payload.audit.finalized_by_admin_id ?? null,
              }
            : null,
        })
      } catch (err) {
        if (cancelled) return
        if (err instanceof DOMException && err.name === "AbortError") {
          return
        }
        if (err instanceof AdminApiError) {
          const resolved = resolveAdminError(err.code)
          setError({
            status: err.response?.status,
            code: err.code,
            message: resolved?.message ?? err.message,
            action: resolved?.action ?? null,
          })
        } else if (err instanceof Error) {
          setError({
            status: undefined,
            code: undefined,
            message: err.message === "Failed to fetch" ? "版詳細の取得に失敗しました" : err.message,
            action: null,
          })
        } else {
          setError({
            status: undefined,
            code: undefined,
            message: "版詳細の取得に失敗しました",
            action: null,
          })
        }
        setDetail(null)
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchDetail()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, versionId, refreshIndex])

  return useMemo(
    () => ({
      detail,
      isLoading,
      error,
      reload,
    }),
    [detail, isLoading, error, reload],
  )
}
