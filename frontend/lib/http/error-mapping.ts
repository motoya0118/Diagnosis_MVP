import { ErrorCodeDefinition, ErrorCodeValue, getErrorDefinition, requireErrorDefinition } from "../error-codes";

export type ApiErrorMessage = {
  code?: string;
  variant: "info" | "warning" | "error";
  message: string;
  actionLabel?: string;
};

const pickVariant = (status: number) => {
  if (status >= 500) return "error";
  if (status === 404) return "info";
  return "warning";
};

const fromDefinition = (status: number, definition: ErrorCodeDefinition): ApiErrorMessage => ({
  code: definition.code,
  message: definition.uiMessage,
  actionLabel: definition.action ?? undefined,
  variant: pickVariant(status),
});

const FALLBACK_STATUS_CODES: Record<number, ErrorCodeValue> = {
  400: "E00102",
  404: "E00103",
  409: "E00104",
};

const DEFAULT_ERROR_CODE: ErrorCodeValue = "E00999";

export function mapApiErrorToMessage(status: number, code?: string): ApiErrorMessage {
  if (code) {
    const matched = getErrorDefinition(code);
    if (matched) {
      return fromDefinition(status, matched);
    }
  }

  const fallback = FALLBACK_STATUS_CODES[status];
  if (fallback) {
    return fromDefinition(status, requireErrorDefinition(fallback));
  }

  if (status >= 500) {
    return fromDefinition(status, requireErrorDefinition(DEFAULT_ERROR_CODE));
  }

  return fromDefinition(status, requireErrorDefinition(DEFAULT_ERROR_CODE));
}
