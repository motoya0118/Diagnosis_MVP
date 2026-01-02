import type { NormalisedLlmResult, RankedRecommendation, ScoreKey } from "./types";

const JSON_BLOCK_REGEX = /```(?:json)?\s*([\s\S]*?)```/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isSanitisedScoreBucket = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  const score = value.score;
  const reason = value.reason;
  const validScore = typeof score === "number" || score === null;
  const validReason = typeof reason === "string" || reason === null;
  return validScore && validReason;
};

const parseSanitisedRankingDocumentFromObject = (raw: unknown): Record<string, Record<string, unknown>> | null => {
  if (!isRecord(raw)) return null;
  const entries = Object.entries(raw).filter(([key, value]) => /^\d+$/.test(key) && isRecord(value));
  if (!entries.length) return null;

  const sanitized: Record<string, Record<string, unknown>> = {};
  for (const [key, value] of entries) {
    const payload = value as Record<string, unknown>;
    if (typeof payload.name !== "string") {
      return null;
    }
    const totalMatch = payload["total_match"];
    const personalityMatch = payload["personality_match"];
    const workMatch = payload["work_match"];
    if (!isSanitisedScoreBucket(totalMatch) || !isSanitisedScoreBucket(personalityMatch) || !isSanitisedScoreBucket(workMatch)) {
      return null;
    }
    sanitized[key] = payload;
  }

  return sanitized;
};

const normaliseString = (value: unknown): string | null => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const clampScore = (value: unknown): number | null => {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return null;
  if (Number.isNaN(num)) return null;
  if (!Number.isFinite(num)) return null;
  const clamped = Math.min(Math.max(num, 0), 100);
  return Math.round(clamped * 10) / 10;
};

const extractScore = (bucket: unknown): number | null => {
  if (isRecord(bucket) && "score" in bucket) {
    return clampScore(bucket.score);
  }
  return clampScore(bucket);
};

const extractReason = (bucket: unknown): string | null => {
  if (isRecord(bucket) && "reason" in bucket) {
    return normaliseString(bucket.reason);
  }
  return normaliseString(bucket);
};

const joinTextEntries = (entries: unknown[]): string | null => {
  const buffer: string[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const text = record.text;
    if (typeof text === "string" && text.trim()) {
      buffer.push(text);
      continue;
    }
    if (Array.isArray(text)) {
      const joined = text.map((value) => (typeof value === "string" ? value : "")).join("");
      if (joined.trim()) {
        buffer.push(joined);
      }
    }
  }
  if (!buffer.length) return null;
  const combined = buffer.join("\n").trim();
  return combined ? combined : null;
};

const extractFromParts = (parts: unknown): string | null => {
  if (!Array.isArray(parts)) {
    return null;
  }
  return joinTextEntries(parts);
};

export const extractContentText = (raw: unknown): string | null => {
  if (typeof raw === "string") {
    return raw.trim() ? raw : null;
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const directText = record.text;
  if (typeof directText === "string" && directText.trim()) {
    return directText;
  }

  const content = record.content;

  if (Array.isArray(content)) {
    const joined = joinTextEntries(content);
    if (joined) {
      return joined;
    }
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const nested = (item as Record<string, unknown>).content;
      if (Array.isArray(nested)) {
        const nestedJoined = joinTextEntries(nested);
        if (nestedJoined) {
          return nestedJoined;
        }
      }
    }
  } else if (content && typeof content === "object") {
    const parts = (content as Record<string, unknown>).parts;
    const joined = extractFromParts(parts);
    if (joined) {
      return joined;
    }
  }

  const candidates = record.candidates;
  if (Array.isArray(candidates)) {
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const candidateRecord = candidate as Record<string, unknown>;
      const candidateContent = candidateRecord.content;
      if (typeof candidateContent === "string" && candidateContent.trim()) {
        return candidateContent;
      }
      if (candidateContent && typeof candidateContent === "object") {
        const parts = (candidateContent as Record<string, unknown>).parts;
        const joined = extractFromParts(parts);
        if (joined) {
          return joined;
        }
        const innerContent = (candidateContent as Record<string, unknown>).content;
        if (Array.isArray(innerContent)) {
          const nested = joinTextEntries(innerContent);
          if (nested) {
            return nested;
          }
        }
      }
    }
  }

  const outputText = record.output_text;
  if (typeof outputText === "string" && outputText.trim()) {
    return outputText;
  }
  if (Array.isArray(outputText)) {
    const joined = outputText.map((entry) => (typeof entry === "string" ? entry : "")).join("").trim();
    if (joined) {
      return joined;
    }
  }

  return null;
};

export const extractJsonSnippet = (text: string): string | null => {
  if (!text.trim()) return null;
  const codeMatch = text.match(JSON_BLOCK_REGEX);
  if (codeMatch) {
    const snippet = codeMatch[1].trim();
    if (snippet) return snippet;
  }
  return text.trim();
};

export const parseRankingDocument = (jsonText: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(jsonText);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const findClosingBraceIndex = (text: string, startIndex: number): number => {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
      if (depth < 0) {
        return -1;
      }
    }
  }
  return -1;
};

const recoverRankingDocument = (text: string): Record<string, unknown> | null => {
  const entries: Record<string, unknown> = {};
  const pattern = /"(\d+)"\s*:\s*{/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const key = match[1];
    const start = text.indexOf("{", match.index);
    if (start === -1) {
      continue;
    }
    const end = findClosingBraceIndex(text, start);
    if (end === -1) {
      continue;
    }
    const block = text.slice(start, end + 1);
    try {
      const parsed = JSON.parse(block);
      if (isRecord(parsed)) {
        entries[key] = parsed;
      }
    } catch {
      continue;
    }
  }
  return Object.keys(entries).length ? entries : null;
};

const buildRankingEntry = (rankKey: string, payload: Record<string, unknown>): RankedRecommendation => {
  const explicitRank = Number.parseInt(rankKey, 10);
  const rank = Number.isFinite(explicitRank) ? explicitRank : Number.NaN;

  const scores: Record<ScoreKey, number | null> = {
    total_match: extractScore(payload["total_match"]),
    personality_match: extractScore(payload["personality_match"]),
    work_match: extractScore(payload["work_match"]),
  };

  const reasons: Record<ScoreKey, string | null> = {
    total_match: extractReason(payload["total_match"]),
    personality_match: extractReason(payload["personality_match"]),
    work_match: extractReason(payload["work_match"]),
  };

  const fallbackName = Number.isFinite(rank) ? `候補${rank}` : "候補";

  return {
    rank: Number.isFinite(rank) ? rank : 0,
    name: normaliseString(payload.name) ?? fallbackName,
    scores,
    reasons,
  };
};

const buildRankings = (document: Record<string, unknown>): RankedRecommendation[] => {
  const entries = Object.entries(document)
    .filter(([key, value]) => /^\d+$/.test(key) && isRecord(value))
    .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10));

  return entries.map(([rankKey, value]) => buildRankingEntry(rankKey, value as Record<string, unknown>));
};

export const normaliseLlmResult = (raw: unknown): NormalisedLlmResult => {
  const sanitisedDocument = parseSanitisedRankingDocumentFromObject(raw);
  if (sanitisedDocument) {
    const rankings = buildRankings(sanitisedDocument);
    if (rankings.length) {
      return {
        rankings,
        warnings: [],
        sourceText: JSON.stringify(sanitisedDocument),
      };
    }
  }

  const sourceText = extractContentText(raw);
  if (!sourceText) {
    return {
      rankings: [],
      warnings: ["LLMの結果テキストが見つかりませんでした。"],
      sourceText: null,
    };
  }

  const jsonText = extractJsonSnippet(sourceText);
  if (!jsonText) {
    return {
      rankings: [],
      warnings: ["LLMの結果からJSONを抽出できませんでした。"],
      sourceText,
    };
  }

  const parsedDocument = parseRankingDocument(jsonText);
  const recoveredDocument = parsedDocument ?? recoverRankingDocument(jsonText);
  if (!recoveredDocument) {
    return {
      rankings: [],
      warnings: ["LLMの結果が正しいJSON形式ではありません。"],
      sourceText,
    };
  }

  const rankings = buildRankings(recoveredDocument);

  if (!rankings.length) {
    return {
      rankings: [],
      warnings: ["LLMの結果にランキング情報が含まれていません。"],
      sourceText,
    };
  }

  const warnings: string[] = [];
  if (!parsedDocument) {
    warnings.push("LLMの結果が途中で途切れていたため、一部のみ復元しました。");
  }

  return {
    rankings,
    warnings,
    sourceText,
  };
};
