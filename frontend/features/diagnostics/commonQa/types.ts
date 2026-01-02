export type DiagnosticFormQuestion = {
  id: number;
  q_code: string;
  display_text: string;
  description?: string | null;
  multi: boolean;
  sort_order: number;
  is_active: boolean;
};

export type DiagnosticFormOption = {
  version_option_id: number;
  opt_code: string;
  display_label: string;
  description?: string | null;
  helper_text?: string | null;
  sort_order: number;
  is_active: boolean;
};

export type DiagnosticFormOutcome = {
  outcome_id: number;
  sort_order: number;
  meta: Record<string, unknown> | null;
};

export type DiagnosticFormResponse = {
  version_id: number;
  questions: DiagnosticFormQuestion[];
  options: Record<string, DiagnosticFormOption[]>;
  option_lookup: Record<string, { q_code: string; opt_code: string }>;
  outcomes: DiagnosticFormOutcome[];
};

export type NormalisedDiagnosticForm = {
  version_id: number;
  questions: DiagnosticFormQuestion[];
  options: Record<string, DiagnosticFormOption[]>;
  option_lookup: Record<string, { q_code: string; opt_code: string }>;
  outcomes: DiagnosticFormOutcome[];
};
