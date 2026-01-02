export type DiagnosticSessionStatus = "in_progress" | "awaiting_llm" | "completed" | "expired";

export type MatchScoreSnapshot = {
  score: number | null;
  reason: string | null;
};

export type SessionRecommendationSnapshot = {
  name: string;
  total_match: MatchScoreSnapshot;
  personality_match: MatchScoreSnapshot;
  work_match: MatchScoreSnapshot;
};

export type SessionLlmResultSnapshot = Record<string, SessionRecommendationSnapshot>;

export type DiagnosticSessionState = {
  diagnostic_code: string;
  version_id: number | null;
  session_code: string | null;
  status: DiagnosticSessionStatus;
  choices: Record<string, number[]>;
  llm_result: SessionLlmResultSnapshot | null;
  llm_messages: unknown;
  completed_at: string | null;
  expires_at: string | null;
  version_options_hash: string | null;
  is_linked: boolean;
};
