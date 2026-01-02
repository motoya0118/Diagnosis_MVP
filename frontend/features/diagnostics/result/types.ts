import type { SessionLlmResultSnapshot } from "../session/types";

export type ScoreKey = "total_match" | "personality_match" | "work_match";

export type ScoreDetail = {
  score: number | null;
  reason: string | null;
};

export type RankedRecommendation = {
  rank: number;
  name: string;
  scores: Record<ScoreKey, number | null>;
  reasons: Record<ScoreKey, string | null>;
};

export type NormalisedLlmResult = {
  rankings: RankedRecommendation[];
  warnings: string[];
  sourceText: string | null;
};

export type SessionLlmResult = {
  raw: SessionLlmResultSnapshot;
  generatedAt: string | null;
};

export type SessionOutcome = {
  outcomeId: number;
  sortOrder: number;
  meta: Record<string, unknown> | null;
};
