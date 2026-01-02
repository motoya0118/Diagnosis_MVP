import { backend, type ExecuteSessionLlmPayload, type ExecuteSessionLlmResponse, extractErrorCode } from '../../../lib/backend'
import type { DiagnosticSessionActions } from './context'
import { sanitizeSessionLlmResult } from './llmResult'
import type { ToastPayload } from '../../../app/providers/feedback_provider'
import type { ErrorCodeDefinition } from '../../../lib/error-codes'

type ToastLike = {
  success(message: string, payload?: ToastPayload): unknown
  error(message: string, payload?: ToastPayload): unknown
  warning(message: string, payload?: ToastPayload): unknown
  info(message: string, payload?: ToastPayload): unknown
}

type ExecuteRequestFn = (sessionCode: string, payload?: ExecuteSessionLlmPayload) => Promise<ExecuteSessionLlmResponse>

type ExecutorDeps = {
  executeRequest?: ExecuteRequestFn
  extractError?: typeof extractErrorCode
}

type CreateExecutorOptions = {
  actions: DiagnosticSessionActions
  toast: ToastLike
  deps?: ExecutorDeps
}

export type ExecuteLlmParams = ExecuteSessionLlmPayload & {
  sessionCode: string
}

export type ExecuteLlmSuccessResult = {
  status: 'success'
  response: ExecuteSessionLlmResponse
}

export type ExecuteLlmNoAnswersResult = {
  status: 'no_answers'
  errorCode: ErrorCodeDefinition
}

export type ExecuteLlmSessionMissingResult = {
  status: 'session_not_found'
  errorCode: ErrorCodeDefinition
}

export type ExecuteLlmConfigurationErrorResult = {
  status: 'configuration_error'
  errorCode: ErrorCodeDefinition
}

export type ExecuteLlmFailureResult = {
  status: 'llm_failed'
  errorCode: ErrorCodeDefinition
}

export type ExecuteLlmRetryableResult = {
  status: 'retryable_error'
  error: unknown
}

export type ExecuteLlmUnknownErrorResult = {
  status: 'unknown_error'
  error: unknown
  errorCode?: ErrorCodeDefinition
}

export type ExecuteLlmResult =
  | ExecuteLlmSuccessResult
  | ExecuteLlmNoAnswersResult
  | ExecuteLlmSessionMissingResult
  | ExecuteLlmConfigurationErrorResult
  | ExecuteLlmFailureResult
  | ExecuteLlmRetryableResult
  | ExecuteLlmUnknownErrorResult

const LLM_REQUEST_TIMEOUT_MS = 180_000

const defaultExecuteRequest: ExecuteRequestFn = async (sessionCode, payload) => {
  const body: Record<string, unknown> = {}
  if (payload) {
    if (payload.model !== undefined) body.model = payload.model
    if (payload.temperature !== undefined) body.temperature = payload.temperature
    if (payload.top_p !== undefined) body.top_p = payload.top_p
    if (payload.force_regenerate !== undefined) body.force_regenerate = payload.force_regenerate
  }
  const response = await backend.post(`/sessions/${encodeURIComponent(sessionCode)}/llm`, body, {
    timeout: LLM_REQUEST_TIMEOUT_MS,
  })
  return response.data as ExecuteSessionLlmResponse
}

const SUCCESS_MESSAGE = '診断結果を生成しました'
const GENERIC_ERROR_MESSAGE = '診断結果の生成に失敗しました。時間をおいて再度お試しください。'

const CODE_SESSION_NOT_FOUND = 'E040'
const CODE_NO_ANSWERS = 'E045'
const CODE_SYSTEM_PROMPT_MISSING = 'E043'
const CODE_LLM_OP_INCOMPLETE = 'E044'
const CODE_VERSION_FROZEN = 'E020'
const CODE_LLM_FAILED = 'E050'

const RETRYABLE_GATEWAY_STATUS = new Set([502, 503, 504])
const RETRYABLE_ERROR_CODES = new Set(['ECONNABORTED', 'ERR_NETWORK'])

type MaybeAxiosError = {
  isAxiosError?: boolean
  response?: { status?: number }
  code?: string
}

export function createLlmExecutor({ actions, toast, deps }: CreateExecutorOptions) {
  const executeRequest = deps?.executeRequest ?? defaultExecuteRequest
  const extractError = deps?.extractError ?? extractErrorCode

  return async function execute(params: ExecuteLlmParams): Promise<ExecuteLlmResult> {
    const { sessionCode, ...payload } = params
    try {
      const response = await executeRequest(sessionCode, payload)

      actions.markCompleted(sanitizeSessionLlmResult(response.llm_result.raw), {
        llm_messages: response.messages,
        completed_at: response.llm_result.generated_at,
      })
      toast.success(SUCCESS_MESSAGE)
      return { status: 'success', response }
    } catch (error) {
      const maybeAxios = error as MaybeAxiosError | undefined
      if (maybeAxios?.isAxiosError) {
        const status = maybeAxios.response?.status
        if ((status && RETRYABLE_GATEWAY_STATUS.has(status)) || (!status && maybeAxios.code && RETRYABLE_ERROR_CODES.has(maybeAxios.code))) {
          return { status: 'retryable_error', error }
        }
      }

      const definition = extractError(error)
      if (!definition) {
        toast.error(GENERIC_ERROR_MESSAGE)
        return { status: 'unknown_error', error }
      }

      switch (definition.code) {
        case CODE_NO_ANSWERS: {
          toast.warning(definition.uiMessage || GENERIC_ERROR_MESSAGE)
          return { status: 'no_answers', errorCode: definition }
        }
        case CODE_SESSION_NOT_FOUND: {
          toast.error(definition.uiMessage || GENERIC_ERROR_MESSAGE)
          return { status: 'session_not_found', errorCode: definition }
        }
        case CODE_SYSTEM_PROMPT_MISSING:
        case CODE_LLM_OP_INCOMPLETE:
        case CODE_VERSION_FROZEN: {
          toast.error(definition.uiMessage || GENERIC_ERROR_MESSAGE)
          return { status: 'configuration_error', errorCode: definition }
        }
        case CODE_LLM_FAILED: {
          toast.error(definition.uiMessage || GENERIC_ERROR_MESSAGE)
          return { status: 'llm_failed', errorCode: definition }
        }
        default: {
          toast.error(definition.uiMessage || GENERIC_ERROR_MESSAGE)
          return { status: 'unknown_error', error, errorCode: definition }
        }
      }
    }
  }
}

export type LlmExecutor = ReturnType<typeof createLlmExecutor>
