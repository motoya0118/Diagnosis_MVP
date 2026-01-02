"use client";

import React, {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastVariant = "success" | "info" | "warning" | "error";

export type ToastPayload = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs?: number;
  persist?: boolean;
};

type ToastEntry = ToastPayload & {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  toasts: ToastEntry[];
  info(message: string, options?: ToastPayload): string;
  success(message: string, options?: ToastPayload): string;
  warning(message: string, options?: ToastPayload): string;
  error(message: string, options?: ToastPayload): string;
  dismiss(id: string): void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const GLOBAL_SCOPE = "__global__";

type LoadingOverlayContextValue = {
  isLoading(scopeKey?: string): boolean;
  start(scopeKey?: string): void;
  stop(scopeKey?: string): void;
  withActionLoading<T>(scopeKey: string, action: () => Promise<T>): Promise<T>;
  activeScopes: ReadonlySet<string>;
};

const LoadingOverlayContext = createContext<LoadingOverlayContextValue | null>(null);

const AUTO_DISMISS_MS = Number(process.env.NEXT_PUBLIC_FEEDBACK_AUTO_DISMISS_MS ?? 5000);

const generateId = () => Math.random().toString(36).slice(2, 10);

const normaliseScope = (scopeKey?: string) => {
  const trimmed = scopeKey?.trim();
  return trimmed ? trimmed : GLOBAL_SCOPE;
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("ToastContext is unavailable outside FeedbackProvider");
  }
  return ctx;
}

export function useLoading(): LoadingOverlayContextValue {
  const ctx = useContext(LoadingOverlayContext);
  if (!ctx) {
    throw new Error("LoadingOverlayContext is unavailable outside FeedbackProvider");
  }
  return ctx;
}

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.filter((toast) => toast.id != id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const enqueue = useCallback(
    (variant: ToastVariant, message: string, payload?: ToastPayload) => {
      const id = generateId();
      const entry: ToastEntry = {
        id,
        message,
        variant,
        ...payload,
      };
      setToasts((items) => [...items, entry]);
      return id;
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const active = new Set(toasts.map((t) => t.id));

    timersRef.current.forEach((timer, id) => {
      if (!active.has(id)) {
        window.clearTimeout(timer);
        timersRef.current.delete(id);
      }
    });

    toasts.forEach((toast) => {
      if (toast.persist) return;
      if (timersRef.current.has(toast.id)) return;
      const duration = toast.durationMs ?? AUTO_DISMISS_MS;
      const timeoutId = window.setTimeout(() => dismiss(toast.id), duration);
      timersRef.current.set(toast.id, timeoutId);
    });
  }, [toasts, dismiss]);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  const toastValue = useMemo<ToastContextValue>(
    () => ({
      toasts,
      dismiss,
      info: (message, payload) => enqueue("info", message, payload),
      success: (message, payload) => enqueue("success", message, payload),
      warning: (message, payload) => enqueue("warning", message, payload),
      error: (message, payload) => enqueue("error", message, payload),
    }),
    [toasts, dismiss, enqueue],
  );

  const [activeScopes, setActiveScopes] = useState<Set<string>>(new Set());
  const inflightRef = useRef<Map<string, Promise<unknown>>>(new Map());

  const start = useCallback((scopeKey?: string) => {
    const key = normaliseScope(scopeKey);
    setActiveScopes((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const stop = useCallback((scopeKey?: string) => {
    const key = normaliseScope(scopeKey);
    setActiveScopes((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const isLoading = useCallback(
    (scopeKey?: string) => {
      const key = normaliseScope(scopeKey);
      return activeScopes.has(key);
    },
    [activeScopes],
  );

  const withActionLoading = useCallback(
    async <T,>(scopeKey: string, action: () => Promise<T>): Promise<T> => {
      const key = normaliseScope(scopeKey);
      const existing = inflightRef.current.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }

      start(key);
      const runner: Promise<T> = (async () => {
        try {
          return await action();
        } finally {
          inflightRef.current.delete(key);
          stop(key);
        }
      })();

      inflightRef.current.set(key, runner);
      return runner;
    },
    [start, stop],
  ) satisfies LoadingOverlayContextValue["withActionLoading"];

  const loadingValue = useMemo<LoadingOverlayContextValue>(
    () => ({
      isLoading,
      start,
      stop,
      withActionLoading,
      activeScopes,
    }),
    [isLoading, start, stop, withActionLoading, activeScopes],
  );

  return (
    <ToastContext.Provider value={toastValue}>
      <LoadingOverlayContext.Provider value={loadingValue}>
        {children}
        <ToastViewport />
        <GlobalLoadingBackdrop />
      </LoadingOverlayContext.Provider>
    </ToastContext.Provider>
  );
}

export function ToastViewport() {
  const { toasts, dismiss } = useToast();

  return (
    <div className="toast-viewport" aria-live="assertive">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.variant}`} role="status">
          <div className="toast-body">
            {toast.title && <div className="toast-title">{toast.title}</div>}
            <div className="toast-message">{toast.message}</div>
            {toast.description && <div className="toast-description">{toast.description}</div>}
          </div>
          <div className="toast-actions">
            {toast.actionLabel && toast.onAction && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  const maybePromise = toast.onAction?.();
                  if (maybePromise instanceof Promise) {
                    maybePromise.finally(() => dismiss(toast.id));
                  } else {
                    dismiss(toast.id);
                  }
                }}
              >
                {toast.actionLabel}
              </button>
            )}
            <button type="button" aria-label="閉じる" className="toast-close" onClick={() => dismiss(toast.id)}>
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function GlobalLoadingBackdrop() {
  const { activeScopes } = useLoading();
  const show = activeScopes.has(GLOBAL_SCOPE);

  if (!show) return null;

  return (
    <div className="loading-backdrop" role="status" aria-live="polite">
      <div className="loading-spinner" />
    </div>
  );
}
