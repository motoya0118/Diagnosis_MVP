"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  useDiagnosticSessionActions,
  useDiagnosticSessionState,
  sanitizeSessionLlmResult,
} from "../session";
import { useSessionLinker } from "../session/useSessionLinker";
import { getSession } from "../../../lib/backend";
import {
  normaliseLlmResult,
  type RankedRecommendation,
  type ScoreKey,
  type SessionLlmResult,
  type SessionOutcome,
} from "./index";
import { ScoreChart, type ChartRow, type SeriesDefinition } from "./ScoreChart";
import { ReasonsAccordion, type ReasonItem } from "./ReasonsAccordion";
import { OutcomeModal } from "./OutcomeModal";
import LoaderOverlay from "../../../components/layout/LoaderOverlay";

type Props = {
  diagnosticCode: string;
  sessionCode: string;
};

const DIAGNOSTIC_LABELS: Record<string, string> = {
  ai_career: "ITキャリア診断",
};

type OutcomeMetaMap = Record<string, Record<string, unknown> | null>;

const normaliseOutcomeName = (meta: Record<string, unknown> | null | undefined) => {
  if (!meta || typeof meta !== "object") return null;
  const name = (meta as Record<string, unknown>).name;
  if (typeof name === "string") {
    const trimmed = name.trim();
    return trimmed || null;
  }
  return null;
};

const buildOutcomeMetaMap = (outcomes: SessionOutcome[]): OutcomeMetaMap => {
  const map: OutcomeMetaMap = {};
  for (const outcome of outcomes) {
    const meta = outcome.meta ?? null;
    const name = meta ? normaliseOutcomeName(meta) : null;
    if (name && meta) {
      map[name] = meta;
    }
  }
  return map;
};

const normaliseSessionOutcomes = (
  outcomes:
    | {
        outcome_id: number;
        sort_order: number;
        meta: Record<string, unknown> | null;
      }[]
    | undefined
    | null,
): SessionOutcome[] => {
  if (!Array.isArray(outcomes)) return [];
  return outcomes.map((outcome) => ({
    outcomeId: outcome.outcome_id,
    sortOrder: outcome.sort_order,
    meta: outcome.meta ?? null,
  }));
};

const deriveInitialSession = (
  state: ReturnType<typeof useDiagnosticSessionState>["state"],
  sessionCode: string,
): SessionLlmResult | null => {
  if (!state) return null;
  if (state.session_code !== sessionCode) return null;
  if (!state.llm_result) return null;
  return {
    raw: state.llm_result,
    generatedAt: state.completed_at ?? null,
  };
};

const formatGeneratedAt = (value: string | null) => {
  if (!value) return null;
  const normalised = value.replace("Z", "+00:00");
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  try {
    return date.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  } catch {
    return date.toISOString();
  }
};

const buildOutcomeMetaLookup = (map: OutcomeMetaMap, ranking: RankedRecommendation) => {
  const meta = map[ranking.name];
  if (!meta) return null;
  return meta;
};

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 3 * 60 * 1000;

const SERIES_DEFINITIONS: Record<ScoreKey, { label: string; color: string }> = {
  total_match: { label: "総合マッチ度", color: "var(--accent-strong)" },
  personality_match: { label: "性格マッチ度", color: "var(--accent-2-strong)" },
  work_match: { label: "業務マッチ度", color: "var(--accent-3-strong, #f97316)" },
};

const SERIES_ORDER: ScoreKey[] = ["total_match", "personality_match", "work_match"];

export default function ResultScreen({ diagnosticCode, sessionCode }: Props) {
  const { state } = useDiagnosticSessionState();
  const actions = useDiagnosticSessionActions();
  const stateRef = useRef(state);
  const [sessionResult, setSessionResult] = useState<SessionLlmResult | null>(
    () => deriveInitialSession(state, sessionCode),
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [polling, setPolling] = useState<boolean>(false);
  const [outcomeMeta, setOutcomeMeta] = useState<OutcomeMetaMap>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [accordionOpenId, setAccordionOpenId] = useState<string | null>(null);
  const [hoverDetail, setHoverDetail] = useState<{ label: string; reason: string | null } | null>(
    null,
  );
  const [visibleSeries, setVisibleSeries] = useState<Record<ScoreKey, boolean>>({
    total_match: true,
    personality_match: true,
    work_match: true,
  });
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartRef = useRef<number | null>(null);
  const { linkPendingSessions } = useSessionLinker();

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const current = stateRef.current;
    if (!current) return;
    if (current.session_code !== sessionCode) return;
    if (current.is_linked) return;
    void linkPendingSessions({ sessionCodes: [sessionCode] });
  }, [linkPendingSessions, sessionCode]);

  useEffect(() => {
    const snapshot = deriveInitialSession(state, sessionCode);
    setSessionResult((current) => current ?? snapshot);
  }, [state, sessionCode]);

  useEffect(() => {
    let active = true;
    pollStartRef.current = Date.now();
    setLoading(true);
    setFetchError(null);
    setPolling(false);
    setHoverDetail(null);
    setOutcomeMeta({});

    const clearExistingTimer = () => {
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    (async () => {
      const poll = async () => {
        try {
          const response = await getSession(sessionCode);
          if (!active) return;

          const normalisedOutcomes = normaliseSessionOutcomes(response.outcomes);
          setOutcomeMeta(buildOutcomeMetaMap(normalisedOutcomes));

          if (!response.llm_result) {
            const startedAt = pollStartRef.current ?? Date.now();
            const elapsed = Date.now() - startedAt;
            if (elapsed >= MAX_POLL_DURATION_MS) {
              clearExistingTimer();
              setPolling(false);
              setLoading(false);
              setSessionResult(null);
              setFetchError("診断結果の生成に時間がかかっています。時間をおいて再度お試しください。");
              return;
            }

            setSessionResult(null);
            setPolling(true);
            setLoading(false);
            clearExistingTimer();
            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
            return;
          }

          clearExistingTimer();
          const sanitised = sanitizeSessionLlmResult(response.llm_result.raw);
          if (!sanitised) {
            clearExistingTimer();
            setSessionResult(null);
            setPolling(false);
            setLoading(false);
            setFetchError("診断結果の解析に失敗しました。時間をおいて再度お試しください。");
            return;
          }

          const next: SessionLlmResult = {
            raw: sanitised,
            generatedAt: response.llm_result.generated_at ?? null,
          };
          setSessionResult(next);
          setPolling(false);
          setLoading(false);

          const snapshot = stateRef.current;
          if (snapshot && snapshot.session_code === sessionCode) {
            actions.markCompleted(sanitised, {
              completed_at: response.llm_result.generated_at ?? snapshot.completed_at ?? null,
            });
          }
        } catch (error) {
          console.error(error);
          if (!active) return;
          clearExistingTimer();
          setPolling(false);
          setLoading(false);
          setFetchError("セッションの取得に失敗しました。時間をおいて再度お試しください。");
        }
      };

      await poll();
    })();

    return () => {
      active = false;
      if (pollTimerRef.current !== null) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [actions, sessionCode]);

  const normalised = useMemo(
    () => (sessionResult ? normaliseLlmResult(sessionResult.raw) : null),
    [sessionResult],
  );

  const formattedGeneratedAt = useMemo(
    () => formatGeneratedAt(sessionResult?.generatedAt ?? null),
    [sessionResult?.generatedAt],
  );

  const combinedRankings = useMemo(() => {
    if (!normalised) return [];
    return normalised.rankings.map((ranking) => ({
      ranking,
      meta: buildOutcomeMetaLookup(outcomeMeta, ranking),
      hasValidScore: SERIES_ORDER.some((key) => ranking.scores[key] !== null),
    }));
  }, [normalised, outcomeMeta]);

  useEffect(() => {
    if (!combinedRankings.length) {
      setSelectedId(null);
      setAccordionOpenId(null);
      setModalOpen(false);
      return;
    }

    if (!selectedId || !combinedRankings.some((item) => item.ranking.name === selectedId)) {
      setSelectedId(combinedRankings[0].ranking.name);
    }
    if (
      !accordionOpenId ||
      !combinedRankings.some((item) => item.ranking.name === accordionOpenId)
    ) {
      setAccordionOpenId(combinedRankings[0].ranking.name);
    }
  }, [combinedRankings, selectedId, accordionOpenId]);

  const chartRows: ChartRow[] = useMemo(() => {
    if (!combinedRankings.length) return [];
    const activeKeys = SERIES_ORDER.filter((key) => visibleSeries[key]);
    if (!activeKeys.length) {
      return [];
    }

    const totals = combinedRankings.map(({ ranking }) =>
      activeKeys.reduce((sum, key) => sum + Math.max(0, ranking.scores[key] ?? 0), 0),
    );
    const maxTotal = Math.max(100, ...totals, 0);

    return combinedRankings.map(({ ranking }) => {
      const segments = activeKeys.map((key) => {
        const value = Math.max(0, ranking.scores[key] ?? 0);
        const width = maxTotal > 0 ? (value / maxTotal) * 100 : 0;
        return {
          key,
          value,
          width,
          reason: ranking.reasons[key],
          color: SERIES_DEFINITIONS[key].color,
          label: SERIES_DEFINITIONS[key].label,
        };
      });
      const totalValue = segments.reduce((sum, segment) => sum + segment.value, 0);
      return {
        id: ranking.name,
        label: `${ranking.rank}. ${ranking.name}`,
        name: ranking.name,
        segments,
        total: totalValue,
      };
    });
  }, [combinedRankings, visibleSeries]);

  useEffect(() => {
    if (!chartRows.length) {
      setHoverDetail(null);
    }
  }, [chartRows.length]);

  const reasonItems: ReasonItem[] = useMemo(() => {
    return combinedRankings.map(({ ranking, meta }) => ({
      id: ranking.name,
      rank: ranking.rank,
      name: ranking.name,
      hasMeta: Boolean(meta),
      reasons: SERIES_ORDER.map((key) => ({
        key,
        label: SERIES_DEFINITIONS[key].label,
        color: SERIES_DEFINITIONS[key].color,
        score: ranking.scores[key],
        reason: ranking.reasons[key],
      })),
    }));
  }, [combinedRankings]);

  const selectedRanking =
    selectedId != null
      ? combinedRankings.find((entry) => entry.ranking.name === selectedId) ?? null
      : null;

  const diagnosticLabel = DIAGNOSTIC_LABELS[diagnosticCode] ?? "診断結果";
  const retryHref = `/diagnostics/common_qa?diagnostic_code=${encodeURIComponent(
    diagnosticCode,
  )}`;

  const handleToggleSeries = (key: ScoreKey) => {
    setVisibleSeries((current) => {
      const next = { ...current, [key]: !current[key] };
      const nextActive = SERIES_ORDER.filter((entry) => next[entry]);
      if (!nextActive.length) {
        return current;
      }
      return next;
    });
  };

  const chartSeries: SeriesDefinition[] = SERIES_ORDER.map((key) => ({
    key,
    label: SERIES_DEFINITIONS[key].label,
    color: SERIES_DEFINITIONS[key].color,
  }));

  const overlayMessage = loading
    ? "診断結果を読み込んでいます..."
    : !loading && polling && !fetchError
      ? "結果を生成しています..."
      : null;
  const overlayOpen = overlayMessage !== null;
  const overlayText = overlayMessage ?? "診断結果を読み込んでいます...";

  return (
    <>
      <LoaderOverlay open={overlayOpen} message={overlayText} />
      <main className="container diagnostic-result">
        <header className="site-header">
          <div className="container">
            <h1>{diagnosticLabel}</h1>
            <p className="subtitle">診断結果のサマリーをお届けします。</p>
          </div>
        </header>

        <section className="card">
          <div className="result-section">
            <h2>診断結果</h2>
            <p className="result-sub">
              セッションコード: <code>{sessionCode}</code>
            </p>
            {formattedGeneratedAt && (
              <p className="result-sub">生成日時: {formattedGeneratedAt}</p>
            )}
          </div>

          {loading && <p>診断結果を読み込んでいます...</p>}

          {!loading && polling && !fetchError && (
            <div className="result-section">
              <p>結果を生成しています。完了まで数分かかる場合があります...</p>
            </div>
          )}

          {!loading && fetchError && (
            <div className="result-section">
              <p>{fetchError}</p>
              <div className="actions">
                <Link className="btn" href={retryHref}>
                  診断に戻る
                </Link>
              </div>
            </div>
          )}

          {!loading && !fetchError && !sessionResult && !polling && (
            <div className="result-section">
              <p>結果がまだ生成されていません。回答送信後に再度アクセスしてください。</p>
              <div className="actions">
                <Link className="btn" href={retryHref}>
                  診断に戻る
                </Link>
              </div>
            </div>
          )}

          {!loading && !fetchError && sessionResult && normalised && (
            <>
              {normalised.warnings.length > 0 && (
                <div className="result-section">
                  {normalised.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              )}

              {combinedRankings.length > 0 ? (
                <>
                  <ReasonsAccordion
                    items={reasonItems}
                    openId={accordionOpenId}
                    onToggle={(id) =>
                      setAccordionOpenId((current) => (current === id ? null : id))
                    }
                    onSelect={(id) => {
                      setSelectedId(id);
                      setModalOpen(true);
                    }}
                  />

                  <ScoreChart
                    rows={chartRows}
                    series={chartSeries}
                    visibility={visibleSeries}
                    onToggle={handleToggleSeries}
                    onHover={setHoverDetail}
                    onSelect={(id) => {
                      setSelectedId(id);
                      setAccordionOpenId(id);
                      setModalOpen(true);
                    }}
                  />
                  {hoverDetail ? (
                    <div className="card score-chart__hover-card">
                      <div className="score-chart__hover">
                        <strong>{hoverDetail.label}:</strong>{" "}
                        {hoverDetail.reason ?? "理由は生成されませんでした。"}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="result-section">
                  <p>結果の解析に失敗しました。時間をおいて再度お試しください。</p>
                </div>
              )}
            </>
          )}

          <div className="actions">
            <Link className="btn" href={retryHref}>
              もう一度診断する
            </Link>
          </div>
        </section>

        <OutcomeModal
          open={modalOpen && Boolean(selectedRanking)}
          ranking={selectedRanking?.ranking ?? null}
          meta={selectedRanking?.meta ?? null}
          onClose={() => setModalOpen(false)}
          series={SERIES_DEFINITIONS}
        />
      </main>
    </>
  );
}
