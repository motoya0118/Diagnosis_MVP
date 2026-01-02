import { reconcileSessionState, type StartDiagnosticSessionResponse } from "../../../features/diagnostics/commonQa/sessionLifecycle";
import type { DiagnosticSessionState } from "../../../features/diagnostics/session";

const baseState = (overrides: Partial<DiagnosticSessionState> = {}): DiagnosticSessionState => ({
  diagnostic_code: "ai_career",
  version_id: 12,
  session_code: "SESSION-1",
  status: "in_progress",
  choices: { intro: [101] },
  llm_result: null,
  llm_messages: null,
  completed_at: null,
  expires_at: null,
  version_options_hash: null,
  is_linked: false,
  ...overrides,
});

const startResponse = (overrides: Partial<StartDiagnosticSessionResponse> = {}): StartDiagnosticSessionResponse => ({
  session_code: "SESSION-2",
  diagnostic_id: 1,
  version_id: 24,
  started_at: "2024-11-19T02:10:00Z",
  expires_at: null,
  ...overrides,
});

describe("reconcileSessionState", () => {
  it("creates a fresh session state when no prior state exists", () => {
    const session = startResponse({ session_code: "S-NEW", version_id: 77 });

    const result = reconcileSessionState("ai_career", null, session);

    expect(result.reusedChoices).toBe(false);
    expect(result.state).toMatchObject({
      diagnostic_code: "ai_career",
      session_code: "S-NEW",
      version_id: 77,
      status: "in_progress",
      choices: {},
      llm_result: null,
      llm_messages: null,
      completed_at: null,
      version_options_hash: null,
    });
  });

  it("preserves choices when the session metadata matches", () => {
    const current = baseState({ session_code: "S-KEEP", version_id: 88, choices: { intro: [5], role: [9] } });
    const session = startResponse({ session_code: "S-KEEP", version_id: 88 });

    const result = reconcileSessionState("ai_career", current, session);

    expect(result.reusedChoices).toBe(true);
    expect(result.state.session_code).toBe("S-KEEP");
    expect(result.state.version_id).toBe(88);
    expect(result.state.choices).toEqual({ intro: [5], role: [9] });
    expect(result.state.status).toBe("in_progress");
  });

  it("retains an awaiting_llm status when metadata matches", () => {
    const current = baseState({
      status: "awaiting_llm",
      session_code: "S-LLM",
      version_id: 91,
      choices: { intro: [7], role: [2] },
    });
    const session = startResponse({ session_code: "S-LLM", version_id: 91 });

    const result = reconcileSessionState("ai_career", current, session);

    expect(result.reusedChoices).toBe(true);
    expect(result.state.status).toBe("awaiting_llm");
  });

  it("resets choices when the version has changed", () => {
    const current = baseState({ version_id: 12, session_code: "OLD", choices: { intro: [1] } });
    const session = startResponse({ session_code: "NEW", version_id: 99 });

    const result = reconcileSessionState("ai_career", current, session);

    expect(result.reusedChoices).toBe(false);
    expect(result.state.version_id).toBe(99);
    expect(result.state.session_code).toBe("NEW");
    expect(result.state.choices).toEqual({});
  });

  it("resets when the previous session was already completed", () => {
    const current = baseState({ status: "completed", session_code: "DONE", version_id: 55, completed_at: "2024-10-01T00:00:00Z" });
    const session = startResponse({ session_code: "NEW2", version_id: 55 });

    const result = reconcileSessionState("ai_career", current, session);

    expect(result.reusedChoices).toBe(false);
    expect(result.state.status).toBe("in_progress");
    expect(result.state.choices).toEqual({});
  });
});
