import { createAnswerSubmitter, type SubmitAnswersParams } from '../../../features/diagnostics/session/answerSubmission'
import type { SubmitAnswersResult } from '../../../features/diagnostics/session/answerSubmission'
import type { DiagnosticSessionActions } from '../../../features/diagnostics/session'
import type { ErrorCodeDefinition } from '../../../lib/error-codes'

type ToastMock = {
  success: jest.Mock
  error: jest.Mock
  warning: jest.Mock
  info: jest.Mock
}

const createActions = (): DiagnosticSessionActions => ({
  setSessionState: jest.fn(),
  upsertChoice: jest.fn(),
  removeChoice: jest.fn(),
  markAwaitingLlm: jest.fn(),
  markCompleted: jest.fn(),
  resetSession: jest.fn(),
})

const createToast = (): ToastMock => ({
  success: jest.fn(),
  error: jest.fn(),
  warning: jest.fn(),
  info: jest.fn(),
})

const definition = (code: string, uiMessage: string): ErrorCodeDefinition => ({
  code,
  domain: 'diagnostics',
  name: 'TEST',
  uiMessage,
  action: null,
})

describe('createAnswerSubmitter', () => {
  let actions: DiagnosticSessionActions
  let toast: ToastMock

  beforeEach(() => {
    actions = createActions()
    toast = createToast()
  })

  it('submits answers and marks the session as awaiting LLM completion', async () => {
    const submitRequest = jest.fn<Promise<void>, [string, { version_option_ids: readonly number[]; answered_at?: string }]>(
      async () => {}
    )
    const computeHash = jest.fn<Promise<string>, [number, readonly number[]]>().mockResolvedValue('hash123')
    const now = jest.fn(() => new Date('2024-09-19T02:10:00Z'))

    const submitter = createAnswerSubmitter({
      actions,
      toast,
      deps: { submitRequest, computeHash, now },
    })

    const params: SubmitAnswersParams = {
      sessionCode: 'SESSION',
      versionId: 42,
      optionIds: [5, 3],
      answeredAt: '2024-09-19T02:05:00Z',
    }

    const result = (await submitter(params)) as SubmitAnswersResult

    expect(submitRequest).toHaveBeenCalledWith('SESSION', {
      version_option_ids: [5, 3],
      answered_at: '2024-09-19T02:05:00Z',
    })
    expect(computeHash).toHaveBeenCalledWith(42, [5, 3])
    expect(actions.markAwaitingLlm).toHaveBeenCalledWith({
      version_options_hash: 'hash123',
    })
    expect(toast.success).toHaveBeenCalledWith('回答を送信しました')
    expect(result).toEqual({ status: 'success', versionOptionsHash: 'hash123', submittedAt: '2024-09-19T02:05:00Z' })
  })

  it('marks the session as awaiting when the answer payload was already recorded', async () => {
    const submitRequest = jest.fn().mockRejectedValue(new Error('duplicate'))
    const def = definition('E041', 'すでに回答が送信されています')
    const extractError = jest.fn().mockReturnValue(def)
    const computeHash = jest.fn<Promise<string>, [number, readonly number[]]>().mockResolvedValue('hash999')

    const submitter = createAnswerSubmitter({
      actions,
      toast,
      deps: { submitRequest, extractError, computeHash },
    })

    const result = await submitter({ sessionCode: 'SESSION', versionId: 7, optionIds: [9, 3], answeredAt: null })

    expect(submitRequest).toHaveBeenCalledWith('SESSION', {
      version_option_ids: [9, 3],
      answered_at: undefined,
    })
    expect(computeHash).toHaveBeenCalledWith(7, [9, 3])
    expect(actions.markAwaitingLlm).toHaveBeenCalledWith({
      version_options_hash: 'hash999',
      preserveExistingResult: true,
    })
    expect(toast.info).toHaveBeenCalledWith('すでに回答が送信されています')
    expect(result).toEqual({ status: 'duplicate_answer', errorCode: def })
  })

  it('returns option out of version errors and warns the user', async () => {
    const error = new Error('out-of-version')
    const submitRequest = jest.fn().mockRejectedValue(error)
    const def = definition('E022', 'フォームを再取得してください')
    const extractError = jest.fn().mockReturnValue(def)

    const submitter = createAnswerSubmitter({
      actions,
      toast,
      deps: { submitRequest, extractError },
    })

    const result = await submitter({ sessionCode: 'SESSION', versionId: 7, optionIds: [1], answeredAt: null })

    expect(submitRequest).toHaveBeenCalled()
    expect(actions.markAwaitingLlm).not.toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('フォームを再取得してください')
    expect(result).toEqual({ status: 'option_out_of_version', errorCode: def })
  })

  it('handles unknown errors with a generic message', async () => {
    const error = new Error('network failure')
    const submitRequest = jest.fn().mockRejectedValue(error)
    const extractError = jest.fn().mockReturnValue(undefined)

    const submitter = createAnswerSubmitter({
      actions,
      toast,
      deps: { submitRequest, extractError },
    })

    const result = await submitter({ sessionCode: 'SESSION', versionId: 3, optionIds: [4], answeredAt: null })

    expect(toast.error).toHaveBeenCalledWith('回答の送信に失敗しました。時間をおいて再度お試しください。')
    expect(result).toEqual({ status: 'unknown_error', error })
    expect(actions.markAwaitingLlm).not.toHaveBeenCalled()
  })
})
