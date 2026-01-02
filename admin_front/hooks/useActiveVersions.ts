import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import {
  AdminApiError,
  API_BASE,
  adminFetchWithAuth,
  resolveAdminError,
} from "../lib/apiClient";

type ActiveVersionApiItem = {
  diagnostic_id: number;
  diagnostic_code: string;
  display_name: string;
  active_version: {
    version_id: number;
    name: string;
    src_hash: string;
    activated_at: string;
    activated_by_admin_id: number;
  } | null;
};

type ActiveVersionsResponse = {
  items: ActiveVersionApiItem[];
};

export type ActiveVersionListItem = {
  diagnosticId: number;
  diagnosticCode: string;
  displayName: string;
  activeVersion: {
    versionId: number;
    name: string;
    srcHash: string;
    activatedAt: string;
    activatedByAdminId: number;
  } | null;
};

export type ActiveVersionsError = {
  status?: number;
  code?: string;
  message: string;
  action: string | null;
};

export type UseActiveVersionsArgs = {
  diagnosticId: string | null;
  diagnosticCode: string | null;
};

export type UseActiveVersionsResult = {
  items: ActiveVersionListItem[];
  isLoading: boolean;
  error: ActiveVersionsError | null;
  reload: () => void;
};

export function useActiveVersions({
  diagnosticId,
  diagnosticCode,
}: UseActiveVersionsArgs): UseActiveVersionsResult {
  const [items, setItems] = useState<ActiveVersionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ActiveVersionsError | null>(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const { data: session } = useSession();
  const token = session?.backendAccessToken ?? null;

  const reload = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const url = new URL("/admin/diagnostics/active-versions", API_BASE);
        if (diagnosticId) {
          url.searchParams.set("diagnostic_id", diagnosticId);
        } else if (diagnosticCode) {
          url.searchParams.set("diagnostic_code", diagnosticCode);
        }

        const response = await adminFetchWithAuth(
          url.toString(),
          {
            method: "GET",
            signal: controller.signal,
          },
          { token },
        );
        const payload = (await response.json()) as ActiveVersionsResponse;
        if (cancelled) return;

        const mapped = payload.items.map<ActiveVersionListItem>((item) => ({
          diagnosticId: item.diagnostic_id,
          diagnosticCode: item.diagnostic_code,
          displayName: item.display_name,
          activeVersion: item.active_version
            ? {
                versionId: item.active_version.version_id,
                name: item.active_version.name,
                srcHash: item.active_version.src_hash,
                activatedAt: item.active_version.activated_at,
                activatedByAdminId: item.active_version.activated_by_admin_id,
              }
            : null,
        }));
        setItems(mapped);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        if (err instanceof AdminApiError) {
          const resolved = resolveAdminError(err.code);
          setError({
            status: err.response?.status,
            code: err.code,
            message: resolved?.message ?? err.message,
            action: resolved?.action ?? null,
          });
        } else if (err instanceof Error) {
          setError({
            status: undefined,
            code: undefined,
            message: err.message === "Failed to fetch" ? "アクティブ版の取得に失敗しました" : err.message,
            action: null,
          });
        } else {
          setError({
            status: undefined,
            code: undefined,
            message: "アクティブ版の取得に失敗しました",
            action: null,
          });
        }
        setItems([]);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [token, diagnosticId, diagnosticCode, refreshIndex]);

  return useMemo(
    () => ({
      items,
      isLoading,
      error,
      reload,
    }),
    [items, isLoading, error, reload],
  );
}
