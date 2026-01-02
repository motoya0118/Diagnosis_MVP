import axios, { AxiosError } from 'axios'

import { ErrorCodeDefinition, getErrorDefinition, isErrorWithCode } from './error-codes'
import { ensureDeviceId } from './device-id'

const isServer = typeof window === 'undefined'

const resolveBaseURL = () => {
  if (isServer) {
    const internalBase =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      undefined

    if (!internalBase) {
      if (process.env.NODE_ENV !== 'development' && process.env.NODE_ENV !== 'test') {
        throw new Error('BACKEND_INTERNAL_URL (or NEXT_PUBLIC_BACKEND_URL) must be set on the server runtime')
      }
      return 'http://localhost:8000'
    }
    return internalBase
  }

  return '/api/diagnostics'
}

const baseURL = resolveBaseURL()

const backend = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
})

export { backend }

// Attach X-Device-Id header on browser requests
if (typeof window !== 'undefined') {
  backend.interceptors.request.use((config) => {
    const did = ensureDeviceId()
    if (did) {
      config.headers = config.headers || {}
      ;(config.headers as any)['X-Device-Id'] = did
    }
    return config
  })
}

export type ApiErrorWithCode = AxiosError<{ error?: { code?: string } }> & {
  errorCodeValue?: string
  errorCode?: ErrorCodeDefinition
}

backend.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error)) {
      const payload = error.response?.data
      if (isErrorWithCode(payload)) {
        const code = payload.error.code
        const definition = getErrorDefinition(code)
        ;(error as ApiErrorWithCode).errorCodeValue = code
        if (definition) {
          ;(error as ApiErrorWithCode).errorCode = definition
        }
      }
    }
    return Promise.reject(error)
  },
)

export function extractErrorCode(error: unknown): ErrorCodeDefinition | undefined {
  if (!axios.isAxiosError(error)) return undefined
  const enhanced = error as ApiErrorWithCode
  if (enhanced.errorCode) return enhanced.errorCode
  const payload = enhanced.response?.data
  if (isErrorWithCode(payload)) {
    return getErrorDefinition(payload.error.code)
  }
  return undefined
}

export async function loginWithCredentials(email: string, password: string, device_id?: string, remember_me: boolean = true) {
  const res = await backend.post('/auth/login', { email, password, device_id: device_id || ensureDeviceId(), remember_me })
  return res.data as { access_token: string; refresh_token: string; token_type: string; expires_in?: number }
}

export async function register(email: string, password: string, remember_me: boolean = true, device_id?: string) {
  const res = await backend.post('/auth/register', { email, password, remember_me, device_id: device_id || ensureDeviceId() })
  return res.data as { access_token: string; refresh_token: string; token_type: string; expires_in?: number }
}

export async function exchangeGithub(code?: string, access_token?: string, device_id?: string, remember_me: boolean = true) {
  const res = await backend.post('/auth/oauth/github', { code, access_token, device_id: device_id || ensureDeviceId(), remember_me })
  return res.data as { access_token: string; refresh_token: string; token_type: string; expires_in?: number }
}

export async function refreshToken(refresh_token: string, device_id?: string) {
  const res = await backend.post('/auth/refresh', { refresh_token, device_id: device_id || ensureDeviceId() })
  return res.data as { access_token: string; refresh_token: string; token_type: string; expires_in?: number }
}

export async function logout(refresh_token: string, device_id?: string) {
  try {
    await backend.post('/auth/logout', { refresh_token, device_id: device_id || ensureDeviceId() })
  } catch (e) {
    // No-op on failures to keep sign-out idempotent from client view
  }
}

type SubmitSessionAnswersBody = {
  version_option_ids: readonly number[]
  answered_at?: string | null
}

type SubmitSessionAnswersPayload = {
  version_option_ids: readonly number[]
  answered_at?: string | Date | null
}

function normaliseSubmitPayload(payload: SubmitSessionAnswersPayload): SubmitSessionAnswersBody {
  const body: SubmitSessionAnswersBody = {
    version_option_ids: payload.version_option_ids.map((id) => Number(id)),
  }

  if (payload.answered_at instanceof Date) {
    body.answered_at = payload.answered_at.toISOString()
  } else if (typeof payload.answered_at === 'string') {
    body.answered_at = payload.answered_at
  } else if (payload.answered_at) {
    body.answered_at = String(payload.answered_at)
  }

  return body
}

export async function submitSessionAnswers(sessionCode: string, payload: SubmitSessionAnswersPayload): Promise<void> {
  const normalised = normaliseSubmitPayload(payload)
  await backend.post(`/sessions/${encodeURIComponent(sessionCode)}/answers`, normalised)
}

export type ExecuteSessionLlmPayload = {
  model?: string | null
  temperature?: number | null
  top_p?: number | null
  force_regenerate?: boolean | null
}

export type LlmResponseMessage = {
  role: 'system' | 'user'
  content: string
}

export type ExecuteSessionLlmResponse = {
  session_code: string
  version_id: number
  model: string
  messages: LlmResponseMessage[]
  llm_result: {
    raw: unknown
    generated_at: string
  }
}

export async function executeSessionLlm(sessionCode: string, payload?: ExecuteSessionLlmPayload): Promise<ExecuteSessionLlmResponse> {
  const body: Record<string, unknown> = {}
  if (payload) {
    if (payload.model !== undefined) body.model = payload.model
    if (payload.temperature !== undefined) body.temperature = payload.temperature
    if (payload.top_p !== undefined) body.top_p = payload.top_p
    if (payload.force_regenerate !== undefined) body.force_regenerate = payload.force_regenerate
  }
  const res = await backend.post(`/sessions/${encodeURIComponent(sessionCode)}/llm`, body)
  return res.data as ExecuteSessionLlmResponse
}

export type SessionOutcomeSnapshot = {
  outcome_id: number
  sort_order: number
  meta: Record<string, unknown> | null
}

export type GetSessionResponse = {
  version_id: number
  outcomes: SessionOutcomeSnapshot[]
  llm_result: {
    raw: unknown
    generated_at?: string | null
  } | null
}

export async function getSession(sessionCode: string): Promise<GetSessionResponse> {
  const res = await backend.get(`/sessions/${encodeURIComponent(sessionCode)}`)
  return res.data as GetSessionResponse
}

export type LinkSessionsResponse = {
  linked: string[]
  already_linked: string[]
}

export async function linkSessions(sessionCodes: readonly string[], accessToken: string): Promise<LinkSessionsResponse> {
  const res = await backend.post(
    '/auth/link-session',
    { session_codes: [...sessionCodes] },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  return res.data as LinkSessionsResponse
}
