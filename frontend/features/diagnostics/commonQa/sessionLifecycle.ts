import type { DiagnosticSessionState } from "../session";

export type StartDiagnosticSessionResponse = {
  session_code: string;
  diagnostic_id: number;
  version_id: number;
  started_at: string;
  expires_at?: string | null;
};

export type ReconcileSessionResult = {
  state: DiagnosticSessionState;
  reusedChoices: boolean;
};

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

const shouldResetState = (
  diagnosticCode: string,
  current: DiagnosticSessionState | null | undefined,
  session: StartDiagnosticSessionResponse,
): boolean => {
  if (!current) return true;
  if (current.diagnostic_code !== diagnosticCode) return true;
  if (current.status === "completed" || current.status === "expired") return true;
  if (!current.session_code) return true;
  if (current.session_code !== session.session_code) return true;
  if (current.version_id !== session.version_id) return true;
  return false;
};

export function reconcileSessionState(
  diagnosticCode: string,
  current: DiagnosticSessionState | null | undefined,
  session: StartDiagnosticSessionResponse,
): ReconcileSessionResult {
  if (shouldResetState(diagnosticCode, current, session)) {
    return {
      reusedChoices: false,
      state: {
        ...createEmptyState(diagnosticCode),
        session_code: session.session_code,
        version_id: session.version_id,
        expires_at: session.expires_at ?? null,
      },
    };
  }

  const next: DiagnosticSessionState = {
    ...current!,
    session_code: session.session_code,
    version_id: session.version_id,
    expires_at: session.expires_at ?? current!.expires_at ?? null,
    status: current!.status,
  };

  return { state: next, reusedChoices: true };
}
