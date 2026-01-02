import { ensureDeviceId } from "../device-id";
import { redirectToLogin } from "../auth/redirectToLogin";
import { mapApiErrorToMessage, ApiErrorMessage } from "./error-mapping";

type Serializable = Record<string, unknown> | unknown[] | string | number | boolean | null;

type FetcherInit = Omit<RequestInit, "body"> & {
  body?: RequestInit["body"] | Serializable;
};

const computeApiBase = () => {
  if (typeof window === "undefined") {
    return process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
  }
  return process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
};

const isJsonLikeBody = (body: unknown): body is Serializable => {
  if (body == null || typeof body === "string") {
    return typeof body !== "string" || body.trim().startsWith("{") || body.trim().startsWith("[");
  }
  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob || body instanceof ArrayBuffer) {
    return false;
  }
  if (body instanceof ReadableStream) return false;
  return typeof body === "object";
};

const DIAGNOSTICS_PROXY_BASE_PATH = "/api/diagnostics";
const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const normalizePath = (value: string): string => {
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
};

const buildSameOriginUrl = (path: string): string => {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, origin).toString();
};

const resolveBrowserUrl = (value: string): string => {
  if (value.startsWith(DIAGNOSTICS_PROXY_BASE_PATH)) {
    return buildSameOriginUrl(value);
  }
  if (isAbsoluteUrl(value)) {
    const parsed = new URL(value);
    if (parsed.origin === window.location.origin && parsed.pathname.startsWith(DIAGNOSTICS_PROXY_BASE_PATH)) {
      return parsed.toString();
    }
    const rewrittenPath = `${DIAGNOSTICS_PROXY_BASE_PATH}${normalizePath(`${parsed.pathname}${parsed.search}`)}`;
    return buildSameOriginUrl(rewrittenPath);
  }
  const proxiedPath = `${DIAGNOSTICS_PROXY_BASE_PATH}${normalizePath(value)}`;
  return buildSameOriginUrl(proxiedPath);
};

const resolveAbsoluteTarget = (targetUrl: string): string => {
  if (isAbsoluteUrl(targetUrl)) {
    return targetUrl;
  }
  const origin =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";
  return `${origin}${normalizePath(targetUrl)}`;
};

const cloneRequestWithUrl = (request: Request, targetUrl: string): Request => {
  const clone = request.clone();
  const headers = new Headers(clone.headers);
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: request.redirect,
    referrer: request.referrer,
    referrerPolicy: request.referrerPolicy,
    integrity: request.integrity,
    keepalive: request.keepalive,
    mode: request.mode,
    credentials: request.credentials,
    cache: request.cache,
    signal: request.signal,
  };
  const priority = (request as any).priority;
  if (priority) {
    (init as any).priority = priority;
  }
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    init.body = clone.body ?? null;
    const maybeDuplex = (request as any).duplex;
    if (maybeDuplex) {
      (init as any).duplex = maybeDuplex;
    }
  }
  const absoluteTarget = resolveAbsoluteTarget(targetUrl);
  return new Request(absoluteTarget, init);
};

const resolveUrl = (input: RequestInfo | URL): RequestInfo | URL => {
  if (typeof window === "undefined") {
    if (typeof input === "string") {
      if (isAbsoluteUrl(input)) {
        return input;
      }
      return new URL(normalizePath(input), computeApiBase()).toString();
    }
    if (input instanceof URL) return input.toString();
    return input;
  }

  if (typeof input === "string") {
    return resolveBrowserUrl(input);
  }

  if (input instanceof URL) {
    return resolveBrowserUrl(input.toString());
  }

  if (input instanceof Request) {
    const currentUrl = input.url;
    if (isAbsoluteUrl(currentUrl)) {
      const parsed = new URL(currentUrl);
      if (parsed.origin === window.location.origin && parsed.pathname.startsWith(DIAGNOSTICS_PROXY_BASE_PATH)) {
        return input;
      }
    } else if (currentUrl.startsWith(DIAGNOSTICS_PROXY_BASE_PATH)) {
      const absolute = buildSameOriginUrl(currentUrl);
      if (absolute === currentUrl) {
        return input;
      }
      return cloneRequestWithUrl(input, absolute);
    }
    const proxied = resolveBrowserUrl(currentUrl);
    return cloneRequestWithUrl(input, proxied);
  }

  return input;
};

const safeParse = (raw: string): unknown => {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export class ApiError<T = unknown> extends Error {
  readonly status: number;
  readonly code?: string;
  readonly response: Response;
  readonly payload: T | undefined;
  readonly resolved: ApiErrorMessage;

  constructor(
    message: string,
    response: Response,
    resolved: ApiErrorMessage,
    code?: string,
    payload?: T,
  ) {
    super(message);
    this.status = response.status;
    this.response = response;
    this.resolved = resolved;
    this.code = code;
    this.payload = payload;
  }
}

export async function fetcher<T = unknown>(input: RequestInfo | URL, init?: FetcherInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const { body, ...rest } = init ?? {};
  const finalInit: RequestInit = { ...rest, headers };

  if (typeof window !== "undefined" && !finalInit.credentials) {
    finalInit.credentials = "include";
  }

  if (body !== undefined && body !== null) {
    if (isJsonLikeBody(body)) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      finalInit.body = typeof body === "string" ? body : JSON.stringify(body);
    } else {
      finalInit.body = body as BodyInit;
    }
  }

  if (typeof window !== "undefined") {
    const deviceId = ensureDeviceId();
    if (deviceId) {
      headers.set("X-Device-Id", deviceId);
    }
  }

  const resolvedInput = resolveUrl(input);
  if (resolvedInput instanceof Request) {
    resolvedInput.headers.forEach((value, key) => {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    });
  }
  const response = await fetch(resolvedInput, finalInit);

  const rawBody = await response.text();
  const parsed = safeParse(rawBody);

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    return parsed as T;
  }

  const errorCode = typeof (parsed as any)?.error?.code === "string" ? (parsed as any).error.code : undefined;

  if (response.status === 401 || response.status === 403) {
    const next = typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined;
    redirectToLogin(next);
  }

  const resolved = mapApiErrorToMessage(response.status, errorCode);
  throw new ApiError(resolved.message, response, resolved, errorCode, parsed);
}

export function resolveDiagnosticsUrl(path: string): string {
  if (typeof window === "undefined") {
    if (isAbsoluteUrl(path)) {
      return path;
    }
    return new URL(normalizePath(path), computeApiBase()).toString();
  }
  return resolveBrowserUrl(path);
}
