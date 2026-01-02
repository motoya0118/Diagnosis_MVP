import { isLastQuestionAnswered, resolveCompletedSessionSnapshot } from "../../../features/diagnostics/commonQa";
import type { NormalisedDiagnosticForm } from "../../../features/diagnostics/commonQa";
import type { DiagnosticSessionState } from "../../../features/diagnostics/session";

const createState = (overrides: Partial<DiagnosticSessionState> = {}): DiagnosticSessionState => ({
  diagnostic_code: "ai_career",
  version_id: 1,
  session_code: "SESSION-1",
  status: "in_progress",
  choices: {},
  llm_result: null,
  llm_messages: null,
  completed_at: null,
  expires_at: null,
  version_options_hash: null,
  is_linked: false,
  ...overrides,
});

const createForm = (overrides?: Partial<NormalisedDiagnosticForm>): NormalisedDiagnosticForm => ({
  version_id: 1,
  questions: [
    {
      id: 1,
      sort_order: 1,
      q_code: "Q01",
      display_text: "Question 1",
      description: null,
      multi: false,
      is_active: true,
    },
    {
      id: 2,
      sort_order: 2,
      q_code: "Q02",
      display_text: "Question 2",
      description: null,
      multi: true,
      is_active: true,
    },
  ],
  options: {
    Q01: [
      {
        version_option_id: 100,
        opt_code: "Q01-01",
        sort_order: 1,
        display_label: "Q1-A1",
        description: null,
        helper_text: null,
        is_active: true,
      },
    ],
    Q02: [
      {
        version_option_id: 200,
        opt_code: "Q02-01",
        sort_order: 1,
        display_label: "Q2-A1",
        description: null,
        helper_text: null,
        is_active: true,
      },
      {
        version_option_id: 201,
        opt_code: "Q02-02",
        sort_order: 2,
        display_label: "Q2-A2",
        description: null,
        helper_text: null,
        is_active: true,
      },
    ],
  },
  option_lookup: {},
  outcomes: [],
  ...overrides,
});

describe("resolveCompletedSessionSnapshot", () => {
  it("returns null when the state is absent", () => {
    expect(resolveCompletedSessionSnapshot(null)).toBeNull();
  });

  it("returns null when the session is not completed", () => {
    const state = createState({ status: "in_progress" });
    expect(resolveCompletedSessionSnapshot(state)).toBeNull();
    expect(resolveCompletedSessionSnapshot(createState({ status: "awaiting_llm" }))).toBeNull();
  });

  it("returns null when the session has no code", () => {
    const state = createState({ status: "completed", session_code: null });
    expect(resolveCompletedSessionSnapshot(state)).toBeNull();
  });

  it("returns the session code when the session is completed", () => {
    const state = createState({ status: "completed", session_code: "FINISHED-1" });
    expect(resolveCompletedSessionSnapshot(state)).toEqual({ sessionCode: "FINISHED-1" });
  });
});

describe("isLastQuestionAnswered", () => {
  it("returns false when form or state is missing", () => {
    const state = createState();
    expect(isLastQuestionAnswered(null, state)).toBe(false);
    const form = createForm();
    expect(isLastQuestionAnswered(form, null)).toBe(false);
  });

  it("returns false when the last question has no answers", () => {
    const form = createForm();
    const state = createState({ choices: { Q01: [100] } });
    expect(isLastQuestionAnswered(form, state)).toBe(false);
  });

  it("returns true when the last question is answered", () => {
    const form = createForm();
    const state = createState({ choices: { Q01: [100], Q02: [200, 201] } });
    expect(isLastQuestionAnswered(form, state)).toBe(true);
  });
});
