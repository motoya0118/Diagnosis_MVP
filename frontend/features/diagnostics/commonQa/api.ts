import { ensureDeviceId } from "../../../lib/device-id";
import { redirectToLogin } from "../../../lib/auth/redirectToLogin";
import { fetcher, ApiError, resolveDiagnosticsUrl } from "../../../lib/http/fetcher";
import { mapApiErrorToMessage, type ApiErrorMessage } from "../../../lib/http/error-mapping";
import type { DiagnosticFormResponse } from "./types";
import type { StartDiagnosticSessionResponse } from "./sessionLifecycle";

const safeParse = (raw: string): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export async function startDiagnosticSession(diagnosticCode: string): Promise<StartDiagnosticSessionResponse> {
  const path = `/diagnostics/${encodeURIComponent(diagnosticCode)}/sessions`;
  return fetcher<StartDiagnosticSessionResponse>(path, {
    method: "POST",
    body: {},
  });
}

export type FetchDiagnosticFormResult =
  | { status: "ok"; data: DiagnosticFormResponse; etag?: string }
  | { status: "not_modified"; etag?: string };

const attachDeviceId = (headers: Headers) => {
  if (typeof window === "undefined") return;
  const deviceId = ensureDeviceId();
  if (deviceId) {
    headers.set("X-Device-Id", deviceId);
  }
};

const handleAuthRedirect = (status: number) => {
  if (status === 401 || status === 403) {
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
    redirectToLogin(next);
  }
};

export async function fetchDiagnosticForm(
  versionId: number,
  options?: { etag?: string },
): Promise<FetchDiagnosticFormResult> {
  const headers = new Headers({
    Accept: "application/json",
  });

  if (options?.etag) {
    headers.set("If-None-Match", options.etag);
  }

  attachDeviceId(headers);

  const url = resolveDiagnosticsUrl(`/diagnostics/versions/${encodeURIComponent(versionId)}/form`);
  const init: RequestInit = { method: "GET", headers };
  if (typeof window !== "undefined" && !init.credentials) {
    init.credentials = "include";
  }

  const response = await fetch(url, init);

  if (response.status === 304) {
    return { status: "not_modified", etag: response.headers.get("ETag") ?? undefined };
  }

  handleAuthRedirect(response.status);

  if (!response.ok) {
    const raw = await response.text();
    const payload = safeParse(raw);
    const code = typeof (payload as any)?.error?.code === "string" ? (payload as any).error.code : undefined;
    const resolved: ApiErrorMessage = mapApiErrorToMessage(response.status, code);
    throw new ApiError(resolved.message, response, resolved, code, payload);
  }

  const data = (await response.json()) as DiagnosticFormResponse;
  const etag = response.headers.get("ETag") ?? undefined;

  return { status: "ok", data, etag };
}
