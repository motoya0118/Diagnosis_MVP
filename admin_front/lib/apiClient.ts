import { ErrorCodeDefinition, getErrorDefinition, isErrorWithCode } from "./error-codes";

export const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
export const INTERNAL_API_BASE = process.env.ADMIN_BACKEND_URL ?? API_BASE;

export const ADMIN_PROXY_BASE_PATH = "/api/internal/admin";

export type ErrorResolution = {
  message: string
  action: string | null
}

export class AdminApiError extends Error {
  readonly code: string
  readonly definition?: ErrorCodeDefinition
  readonly response?: Response

  constructor(code: string, definition?: ErrorCodeDefinition, response?: Response, fallbackMessage?: string) {
    super(definition?.uiMessage ?? fallbackMessage ?? `API error: ${code}`)
    this.code = code
    this.definition = definition
    this.response = response
  }
}

function normalizeProxyPath(path: string): string {
  if (!path) return "/";
  if (path.startsWith("/")) return path;
  return `/${path}`;
}

export function adminProxyPath(path: string): string {
  const normalized = normalizeProxyPath(path);
  return `${ADMIN_PROXY_BASE_PATH}${normalized}`;
}

function ensureCredentials(init?: RequestInit): RequestInit | undefined {
  if (typeof window === "undefined") {
    return init
  }

  if (!init) {
    return { credentials: "include" }
  }

  if (init.credentials) {
    return init
  }

  return { ...init, credentials: "include" as RequestCredentials }
}

function resolveProxyUrl(input: string): string {
  try {
    const backendOrigin = new URL(INTERNAL_API_BASE)
    const targetUrl = new URL(input)
    if (targetUrl.origin !== backendOrigin.origin) {
      return input
    }
    return `${ADMIN_PROXY_BASE_PATH}${targetUrl.pathname}${targetUrl.search}`
  } catch {
    return input
  }
}

function maybeProxyInput(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof window === "undefined") {
    return input
  }

  if (typeof input === "string") {
    return resolveProxyUrl(input)
  }

  if (input instanceof URL) {
    return resolveProxyUrl(input.toString())
  }

  return input
}

export async function adminFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const requestInfo = maybeProxyInput(input)
  const requestInit = ensureCredentials(init)
  const response = await fetch(requestInfo, requestInit)
  if (response.ok) {
    return response
  }

  let payload: unknown
  try {
    payload = await response.clone().json()
  } catch (error) {
    const fallback = getErrorDefinition("E00999")
    throw new AdminApiError("E00999", fallback, response, (error as Error | undefined)?.message)
  }

  if (isErrorWithCode(payload)) {
    const code = payload.error.code
    const definition = getErrorDefinition(code)
    throw new AdminApiError(code, definition, response)
  }

  const detail = typeof (payload as any)?.detail === 'string' ? (payload as any).detail : undefined
  if (detail) {
    throw new AdminApiError("E00999", undefined, response, detail)
  }
  const fallback = getErrorDefinition("E00999")
  throw new AdminApiError("E00999", fallback, response)
}

export function resolveAdminError(code: string): ErrorResolution | undefined {
  const definition = getErrorDefinition(code)
  if (!definition) return undefined
  return { message: definition.uiMessage, action: definition.action }
}

export type AdminFetchAuthOptions = {
  token?: string | null
};

type SessionLike = {
  backendAccessToken?: string | null;
};

async function getServerAccessToken(): Promise<string | null> {
  const { getServerSession } = await import("next-auth");
  const { authOptions } = await import("./auth/options");
  const session = (await getServerSession(authOptions)) as SessionLike | null;
  return session?.backendAccessToken ?? null;
}

async function getClientAccessToken(): Promise<string | null> {
  const { getSession } = await import("next-auth/react");
  const session = (await getSession()) as SessionLike | null;
  return session?.backendAccessToken ?? null;
}

export async function resolveAdminAccessToken(
  override?: string | null,
): Promise<string | null> {
  if (override) return override;
  if (typeof window === "undefined") {
    return getServerAccessToken();
  }
  return getClientAccessToken();
}

export async function adminFetchWithAuth(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: AdminFetchAuthOptions,
): Promise<Response> {
  const token = await resolveAdminAccessToken(options?.token ?? null);
  if (!token) {
    throw new AdminApiError("E00999", getErrorDefinition("E00999"));
  }

  const headers = new Headers(init?.headers ?? {});
  const isServer = typeof window === "undefined";
  if (isServer && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return adminFetch(input, { ...init, headers });
}
