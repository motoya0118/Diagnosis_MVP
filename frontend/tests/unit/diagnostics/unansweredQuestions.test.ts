import { findUnansweredQuestions } from "../../../features/diagnostics/commonQa/validation";
import type { DiagnosticFormQuestion } from "../../../features/diagnostics/commonQa/types";

const question = (overrides: Partial<DiagnosticFormQuestion>): DiagnosticFormQuestion => ({
  id: overrides.id ?? 1,
  q_code: overrides.q_code ?? "q1",
  display_text: overrides.display_text ?? "Question",
  description: overrides.description ?? null,
  multi: overrides.multi ?? false,
  sort_order: overrides.sort_order ?? 10,
  is_active: overrides.is_active ?? true,
});

describe("findUnansweredQuestions", () => {
  it("returns codes for active questions without selections", () => {
    const questions: DiagnosticFormQuestion[] = [
      question({ q_code: "intro", sort_order: 1 }),
      question({ q_code: "skills", sort_order: 2, multi: true }),
      question({ q_code: "future", sort_order: 3 }),
    ];

    const choices = {
      intro: [1001],
      skills: [],
    };

    const result = findUnansweredQuestions(questions, choices);

    expect(result).toEqual(["skills", "future"]);
  });

  it("ignores inactive questions when checking answers", () => {
    const questions: DiagnosticFormQuestion[] = [
      question({ q_code: "active", is_active: true }),
      question({ q_code: "retired", is_active: false }),
    ];

    const result = findUnansweredQuestions(questions, { active: [2001] });

    expect(result).toEqual([]);
  });
});

