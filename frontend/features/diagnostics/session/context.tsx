"use client";

import { Draft, produce } from "immer";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useToast } from "../../../app/providers/feedback_provider";
import { clearSessionSnapshot, persistSessionSnapshot, readSessionSnapshot } from "./storage";
import { sanitizeSessionLlmResult } from "./llmResult";
import { DiagnosticSessionState, SessionLlmResultSnapshot } from "./types";

type StorageMode = "unknown" | "local" | "memory";

const createEmptyState = (diagnosticCode: string): DiagnosticSessionState => ({
  diagnostic_code: diagnosticCode,
  version_id: null,
  session_code: null,
  status: "in_progress",
  choices: {},
  llm_result: null,
  llm_messages: null,
  completed_at: null,
  expires_at: null,
  version_options_hash: null,
  is_linked: false,
});

type AwaitingLlmOptions = {
  version_options_hash?: string | null;
  preserveExistingResult?: boolean;
};

export type DiagnosticSessionActions = {
  setSessionState: (state: DiagnosticSessionState) => void;
  upsertChoice: (questionCode: string, optionIds: number[]) => void;
  removeChoice: (questionCode: string) => void;
  markAwaitingLlm: (options?: AwaitingLlmOptions) => void;
  markCompleted: (
    llmResult: SessionLlmResultSnapshot | null,
    extra?: Partial<Pick<DiagnosticSessionState, "llm_messages" | "completed_at" | "version_options_hash">>,
  ) => void;
  resetSession: () => void;
};

type DiagnosticSessionContextValue = {
  diagnosticCode: string;
  state: DiagnosticSessionState | null;
  loading: boolean;
  error: unknown;
  actions: DiagnosticSessionActions;
};

const DiagnosticSessionContext = createContext<DiagnosticSessionContextValue | null>(null);

const ensureUniqueSorted = (ids: number[]): number[] => {
  const unique = Array.from(new Set(ids));
  unique.sort((a, b) => a - b);
  return unique;
};

type ProviderProps = {
  diagnosticCode: string;
  children: React.ReactNode;
};

export function DiagnosticSessionProvider({ diagnosticCode, children }: ProviderProps) {
  const toast = useToast();
  const [storageMode, setStorageMode] = useState<StorageMode>("unknown");
  const [state, setState] = useState<DiagnosticSessionState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(null);
  const warnedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setStorageMode("memory");
      return;
    }
    try {
      const probe = "__diagnostics_storage_test__";
      window.localStorage.setItem(probe, "ok");
      window.localStorage.removeItem(probe);
      setStorageMode("local");
    } catch {
      setStorageMode("memory");
    }
  }, []);

  useEffect(() => {
    if (storageMode === "unknown") return;
    const persisted = readSessionSnapshot(diagnosticCode);
    setState(persisted ?? createEmptyState(diagnosticCode));
    setLoading(false);
    setError(null);

    if (storageMode === "memory" && !warnedRef.current) {
      warnedRef.current = true;
      toast.warning("ブラウザのストレージが利用できないため、回答は一時的に保持されます。ページを離れる前に送信してください。", {
        persist: true,
      });
    }
  }, [diagnosticCode, storageMode, toast]);

  useEffect(() => {
    if (!state || storageMode === "unknown") return;
    persistSessionSnapshot(state, { useLocalStorage: storageMode === "local" });
  }, [state, storageMode]);

  const updateState = useCallback((recipe: (draft: Draft<DiagnosticSessionState>) => void) => {
    setState((current) => {
      if (!current) return current;
      return produce(current, recipe);
    });
  }, []);

  const actions = useMemo<DiagnosticSessionActions>(() => ({
    setSessionState(nextState) {
      if (nextState.diagnostic_code !== diagnosticCode) {
        throw new Error("Session state diagnostic code mismatch");
      }
      const sanitised = nextState.llm_result ? sanitizeSessionLlmResult(nextState.llm_result) : null;
      setState({ ...nextState, llm_result: sanitised });
    },
    upsertChoice(questionCode, optionIds) {
      updateState((draft) => {
        const sanitised = ensureUniqueSorted(optionIds);
        if (sanitised.length === 0) {
          delete draft.choices[questionCode];
        } else {
          draft.choices[questionCode] = sanitised;
        }
      });
    },
    removeChoice(questionCode) {
      updateState((draft) => {
        delete draft.choices[questionCode];
      });
    },
    markAwaitingLlm(options) {
      updateState((draft) => {
        draft.status = "awaiting_llm";
        if (!options?.preserveExistingResult) {
          draft.llm_result = null;
          draft.llm_messages = null;
          draft.completed_at = null;
        }
        if (options?.version_options_hash !== undefined) {
          draft.version_options_hash = options.version_options_hash;
        }
      });
    },
    markCompleted(llmResult, extra) {
      updateState((draft) => {
        draft.status = "completed";
        draft.llm_result = llmResult ? sanitizeSessionLlmResult(llmResult) : null;
        if (extra?.llm_messages !== undefined) {
          draft.llm_messages = extra.llm_messages;
        }
        if (extra?.completed_at !== undefined) {
          draft.completed_at = extra.completed_at;
        }
        if (extra?.version_options_hash !== undefined) {
          draft.version_options_hash = extra.version_options_hash;
        }
      });
    },
    resetSession() {
      const next = createEmptyState(diagnosticCode);
      setState(next);
      clearSessionSnapshot(diagnosticCode);
    },
  }), [diagnosticCode, updateState]);

  const value = useMemo<DiagnosticSessionContextValue>(
    () => ({ diagnosticCode, state, loading, error, actions }),
    [diagnosticCode, state, loading, error, actions],
  );

  return <DiagnosticSessionContext.Provider value={value}>{children}</DiagnosticSessionContext.Provider>;
}

export function useDiagnosticSessionState() {
  const ctx = useContext(DiagnosticSessionContext);
  if (!ctx) {
    throw new Error("useDiagnosticSessionState must be used within DiagnosticSessionProvider");
  }
  return { diagnosticCode: ctx.diagnosticCode, state: ctx.state, loading: ctx.loading, error: ctx.error };
}

export function useDiagnosticSessionActions(): DiagnosticSessionActions {
  const ctx = useContext(DiagnosticSessionContext);
  if (!ctx) {
    throw new Error("useDiagnosticSessionActions must be used within DiagnosticSessionProvider");
  }
  return ctx.actions;
}
