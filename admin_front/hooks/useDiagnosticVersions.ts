import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  AdminApiError,
  API_BASE,
  adminFetchWithAuth,
  resolveAdminError,
} from "../lib/apiClient";

type VersionsApiItem = {
  id: number
  name: string
  status: "draft" | "finalized"
  description: string | null
  note: string | null
  is_active: boolean
  system_prompt_state: "present" | "empty"
  created_at: string
  updated_at: string
}

type VersionsApiResponse = {
  diagnostic_id: number
  items: VersionsApiItem[]
}

export type AdminDiagnosticVersion = {
  id: number
  name: string
  status: "draft" | "finalized"
  description: string | null
  note: string | null
  isActive: boolean
  systemPromptState: "present" | "empty"
  createdAt: string
  updatedAt: string
}

export type VersionsError = {
  status?: number
  code?: string
  message: string
  action: string | null
}

export type UseDiagnosticVersionsArgs = {
  diagnosticId: string | null;
  status?: "draft" | "finalized" | null;
  limit?: number | null;
};

export type UseDiagnosticVersionsResult = {
  versions: AdminDiagnosticVersion[]
  isLoading: boolean
  error: VersionsError | null
  reload: () => void
}

export function useDiagnosticVersions({
  diagnosticId,
  status = null,
  limit = null,
}: UseDiagnosticVersionsArgs): UseDiagnosticVersionsResult {
  const [versions, setVersions] = useState<AdminDiagnosticVersion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<VersionsError | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const { data: session } = useSession()
  const token = session?.backendAccessToken ?? null

  const reload = useCallback(() => {
    setRefreshIndex((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!token || !diagnosticId) {
      setVersions([])
      setIsLoading(false)
      setError(null)
      return
    }

    let cancelled = false
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)

    const fetchVersions = async () => {
      try {
        const url = new URL(`/admin/diagnostics/${diagnosticId}/versions`, API_BASE)
        if (status) {
          url.searchParams.set("status", status)
        }
        if (typeof limit === "number" && Number.isFinite(limit) && limit > 0) {
          url.searchParams.set("limit", String(limit))
        }
        const response = await adminFetchWithAuth(
          url.toString(),
          {
            method: "GET",
            signal: controller.signal,
          },
          { token },
        )

        const payload = (await response.json()) as VersionsApiResponse
        if (cancelled) return

        const normalized = payload.items.map<AdminDiagnosticVersion>((item) => ({
          id: item.id,
          name: item.name,
          status: item.status,
          description: item.description,
          note: item.note,
          isActive: item.is_active,
          systemPromptState: item.system_prompt_state,
          createdAt: item.created_at,
          updatedAt: item.updated_at,
        }))

        setVersions(normalized)
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
            message: err.message === "Failed to fetch" ? "診断版の取得に失敗しました" : err.message,
            action: null,
          })
        } else {
          setError({
            status: undefined,
            code: undefined,
            message: "診断版の取得に失敗しました",
            action: null,
          })
        }
        setVersions([])
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void fetchVersions()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [token, diagnosticId, status, limit, refreshIndex])

  return useMemo(
    () => ({
      versions,
      isLoading,
      error,
      reload,
    }),
    [versions, isLoading, error, reload],
  )
}
