import { normaliseLlmResult } from "../result/parser";
import type {
  MatchScoreSnapshot,
  SessionLlmResultSnapshot,
  SessionRecommendationSnapshot,
} from "./types";

const isMatchScoreSnapshot = (value: unknown): value is MatchScoreSnapshot => {
  if (!value || typeof value !== "object") return false;
  const bucket = value as Record<string, unknown>;
  const score = bucket.score;
  const reason = bucket.reason;
  const validScore = typeof score === "number" || score === null;
  const validReason = typeof reason === "string" || reason === null;
  return validScore && validReason;
};

const isSessionRecommendationSnapshot = (value: unknown): value is SessionRecommendationSnapshot => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== "string") return false;
  if (!isMatchScoreSnapshot(record.total_match)) return false;
  if (!isMatchScoreSnapshot(record.personality_match)) return false;
  if (!isMatchScoreSnapshot(record.work_match)) return false;
  return true;
};

export const isSanitizedSessionLlmResult = (value: unknown): value is SessionLlmResultSnapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return false;
  return entries.every(([key, bucket]) => /^\d+$/.test(key) && isSessionRecommendationSnapshot(bucket));
};

export const sanitizeSessionLlmResult = (raw: unknown): SessionLlmResultSnapshot | null => {
  if (isSanitizedSessionLlmResult(raw)) {
    return raw;
  }

  const parsed = normaliseLlmResult(raw);
  if (!parsed.rankings.length) {
    return null;
  }

  const next: SessionLlmResultSnapshot = {};
  parsed.rankings.forEach((ranking, index) => {
    const key = Number.isFinite(ranking.rank) && ranking.rank > 0 ? String(ranking.rank) : String(index + 1);
    next[key] = {
      name: ranking.name,
      total_match: {
        score: ranking.scores.total_match,
        reason: ranking.reasons.total_match,
      },
      personality_match: {
        score: ranking.scores.personality_match,
        reason: ranking.reasons.personality_match,
      },
      work_match: {
        score: ranking.scores.work_match,
        reason: ranking.reasons.work_match,
      },
    };
  });

  return Object.keys(next).length ? next : null;
};
