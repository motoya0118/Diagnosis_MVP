import type { NextApiRequest, NextApiResponse } from 'next'
import { getToken, decode } from 'next-auth/jwt'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Safety: disable in production unless explicitly allowed
  if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_DEBUG_SESSION !== '1') {
    return res.status(404).end()
  }

  const defaultSecret = process.env.NEXTAUTH_SECRET
  if (!defaultSecret) return res.status(500).json({ detail: 'NEXTAUTH_SECRET is not set' })

  // Gather secrets to try: env first, then any provided via query (?secrets=a,b or ?altSecret=x)
  const querySecrets: string[] = []
  const qs = req.query.secrets
  if (typeof qs === 'string' && qs.trim().length > 0) {
    querySecrets.push(
      ...qs
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    )
  } else if (Array.isArray(qs)) {
    querySecrets.push(...qs.filter((s): s is string => typeof s === 'string' && s.trim().length > 0))
  }
  const alt = req.query.altSecret
  if (typeof alt === 'string' && alt.trim().length > 0) querySecrets.push(alt.trim())

  // Prefer cookie token, but allow explicit ?token= override
  const explicitToken = typeof req.query.token === 'string' ? req.query.token : undefined

  // Known NextAuth session cookie names
  const cookieCandidates = [
    '__Secure-next-auth.session-token',
    'next-auth.session-token',
  ]
  const cookieValuesChecked: Record<string, string | undefined> = {}
  for (const name of cookieCandidates) cookieValuesChecked[name] = req.cookies?.[name]

  const cookieToken = cookieCandidates.map((n) => req.cookies?.[n]).find((v) => !!v)
  const token = explicitToken ?? cookieToken

  // Flag to include sensitive values (token/secrets) in response for deep debugging
  const includeValues = req.query.includeValues === '1'

  if (!token) {
    return res.status(200).json({
      detail: 'no token',
      source: explicitToken ? 'query' : 'cookie',
      cookiesChecked: Object.keys(cookieValuesChecked),
    })
  }

  // Helper to mask secrets/token for safer display
  const mask = (v?: string) => {
    if (!v) return v
    if (includeValues) return v
    if (v.length <= 8) return `${v.slice(0, 2)}***${v.slice(-2)}`
    return `${v.slice(0, 4)}***${v.slice(-4)}`
  }

  // Build attempts list
  const secretsToTry: { label: string; value: string }[] = [
    { label: 'env:NEXTAUTH_SECRET', value: defaultSecret },
    ...querySecrets.map((s, i) => ({ label: `query:${i + 1}`, value: s })),
  ]

  const attempts: Array<{
    secretLabel: string
    ok: boolean
    payload?: unknown
    error?: string
  }> = []

  for (const s of secretsToTry) {
    try {
      const payload = await decode({ token, secret: s.value })
      if (payload) {
        attempts.push({ secretLabel: s.label, ok: true, payload })
      } else {
        attempts.push({ secretLabel: s.label, ok: false, error: 'decode returned null' })
      }
    } catch (e: any) {
      attempts.push({ secretLabel: s.label, ok: false, error: e?.message || String(e) })
    }
  }

  // Additionally, show the default behavior of getToken (reads from cookie) with env secret
  let getTokenResult: any = null
  try {
    getTokenResult = await getToken({ req, secret: defaultSecret })
  } catch (e: any) {
    getTokenResult = { error: e?.message || String(e) }
  }

  return res.status(200).json({
    note: 'Debug view of decoding the session token with different secrets',
    mode: includeValues ? 'verbose' : 'masked',
    source: explicitToken ? 'query' : 'cookie',
    token: mask(token),
    cookiesChecked: Object.keys(cookieValuesChecked),
    attempts,
    getTokenWithEnv: getTokenResult ?? null,
  })
}
