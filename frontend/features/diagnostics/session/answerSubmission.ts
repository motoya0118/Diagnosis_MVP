import { extractErrorCode, submitSessionAnswers } from '../../../lib/backend'
import type { ErrorCodeDefinition } from '../../../lib/error-codes'
import type { ToastPayload } from '../../../app/providers/feedback_provider'
import type { DiagnosticSessionActions } from './context'
import { computeVersionOptionsHash, type ComputeVersionOptionsHash } from './hash'

type ToastLike = {
  success(message: string, payload?: ToastPayload): unknown
  error(message: string, payload?: ToastPayload): unknown
  warning(message: string, payload?: ToastPayload): unknown
  info(message: string, payload?: ToastPayload): unknown
}

export type SubmitAnswersParams = {
  sessionCode: string
  versionId: number
  optionIds: readonly number[]
  answeredAt?: string | Date | null
}

export type SubmitAnswersSuccessResult = {
  status: 'success'
  versionOptionsHash: string
  submittedAt: string
}

export type SubmitAnswersInvalidPayloadResult = {
  status: 'invalid_payload'
  errorCode: ErrorCodeDefinition
}

export type SubmitAnswersOptionMismatchResult = {
  status: 'option_out_of_version'
  errorCode: ErrorCodeDefinition
}

export type SubmitAnswersSessionMissingResult = {
  status: 'session_not_found'
  errorCode: ErrorCodeDefinition
}

export type SubmitAnswersDuplicateResult = {
  status: 'duplicate_answer'
  errorCode: ErrorCodeDefinition
}

export type SubmitAnswersUnknownErrorResult = {
  status: 'unknown_error'
  error: unknown
  errorCode?: ErrorCodeDefinition
}

export type SubmitAnswersResult =
  | SubmitAnswersSuccessResult
  | SubmitAnswersInvalidPayloadResult
  | SubmitAnswersOptionMismatchResult
  | SubmitAnswersSessionMissingResult
  | SubmitAnswersDuplicateResult
  | SubmitAnswersUnknownErrorResult

type SubmitRequest = typeof submitSessionAnswers

type SubmitAnswerDependencies = {
  submitRequest?: SubmitRequest
  computeHash?: ComputeVersionOptionsHash
  extractError?: typeof extractErrorCode
  now?: () => Date
}

type CreateSubmitterOptions = {
  actions: DiagnosticSessionActions
  toast: ToastLike
  deps?: SubmitAnswerDependencies
}

const SUCCESS_MESSAGE = '回答を送信しました'
const UNKNOWN_ERROR_MESSAGE = '回答の送信に失敗しました。時間をおいて再度お試しください。'

const CODE_INVALID_PAYLOAD = 'E021'
const CODE_OPTION_OUT_OF_VERSION = 'E022'
const CODE_SESSION_NOT_FOUND = 'E040'
const CODE_DUPLICATE_ANSWER = 'E041'

const normaliseAnsweredAt = (value: SubmitAnswersParams['answeredAt']): string | undefined => {
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'string') {
    return value
  }
  return undefined
}

const timestampNow = () => new Date()

export function createAnswerSubmitter({ actions, toast, deps }: CreateSubmitterOptions) {
  const submitRequest = deps?.submitRequest ?? submitSessionAnswers
  const computeHash = deps?.computeHash ?? computeVersionOptionsHash
  const extractError = deps?.extractError ?? extractErrorCode
  const resolveNow = deps?.now ?? timestampNow

  return async function submitAnswers(params: SubmitAnswersParams): Promise<SubmitAnswersResult> {
    const optionIds = [...params.optionIds]
    const answeredAtIso = normaliseAnsweredAt(params.answeredAt)

    try {
      await submitRequest(params.sessionCode, {
        version_option_ids: optionIds,
        answered_at: answeredAtIso,
      })

      const hash = await computeHash(params.versionId, optionIds)
      const submittedAt = answeredAtIso ?? resolveNow().toISOString()
      actions.markAwaitingLlm({
        version_options_hash: hash,
      })

      toast.success(SUCCESS_MESSAGE)
      return { status: 'success', versionOptionsHash: hash, submittedAt }
    } catch (error) {
      const definition = extractError(error)
      if (!definition) {
        toast.error(UNKNOWN_ERROR_MESSAGE)
        return { status: 'unknown_error', error }
      }

      switch (definition.code) {
        case CODE_INVALID_PAYLOAD: {
          toast.error(definition.uiMessage)
          return { status: 'invalid_payload', errorCode: definition }
        }
        case CODE_OPTION_OUT_OF_VERSION: {
          toast.warning(definition.uiMessage)
          return { status: 'option_out_of_version', errorCode: definition }
        }
        case CODE_SESSION_NOT_FOUND: {
          toast.error(definition.uiMessage)
          return { status: 'session_not_found', errorCode: definition }
        }
        case CODE_DUPLICATE_ANSWER: {
          toast.info(definition.uiMessage)
          let versionHash: string | undefined
          try {
            versionHash = await computeHash(params.versionId, optionIds)
          } catch (hashError) {
            console.error("Failed to compute version options hash after duplicate answer submission", hashError)
          }
          actions.markAwaitingLlm({
            ...(versionHash !== undefined ? { version_options_hash: versionHash } : {}),
            preserveExistingResult: true,
          })
          return { status: 'duplicate_answer', errorCode: definition }
        }
        default: {
          toast.error(definition.uiMessage || UNKNOWN_ERROR_MESSAGE)
          return { status: 'unknown_error', error, errorCode: definition }
        }
      }
    }
  }
}

export type AnswerSubmitter = ReturnType<typeof createAnswerSubmitter>
