"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DiagnosticSessionProvider,
  useDiagnosticSessionActions,
  useDiagnosticSessionState,
  createAnswerSubmitter,
  createLlmExecutor,
} from "../../../../features/diagnostics/session";
import { useSessionLinker } from "../../../../features/diagnostics/session/useSessionLinker";
import {
  fetchDiagnosticForm,
  startDiagnosticSession,
  reconcileSessionState,
  resolveCompletedSessionSnapshot,
  isLastQuestionAnswered,
  type DiagnosticFormQuestion,
  type DiagnosticFormOption,
  type NormalisedDiagnosticForm,
  type DiagnosticFormResponse,
} from "../../../../features/diagnostics/commonQa";
import { useToast } from "../../../providers/feedback_provider";
import { findUnansweredQuestions } from "../../../../features/diagnostics/commonQa/validation";
import LoaderOverlay from "../../../../components/layout/LoaderOverlay";

type Props = {
  diagnosticCode: string;
};

const DIAGNOSTIC_LABELS: Record<string, string> = {
  ai_career: "ITキャリア診断",
};

type CachedFormEntry = {
  data: NormalisedDiagnosticForm;
  etag?: string;
};

const compareSortOrder = <T extends { sort_order: number }>(a: T, b: T, tieBreaker: number, tieBreakerB: number) => {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return tieBreaker - tieBreakerB;
};

const normaliseForm = (response: DiagnosticFormResponse): NormalisedDiagnosticForm => {
  const questions = [...response.questions]
    .filter((question) => question.is_active)
    .map((question) => ({
      ...question,
      multi: Boolean(question.multi),
      description: question.description ?? null,
    }))
    .sort((a, b) => compareSortOrder(a, b, a.id, b.id));

  const optionsByCode: Record<string, DiagnosticFormOption[]> = {};
  questions.forEach((question) => {
    const rawOptions =
      response.options[String(question.id)] ??
      response.options[question.q_code] ??
      response.options[String(question.q_code)] ??
      [];
    const activeOptions = rawOptions
      .filter((option) => option.is_active)
      .map((option) => ({
        ...option,
        description: option.description ?? null,
        helper_text: option.helper_text ?? null,
      }))
      .sort((a, b) => compareSortOrder(a, b, a.version_option_id, b.version_option_id));
    optionsByCode[question.q_code] = activeOptions;
  });

  return {
    ...response,
    questions,
    options: optionsByCode,
  };
};

const resolveInitialQuestionIndex = (
  form: NormalisedDiagnosticForm,
  sessionChoices: Record<string, number[]>,
  reusedChoices: boolean,
): number => {
  if (!form.questions.length) return 0;
  if (!reusedChoices) return 0;
  const unanswered = findUnansweredQuestions(form.questions, sessionChoices);
  if (unanswered.length === 0) {
    return form.questions.length - 1;
  }
  const first = unanswered[0];
  const index = form.questions.findIndex((question) => question.q_code === first);
  return index >= 0 ? index : 0;
};

const flattenOptionIds = (choices: Record<string, number[]>) =>
  Object.values(choices)
    .flat()
    .map((value) => Number(value));

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const LLM_EXECUTION_POLL_INTERVAL_MS = 10_000;
const LLM_EXECUTION_MAX_WAIT_MS = 180_000;

const useSessionInitialiser = (diagnosticCode: string) => {
  const toast = useToast();
  const { state, loading } = useDiagnosticSessionState();
  const actions = useDiagnosticSessionActions();
  const [initialising, setInitialising] = useState(false);
  const [initialisingMessage, setInitialisingMessage] = useState("診断内容を読み込んでいます...");
  const [initError, setInitError] = useState<string | null>(null);
  const [reusedChoices, setReusedChoices] = useState(false);
  const [requiresDecision, setRequiresDecision] = useState(false);
  const hasInitialisedRef = useRef(false);
  const initialisingRef = useRef(false);
  const cacheRef = useRef<Map<number, CachedFormEntry>>(new Map());
  const [form, setForm] = useState<NormalisedDiagnosticForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const stateRef = useRef(state ?? null);
  const lastOptionsRef = useRef<{ allowCompleted: boolean }>({ allowCompleted: false });

  useEffect(() => {
    stateRef.current = state ?? null;
  }, [state]);

  const loadForm = useCallback(
    async (versionId: number, { force = false }: { force?: boolean } = {}) => {
      setFormError(null);
      try {
        const cache = cacheRef.current.get(versionId);
        const etag = force ? undefined : cache?.etag;
        const result = await fetchDiagnosticForm(versionId, { etag });

        if (result.status === "not_modified" && cache) {
          setForm(cache.data);
          return cache.data;
        }

        if (result.status === "ok") {
          const normalised = normaliseForm(result.data);
          cacheRef.current.set(versionId, { data: normalised, etag: result.etag });
          setForm(normalised);
          return normalised;
        }

        throw new Error("フォームデータが取得できませんでした。");
      } catch (error) {
        console.error(error);
        setForm(null);
        setFormError("フォームの読み込みに失敗しました。時間をおいて再度お試しください。");
        throw error;
      }
    },
    [],
  );

  const initialiseSession = useCallback(async ({ allowCompleted = false }: { allowCompleted?: boolean } = {}) => {
    if (initialisingRef.current) return;
    initialisingRef.current = true;
    lastOptionsRef.current = { allowCompleted };
    setInitError(null);
    setInitialisingMessage(allowCompleted ? "再診断の準備をしています..." : "診断内容を読み込んでいます...");
    try {
      if (allowCompleted) {
        setRequiresDecision(false);
      }

      const completed = resolveCompletedSessionSnapshot(stateRef.current);
      if (!allowCompleted && completed) {
        setRequiresDecision(true);
        setForm(null);
        setReusedChoices(false);
        return;
      }

      setInitialising(true);
      const session = await startDiagnosticSession(diagnosticCode);
      const { state: nextState, reusedChoices: reuse } = reconcileSessionState(diagnosticCode, stateRef.current, session);
      actions.setSessionState(nextState);
      setReusedChoices(reuse);
      await loadForm(session.version_id, { force: !reuse });
      setRequiresDecision(false);
    } catch (error) {
      console.error(error);
      const message =
        (typeof error === "object" && error && "resolved" in error && typeof (error as any).resolved?.message === "string"
          ? (error as any).resolved.message
          : undefined) ?? "セッションの初期化に失敗しました。再度お試しください。";
      setInitError(message);
      toast.error(message);
    } finally {
      initialisingRef.current = false;
      setInitialising(false);
    }
  }, [actions, diagnosticCode, loadForm, toast]);

  useEffect(() => {
    if (loading) return;
    if (hasInitialisedRef.current) return;
    hasInitialisedRef.current = true;
    void initialiseSession();
  }, [loading, initialiseSession]);

  useEffect(() => {
    hasInitialisedRef.current = false;
  }, [diagnosticCode]);

  const retryInitialise = useCallback(() => {
    void initialiseSession(lastOptionsRef.current);
  }, [initialiseSession]);

  const requestRediagnosis = useCallback(() => {
    void initialiseSession({ allowCompleted: true });
  }, [initialiseSession]);

  return {
    session: state,
    initialising,
    initError,
    retryInitialise,
    form,
    formError,
    loadForm,
    reusedChoices,
    requiresDecision,
    requestRediagnosis,
    initialisingMessage,
  };
};

const QuestionNavigator = ({
  question,
  choices,
  options,
  multi,
  onToggle,
}: {
  question: DiagnosticFormQuestion;
  choices: number[];
  options: DiagnosticFormOption[];
  multi: boolean;
  onToggle: (option: DiagnosticFormOption) => void;
}) => {
  return (
    <div className="options">
      {options.map((option) => {
        const isSelected = choices.includes(option.version_option_id);
        return (
          <label key={option.version_option_id} className={`opt${isSelected ? " selected" : ""}`}>
            <input
              type={multi ? "checkbox" : "radio"}
              name={question.q_code}
              value={option.version_option_id}
              checked={isSelected}
              onChange={() => onToggle(option)}
            />
            <div>
              <span className="label">{option.display_label}</span>
              {option.description ? <span className="desc">{option.description}</span> : null}
              {option.helper_text ? <span className="desc">{option.helper_text}</span> : null}
            </div>
          </label>
        );
      })}
    </div>
  );
};

function ScreenBody({ diagnosticCode }: Props) {
  const toast = useToast();
  const router = useRouter();
  const {
    session,
    initialising,
    initError,
    retryInitialise,
    form,
    formError,
    loadForm,
    reusedChoices,
    requiresDecision,
    requestRediagnosis,
    initialisingMessage,
  } =
    useSessionInitialiser(diagnosticCode);
  const { loading } = useDiagnosticSessionState();
  const actions = useDiagnosticSessionActions();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const submitter = useMemo(() => createAnswerSubmitter({ actions, toast }), [actions, toast]);
  const executor = useMemo(() => createLlmExecutor({ actions, toast }), [actions, toast]);
  const { linkPendingSessions, linking: linkingSessions } = useSessionLinker();
  const initialisedRef = useRef(false);

  useEffect(() => {
    initialisedRef.current = false;
  }, [session?.session_code]);

  useEffect(() => {
    if (!form || !session) return;
    if (initialisedRef.current) return;
    initialisedRef.current = true;
    setCurrentIndex(resolveInitialQuestionIndex(form, session.choices, reusedChoices));
  }, [form, session, reusedChoices]);

  const handleToggle = useCallback(
    (question: DiagnosticFormQuestion, option: DiagnosticFormOption) => {
      if (!session || submitting || llmLoading) return;
      const current = session.choices[question.q_code] ?? [];
      const isSelected = current.includes(option.version_option_id);

      if (question.multi) {
        if (isSelected) {
          const next = current.filter((id) => id !== option.version_option_id);
          if (next.length === 0) {
            actions.removeChoice(question.q_code);
          } else {
            actions.upsertChoice(question.q_code, next);
          }
        } else {
          actions.upsertChoice(question.q_code, [...current, option.version_option_id]);
        }
      } else {
        if (isSelected) {
          actions.removeChoice(question.q_code);
        } else {
          actions.upsertChoice(question.q_code, [option.version_option_id]);
        }
      }
    },
    [actions, session, submitting, llmLoading],
  );

  const goPrevious = useCallback(() => {
    setCurrentIndex((index) => Math.max(index - 1, 0));
  }, []);

  const goNext = useCallback(() => {
    if (!form) return;
    setCurrentIndex((index) => Math.min(index + 1, form.questions.length - 1));
  }, [form]);

  const handleSubmit = useCallback(async () => {
    if (!session || !form) return;
    if (!session.session_code || !session.version_id) {
      toast.error("セッション情報を再取得してください。");
      return;
    }

    const unanswered = findUnansweredQuestions(form.questions, session.choices);
    if (unanswered.length > 0) {
      const targetQuestion = unanswered[0];
      const index = form.questions.findIndex((question) => question.q_code === targetQuestion);
      if (index >= 0) {
        setCurrentIndex(index);
      }
      toast.warning("未回答の設問があります。すべて回答してください。");
      return;
    }

    const optionIds = flattenOptionIds(session.choices);
    if (!optionIds.length) {
      toast.warning("最低1つは選択してください。");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitter({
        sessionCode: session.session_code,
        versionId: session.version_id,
        optionIds,
      });

      if (result.status === "option_out_of_version") {
        await loadForm(session.version_id, { force: true }).catch(() => {});
        return;
      }

      if (result.status !== "success" && result.status !== "duplicate_answer") {
        return;
      }

      setLlmLoading(true);
      const startedAt = Date.now();
      let execution = await executor({ sessionCode: session.session_code, force_regenerate: false });

      while (execution.status === "retryable_error") {
        const elapsed = Date.now() - startedAt;
        if (elapsed >= LLM_EXECUTION_MAX_WAIT_MS) {
          toast.error("診断結果の生成に時間がかかっています。時間をおいて再度お試しください。");
          break;
        }

        await sleep(LLM_EXECUTION_POLL_INTERVAL_MS);
        execution = await executor({ sessionCode: session.session_code, force_regenerate: false });
      }

      if (execution.status === "success") {
        const linkResult = await linkPendingSessions({ sessionCodes: [session.session_code] });
        if (linkResult.status === "error") {
          return;
        }

        const target = `/diagnostics/${encodeURIComponent(diagnosticCode)}/result?session_code=${encodeURIComponent(session.session_code)}`;
        router.push(target);
      }
    } finally {
      setLlmLoading(false);
      setSubmitting(false);
    }
  }, [
    session,
    form,
    submitter,
    executor,
    linkPendingSessions,
    toast,
    diagnosticCode,
    router,
    loadForm,
  ]);

  const handleViewPreviousResult = useCallback(() => {
    if (!session?.session_code) return;
    const target = `/diagnostics/${encodeURIComponent(diagnosticCode)}/result?session_code=${encodeURIComponent(session.session_code)}`;
    router.replace(target);
  }, [diagnosticCode, router, session?.session_code]);

  const overlayMessage = llmLoading
    ? "結果を生成しています..."
    : linkingSessions
      ? "診断結果を保存しています..."
      : submitting
      ? "回答を送信しています..."
      : initialising
        ? initialisingMessage
        : null;
  const overlayOpen = overlayMessage !== null;
  const overlayText = overlayMessage ?? initialisingMessage;

  let content: React.ReactNode;

  if (requiresDecision && session?.session_code) {
    content = (
      <div className="container">
        <div className="card">
          <p>前回の診断結果が保存されています。どちらに進みますか？</p>
          <div className="actions">
            <button type="button" className="btn" onClick={handleViewPreviousResult}>
              前回の結果を表示
            </button>
            <button type="button" className="btn ghost" disabled={initialising} onClick={requestRediagnosis}>
              再診断する
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!content && initError) {
    content = (
      <div className="container">
        <div className="card">
          <p>{initError}</p>
          <div className="actions">
            <button type="button" className="btn" onClick={retryInitialise}>
              再読み込み
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!content && (initialising || !form || !session)) {
    content = (
      <div className="container">
        <div className="card">
          <p>{initialisingMessage}</p>
        </div>
      </div>
    );
  }

  if (!content && formError) {
    content = (
      <div className="container">
        <div className="card">
          <p>{formError}</p>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (session?.version_id) {
                  void loadForm(session.version_id, { force: true });
                } else {
                  retryInitialise();
                }
              }}
            >
              再試行
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!content && (!form || !session)) {
    content = (
      <div className="container">
        <div className="card">
          <p>診断を開始できませんでした。時間をおいて再度お試しください。</p>
        </div>
      </div>
    );
  }

  if (!content && form && session) {
    const totalQuestions = form.questions.length;
    const answeredCount = totalQuestions - findUnansweredQuestions(form.questions, session.choices).length;
    const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;
    const question = form.questions[currentIndex];
    const options = question ? form.options[question.q_code] ?? [] : [];
    const selected = question ? session.choices[question.q_code] ?? [] : [];
    const canGoNext = question ? (session.choices[question.q_code]?.length ?? 0) > 0 : true;
    const isLastQuestion = currentIndex >= totalQuestions - 1;
    const lastQuestionAnswered = isLastQuestionAnswered(form, session);
    const diagnosticLabel = DIAGNOSTIC_LABELS[diagnosticCode] ?? diagnosticCode;

    content = (
      <div className="container">
        <header className="diagnostic-header">
          <p className="subtitle">{diagnosticLabel}</p>
          <div className="progress">
            <span id="stepLabel">
              質問 {Number.isFinite(currentIndex) ? currentIndex + 1 : 0} / {totalQuestions}
            </span>
            <div className="bar">
              <div className="fill" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </header>

        {question ? (
          <section className="card">
            <div className="qhead">
              <span className="qcode">Q{String(currentIndex + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="qtitle">{question.display_text}</h2>
                {question.description ? <p className="subtitle">{question.description}</p> : null}
              </div>
            </div>

            <QuestionNavigator
              question={question}
              choices={selected}
              options={options}
              multi={question.multi}
              onToggle={(option) => handleToggle(question, option)}
            />

            <div className="actions">
              <button type="button" className="btn ghost" disabled={currentIndex === 0 || submitting || llmLoading} onClick={goPrevious}>
                前へ
              </button>
              {isLastQuestion ? (
                <button type="button" className="btn" disabled={submitting || llmLoading || !lastQuestionAnswered} onClick={handleSubmit}>
                  {llmLoading ? "結果生成中..." : submitting ? "送信中..." : "回答を送信"}
                </button>
              ) : (
                <button type="button" className="btn" disabled={!canGoNext || submitting || llmLoading} onClick={goNext}>
                  次へ
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="card">
            <p>質問が設定されていません。</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <LoaderOverlay open={overlayOpen} message={overlayText} />
      {content}
    </>
  );
}

export default function CommonQaScreen({ diagnosticCode }: Props) {
  return (
    <DiagnosticSessionProvider diagnosticCode={diagnosticCode}>
      <ScreenBody diagnosticCode={diagnosticCode} />
    </DiagnosticSessionProvider>
  );
}
