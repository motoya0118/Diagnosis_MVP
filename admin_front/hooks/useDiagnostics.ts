import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  AdminApiError,
  API_BASE,
  adminFetchWithAuth,
  resolveAdminError,
} from "../lib/apiClient";

type DiagnosticsApiItem = {
  id: number
  code: string
  display_name: string
  description: string | null
  outcome_table_name: string
  is_active: boolean
}

type DiagnosticsApiResponse = {
  items: DiagnosticsApiItem[]
}

export type AdminDiagnostic = {
  id: number
  code: string
  displayName: string
  description: string | null
  outcomeTableName: string
  isActive: boolean
}

export type DiagnosticOption = {
  value: string
  label: string
  code: string
  isActive: boolean
}

export type DiagnosticsError = {
  status?: number
  code?: string
  message: string
  action: string | null
}

export type UseAdminDiagnosticsArgs = {
  includeInactive: boolean;
};

export type UseAdminDiagnosticsResult = {
  diagnostics: AdminDiagnostic[]
  options: DiagnosticOption[]
  isLoading: boolean
  error: DiagnosticsError | null
  reload: () => void
}

export function useAdminDiagnostics({ includeInactive }: UseAdminDiagnosticsArgs): UseAdminDiagnosticsResult {
  const [diagnostics, setDiagnostics] = useState<AdminDiagnostic[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<DiagnosticsError | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const { data: session } = useSession()
  const token = session?.backendAccessToken ?? null

  const reload = useCallback(() => {
    setRefreshIndex((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!token) {
      setDiagnostics([])
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    const fetchDiagnostics = async () => {
      try {
        const url = new URL("/admin/diagnostics", API_BASE)
        if (includeInactive) {
          url.searchParams.set("include_inactive", "true")
        }

        const response = await adminFetchWithAuth(
          url.toString(),
          {
            method: "GET",
            signal: controller.signal,
          },
          { token },
        )

        const payload = (await response.json()) as DiagnosticsApiResponse
        if (cancelled) return
        const normalized: AdminDiagnostic[] = payload.items.map((item) => ({
          id: item.id,
          code: item.code,
          displayName: item.display_name,
          description: item.description,
          outcomeTableName: item.outcome_table_name,
          isActive: item.is_active,
        }))

        setDiagnostics(normalized)
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
            message: err.message === "Failed to fetch" ? "診断一覧の取得に失敗しました" : err.message,
            action: null,
          })
        } else {
          setError({
            status: undefined,
            code: undefined,
            message: "診断一覧の取得に失敗しました",
            action: null,
          })
        }
        setDiagnostics([])
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchDiagnostics()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, includeInactive, refreshIndex])

  const options = useMemo<DiagnosticOption[]>(() => {
    return diagnostics.map((diagnostic) => ({
      value: String(diagnostic.id),
      label: diagnostic.displayName,
      code: diagnostic.code,
      isActive: diagnostic.isActive,
    }))
  }, [diagnostics])

  return {
    diagnostics,
    options,
    isLoading,
    error,
    reload,
  }
}
