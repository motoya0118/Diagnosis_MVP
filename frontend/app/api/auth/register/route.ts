import { NextResponse } from 'next/server'
import { register as backendRegister, extractErrorCode } from '../../../../lib/backend'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body?.email || '')
    const password = String(body?.password || '')
    const remember_me = body?.remember_me !== undefined ? Boolean(body.remember_me) : true
    const device_id = typeof body?.device_id === 'string' ? body.device_id : undefined

    if (!email || !password) {
      return NextResponse.json({ detail: 'email and password are required' }, { status: 400 })
    }

    const data = await backendRegister(email, password, remember_me, device_id)
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    const definition = extractErrorCode(e)
    const status = e?.response?.status || 400
    if (definition) {
      return NextResponse.json({ ok: false, error: { code: definition.code } }, { status })
    }
    const msg = e?.response?.data?.detail || e?.message || 'Registration failed'
    return NextResponse.json({ ok: false, detail: String(msg) }, { status })
  }
}
