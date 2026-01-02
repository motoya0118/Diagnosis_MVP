const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

export async function GET() {
  try {
    const r = await fetch(`${BACKEND_URL}/master/versions`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`backend ${r.status}`)
    const body = await r.text()
    return new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Master-Source': 'api',
      },
    })
  } catch (e) {
    return new Response(JSON.stringify({}), { status: 200, headers: { 'X-Master-Source': 'static' } })
  }
}

