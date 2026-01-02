import { createLlmExecutor } from '../../../features/diagnostics/session/llmExecution'
import type { DiagnosticSessionActions } from '../../../features/diagnostics/session'
import type { ExecuteSessionLlmPayload, ExecuteSessionLlmResponse } from '../../../lib/backend'
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

const RAW_RESULT_JSON = `
{
  "1": {
    "name": "AIエンジニア",
    "total_match": { "score": 92.4, "reason": "技術スキルが高い" },
    "personality_match": { "score": 88.5, "reason": "挑戦志向が強い" },
    "work_match": { "score": 75.0, "reason": "実務経験が豊富" }
  },
  "2": {
    "name": "データサイエンティスト",
    "total_match": { "score": 81.1, "reason": "分析志向が強い" },
    "personality_match": { "score": 79.9, "reason": "粘り強い" },
    "work_match": { "score": 68.2, "reason": "実務経験がある" }
  }
}
`.trim()

const EXPECTED_SANITISED_RESULT = {
  '1': {
    name: 'AIエンジニア',
    total_match: { score: 92.4, reason: '技術スキルが高い' },
    personality_match: { score: 88.5, reason: '挑戦志向が強い' },
    work_match: { score: 75, reason: '実務経験が豊富' },
  },
  '2': {
    name: 'データサイエンティスト',
    total_match: { score: 81.1, reason: '分析志向が強い' },
    personality_match: { score: 79.9, reason: '粘り強い' },
    work_match: { score: 68.2, reason: '実務経験がある' },
  },
} as const

const createResponse = (): ExecuteSessionLlmResponse => ({
  session_code: 'SESS',
  version_id: 1,
  model: 'anthropic.claude-3-sonnet-20240229-v1:0',
  messages: [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: 'payload' },
  ],
  llm_result: {
    raw: {
      content: [
        {
          type: 'text',
          text: `診断結果は以下です。\n\`\`\`json\n${RAW_RESULT_JSON}\n\`\`\`\n追加メモ`,
        },
      ],
    },
    generated_at: '2024-09-20T00:00:00Z',
  },
})

const definition = (code: string, uiMessage: string): ErrorCodeDefinition => ({
  code,
  domain: 'diagnostics',
  name: 'TEST',
  uiMessage,
  action: null,
})

describe('createLlmExecutor', () => {
  let actions: DiagnosticSessionActions
  let toast: ToastMock

  beforeEach(() => {
    actions = createActions()
    toast = createToast()
  })

  it('executes LLM and marks completion on success', async () => {
    const response = createResponse()
    const executeRequest = jest
      .fn<Promise<ExecuteSessionLlmResponse>, [string, ExecuteSessionLlmPayload | undefined]>()
      .mockResolvedValue(response)

    const executor = createLlmExecutor({
      actions,
      toast,
      deps: { executeRequest },
    })

    const result = await executor({ sessionCode: 'SESS' })

    expect(executeRequest).toHaveBeenCalledWith('SESS', {})
    expect(actions.markCompleted).toHaveBeenCalledWith(EXPECTED_SANITISED_RESULT, {
      llm_messages: response.messages,
      completed_at: response.llm_result.generated_at,
    })
    expect(toast.success).toHaveBeenCalledWith('診断結果を生成しました')
    expect(result).toEqual({ status: 'success', response })
  })

  it('treats gateway timeout responses as retryable without surfacing toasts', async () => {
    const executeRequest = jest.fn().mockRejectedValue({
      isAxiosError: true,
      response: { status: 504 },
    })

    const executor = createLlmExecutor({
      actions,
      toast,
      deps: { executeRequest },
    })

    const result = await executor({ sessionCode: 'SESS' })

    expect(result).toEqual({ status: 'retryable_error', error: expect.any(Object) })
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('handles no answers error gracefully', async () => {
    const executeRequest = jest.fn().mockRejectedValue(new Error('no answers'))
    const errorDef = definition('E045', '回答が不足しています')
    const extractError = jest.fn().mockReturnValue(errorDef)

    const executor = createLlmExecutor({
      actions,
      toast,
      deps: { executeRequest, extractError },
    })

    const result = await executor({ sessionCode: 'SESS' })

    expect(executeRequest).toHaveBeenCalled()
    expect(toast.warning).toHaveBeenCalledWith('回答が不足しています')
    expect(result).toEqual({ status: 'no_answers', errorCode: errorDef })
    expect(actions.markCompleted).not.toHaveBeenCalled()
  })

  it('maps LLM failure errors to a retry suggestion', async () => {
    const executeRequest = jest.fn().mockRejectedValue(new Error('llm failed'))
    const errorDef = definition('E050', '再実行してください')
    const extractError = jest.fn().mockReturnValue(errorDef)

    const executor = createLlmExecutor({
      actions,
      toast,
      deps: { executeRequest, extractError },
    })

    const result = await executor({ sessionCode: 'SESS' })

    expect(toast.error).toHaveBeenCalledWith('再実行してください')
    expect(result).toEqual({ status: 'llm_failed', errorCode: errorDef })
  })

  it('falls back to generic error handling when the payload is unknown', async () => {
    const executeRequest = jest.fn().mockRejectedValue(new Error('network'))
    const extractError = jest.fn().mockReturnValue(undefined)

    const executor = createLlmExecutor({
      actions,
      toast,
      deps: { executeRequest, extractError },
    })

    const result = await executor({ sessionCode: 'SESS' })

    expect(toast.error).toHaveBeenCalledWith('診断結果の生成に失敗しました。時間をおいて再度お試しください。')
    expect(result.status).toBe('unknown_error')
  })
})
