import { NextRequest } from 'next/server'
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

function isValidKey(key: string) {
  return /^mst_[A-Za-z0-9_]+$/.test(key)
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<Record<string, string | string[] | undefined>> }
) {
  const params = await ctx.params
  const keyRaw = params?.key
  const key = Array.isArray(keyRaw) ? keyRaw[0] : keyRaw

  if (typeof key !== 'string' || !isValidKey(key)) {
    return new Response(JSON.stringify({ error: 'invalid master key' }), { status: 403 })
  }

  const ifNoneMatch = req.headers.get('if-none-match') || undefined

  try {
    const url = `${BACKEND_URL}/master/${encodeURIComponent(key)}`
    const r = await fetch(url, {
      method: 'GET',
      headers: {
        ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
      },
      // Route Handlers are server-side; keep cache controlled by downstream
      cache: 'no-store',
    })

    if (r.status === 304) {
      return new Response(null, {
        status: 304,
        headers: {
          'X-Master-Source': 'api',
        },
      })
    }

    if (!r.ok) throw new Error(`backend ${r.status}`)

    const body = await r.text()
    const etag = r.headers.get('etag') || ''
    const cc = r.headers.get('cache-control') || 'public, max-age=60'
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: etag,
        'Cache-Control': cc,
        'X-Master-Source': 'api',
      },
    })
  } catch (e) {
    // Fallback to static
    const { STATIC_MASTERS } = await import('../../../../lib/data/staticMasters')
    const staticPayload = STATIC_MASTERS[key]
    if (!staticPayload) {
      return new Response(JSON.stringify({ error: 'master not available' }), { status: 503 })
    }
    return new Response(JSON.stringify(staticPayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ETag: `"${staticPayload.etag}"`,
        'Cache-Control': 'public, max-age=300, immutable',
        'X-Master-Source': 'static',
      },
    })
  }
}
