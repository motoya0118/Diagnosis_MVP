import type { DiagnosticFormQuestion } from "./types";

const hasSelection = (questionCode: string, choices: Record<string, number[] | undefined>): boolean => {
  const selection = choices[questionCode];
  if (!selection) return false;
  return selection.length > 0;
};

export function findUnansweredQuestions(
  questions: DiagnosticFormQuestion[],
  choices: Record<string, number[] | undefined>,
): string[] {
  const unanswered: string[] = [];
  questions.forEach((question) => {
    if (!question.is_active) return;
    if (!hasSelection(question.q_code, choices)) {
      unanswered.push(question.q_code);
    }
  });
  return unanswered;
}

