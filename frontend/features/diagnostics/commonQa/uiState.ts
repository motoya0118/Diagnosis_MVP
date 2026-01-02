import type { DiagnosticSessionState } from "../session";
import type { NormalisedDiagnosticForm } from "./types";

export type CompletedSessionSnapshot = {
  sessionCode: string;
};

export const resolveCompletedSessionSnapshot = (
  state: DiagnosticSessionState | null | undefined,
): CompletedSessionSnapshot | null => {
  if (!state) return null;
  if (state.status !== "completed") return null;
  const sessionCode = state.session_code;
  if (typeof sessionCode !== "string" || sessionCode.length === 0) return null;
  return { sessionCode };
};

export const isLastQuestionAnswered = (
  form: NormalisedDiagnosticForm | null | undefined,
  state: DiagnosticSessionState | null | undefined,
): boolean => {
  if (!form || !state) return false;
  const { questions } = form;
  if (!Array.isArray(questions) || questions.length === 0) return false;
  const lastQuestion = questions[questions.length - 1];
  if (!lastQuestion) return false;
  const answer = state.choices[lastQuestion.q_code];
  return Array.isArray(answer) && answer.length > 0;
};

