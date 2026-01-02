import { sanitizeSessionLlmResult } from "./llmResult";
import { DiagnosticSessionState } from "./types";

const FALLBACK_STORE = new Map<string, DiagnosticSessionState>();

const STORAGE_PREFIX = "diagnostic_session:";
const keyOf = (diagnosticCode: string) => `${STORAGE_PREFIX}${diagnosticCode}`;

const prepareState = (state: DiagnosticSessionState): DiagnosticSessionState => {
  const sanitised = state.llm_result ? sanitizeSessionLlmResult(state.llm_result) : null;
  return {
    ...state,
    llm_result: sanitised,
    is_linked: Boolean(state.is_linked),
  };
};

export function readSessionSnapshot(diagnosticCode: string): DiagnosticSessionState | undefined {
  const key = keyOf(diagnosticCode);
  if (typeof window === "undefined") {
    const snapshot = FALLBACK_STORE.get(key);
    return snapshot ? prepareState(snapshot) : snapshot;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as DiagnosticSessionState;
      return prepareState(parsed);
    }
  } catch {
    // Ignore storage errors, fallback will be used instead
  }
  const snapshot = FALLBACK_STORE.get(key);
  return snapshot ? prepareState(snapshot) : snapshot;
}

export function persistSessionSnapshot(
  state: DiagnosticSessionState,
  { useLocalStorage }: { useLocalStorage: boolean },
): void {
  const key = keyOf(state.diagnostic_code);
  const prepared = prepareState(state);
  FALLBACK_STORE.set(key, prepared);

  if (!useLocalStorage || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(prepared));
  } catch {
    // Ignore and rely on fallback map
  }
}

export function clearSessionSnapshot(diagnosticCode: string): void {
  const key = keyOf(diagnosticCode);
  FALLBACK_STORE.delete(key);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore removal errors
  }
}

const FALLBACK_PREFIX_LENGTH = STORAGE_PREFIX.length;

const enumerateFallbackCodes = (): string[] => {
  const codes: string[] = [];
  FALLBACK_STORE.forEach((_, key) => {
    if (key.startsWith(STORAGE_PREFIX)) {
      codes.push(key.slice(FALLBACK_PREFIX_LENGTH));
    }
  });
  return codes;
};

const enumerateLocalStorageCodes = (): string[] => {
  if (typeof window === "undefined") return [];
  const codes: string[] = [];
  try {
    const storage = window.localStorage;
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && key.startsWith(STORAGE_PREFIX)) {
        codes.push(key.slice(FALLBACK_PREFIX_LENGTH));
      }
    }
  } catch {
    // Ignore storage access errors
  }
  return codes;
};

export function listStoredDiagnosticCodes(): string[] {
  const codes = new Set<string>();
  enumerateFallbackCodes().forEach((code) => codes.add(code));
  enumerateLocalStorageCodes().forEach((code) => codes.add(code));
  return Array.from(codes);
}
