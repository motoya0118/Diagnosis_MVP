import { NextResponse } from 'next/server'
import { decode, getToken } from 'next-auth/jwt'

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== 'development' && process.env.ALLOW_DEBUG_SESSION !== '1') {
    return new NextResponse(null, { status: 404 })
  }

  const url = new URL(req.url)
  const defaultSecret = process.env.NEXTAUTH_SECRET
  if (!defaultSecret) return NextResponse.json({ detail: 'NEXTAUTH_SECRET is not set' }, { status: 500 })

  const querySecrets: string[] = []
  const qs = url.searchParams.get('secrets')
  if (qs) querySecrets.push(...qs.split(',').map((s) => s.trim()).filter(Boolean))
  const alt = url.searchParams.get('altSecret')
  if (alt) querySecrets.push(alt)

  const token = url.searchParams.get('token') || undefined
  const includeValues = url.searchParams.get('includeValues') === '1'

  const cookieHeader = req.headers.get('cookie') || ''
  const cookieCandidates = ['__Secure-next-auth.session-token', 'next-auth.session-token']
  const cookieToken = token || cookieCandidates.map((n) => matchCookie(cookieHeader, n)).find(Boolean) || undefined

  if (!cookieToken) {
    return NextResponse.json({ detail: 'no token', cookiesChecked: cookieCandidates }, { status: 200 })
  }

  const mask = (v?: string) => {
    if (!v) return v
    if (includeValues) return v
    if (v.length <= 8) return `${v.slice(0, 2)}***${v.slice(-2)}`
    return `${v.slice(0, 4)}***${v.slice(-4)}`
  }

  const secretsToTry: { label: string; value: string }[] = [
    { label: 'env:NEXTAUTH_SECRET', value: defaultSecret },
    ...querySecrets.map((s, i) => ({ label: `query:${i + 1}`, value: s })),
  ]

  const attempts: Array<{ secretLabel: string; ok: boolean; payload?: unknown; error?: string }> = []
  for (const s of secretsToTry) {
    try {
      const payload = await decode({ token: cookieToken, secret: s.value })
      if (payload) attempts.push({ secretLabel: s.label, ok: true, payload })
      else attempts.push({ secretLabel: s.label, ok: false, error: 'decode returned null' })
    } catch (e: any) {
      attempts.push({ secretLabel: s.label, ok: false, error: e?.message || String(e) })
    }
  }

  let getTokenResult: any = null
  try {
    getTokenResult = await getToken({ req: { headers: { cookie: cookieHeader } } as any, secret: defaultSecret })
  } catch (e: any) {
    getTokenResult = { error: e?.message || String(e) }
  }

  return NextResponse.json({
    note: 'Debug view of decoding the session token with different secrets',
    mode: includeValues ? 'verbose' : 'masked',
    token: mask(cookieToken),
    attempts,
    getTokenWithEnv: getTokenResult ?? null,
  })
}

function matchCookie(cookieHeader: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|; )${name}=([^;]+)`) ;
  const m = cookieHeader.match(re)
  return m ? decodeURIComponent(m[1]) : undefined
}

