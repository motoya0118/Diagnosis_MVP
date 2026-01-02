"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";

import { linkSessions, extractErrorCode } from "../../../lib/backend";
import type { ErrorCodeDefinition } from "../../../lib/error-codes";
import { useToast } from "../../../app/providers/feedback_provider";
import {
  listStoredDiagnosticCodes,
  readSessionSnapshot,
  persistSessionSnapshot,
  clearSessionSnapshot,
} from "./storage";
import type { DiagnosticSessionState } from "./types";

type StoredSessionEntry = {
  diagnosticCode: string;
  state: DiagnosticSessionState;
};

type LinkAttemptResult =
  | { status: "skipped" }
  | { status: "noop" }
  | { status: "linked"; linked: string[]; alreadyLinked: string[] }
  | { status: "error"; error: unknown; errorCode?: ErrorCodeDefinition };

const collectStoredSessions = (): StoredSessionEntry[] => {
  const codes = listStoredDiagnosticCodes();
  const entries: StoredSessionEntry[] = [];
  codes.forEach((code) => {
    const snapshot = readSessionSnapshot(code);
    if (snapshot) {
      entries.push({ diagnosticCode: code, state: snapshot });
    }
  });
  return entries;
};

const selectLinkableEntries = (
  entries: StoredSessionEntry[],
  sessionCodes?: string[],
): StoredSessionEntry[] => {
  const allowed = sessionCodes ? new Set(sessionCodes) : undefined;
  const seen = new Set<string>();

  return entries.filter(({ state }) => {
    const code = state.session_code;
    if (!code) return false;
    if (seen.has(code)) return false;
    if (allowed && !allowed.has(code)) return false;
    if (state.is_linked) return false;
    seen.add(code);
    return true;
  });
};

const probeLocalStorage = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    const key = "__diagnostics_link_probe__";
    window.localStorage.setItem(key, "ok");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const LINK_GENERIC_FAILURE =
  "診断結果の保存に失敗しました。時間をおいて再度お試しください。";

export function useSessionLinker() {
  const toast = useToast();
  const { data: session, status } = useSession();
  const [linking, setLinking] = useState(false);
  const accessToken =
    session && typeof session === "object" && "accessToken" in session
      ? (session as { accessToken?: string }).accessToken
      : undefined;

  const linkPendingSessions = useCallback(
    async (options?: { sessionCodes?: string[] }): Promise<LinkAttemptResult> => {
      if (status !== "authenticated" || !accessToken) {
        return { status: "skipped" };
      }

      const entries = selectLinkableEntries(
        collectStoredSessions(),
        options?.sessionCodes,
      );
      if (!entries.length) {
        return { status: "noop" };
      }

      const sessionCodes = entries
        .map((entry) => entry.state.session_code)
        .filter((code): code is string => Boolean(code));
      if (!sessionCodes.length) {
        return { status: "noop" };
      }

      setLinking(true);
      const useLocalStorage = probeLocalStorage();

      try {
        const response = await linkSessions(sessionCodes, accessToken);
        const acknowledged = new Set([
          ...response.linked,
          ...response.already_linked,
        ]);

        entries.forEach(({ diagnosticCode, state }) => {
          const code = state.session_code;
          if (!code || !acknowledged.has(code)) return;

          const nextState: DiagnosticSessionState = {
            ...state,
            is_linked: true,
          };
          persistSessionSnapshot(nextState, { useLocalStorage });
        });

        if (response.linked.length) {
          toast.success("診断結果を保存しました。");
        }
        return {
          status: "linked",
          linked: response.linked,
          alreadyLinked: response.already_linked,
        };
      } catch (error) {
        const definition = extractErrorCode(error);
        if (definition) {
          toast.error(definition.uiMessage || LINK_GENERIC_FAILURE);

          if (
            definition.code === "E040" ||
            definition.code === "E062"
          ) {
            entries.forEach(({ diagnosticCode }) =>
              clearSessionSnapshot(diagnosticCode),
            );
          }

          return { status: "error", error, errorCode: definition };
        }

        toast.error(LINK_GENERIC_FAILURE);
        return { status: "error", error };
      } finally {
        setLinking(false);
      }
    },
    [accessToken, status, toast],
  );

  return { linkPendingSessions, linking };
}

export type UseSessionLinkerResult = ReturnType<typeof useSessionLinker>;
