"use client";

import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { resolveUiError } from '../../../lib/error-codes'

export default function Sessions() {
  const { data: session } = useSession()
  const [msg, setMsg] = useState<string>('')
  const [msgAction, setMsgAction] = useState<string | null>(null)

  async function logoutAll() {
    setMsg('')
    setMsgAction(null)
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000') + '/auth/logout_all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${(session as any)?.accessToken || ''}`,
        },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMsg(typeof data?.detail === 'string' ? data.detail : 'All sessions revoked')
      } else {
        const code = data?.error?.code as string | undefined
        if (code) {
          const resolved = resolveUiError(code)
          if (resolved) {
            setMsg(resolved.uiMessage)
            setMsgAction(resolved.action)
            return
          }
          setMsg(code)
          return
        }
        setMsg(data?.detail || 'Failed to revoke sessions')
      }
    } catch (e) {
      setMsg('Network error')
    }
  }

  return (
    <main>
      <div className="container">
        <div className="card login-card">
          <h1 className="login-title">Sessions</h1>
          <p className="subtitle">Revoke all your sessions on all devices.</p>
          <div className="login-actions">
            <button className="btn" onClick={logoutAll}>Logout all devices</button>
          </div>
          {msg && (
            <div className="small" style={{ marginTop: 12 }}>
              <p>{msg}</p>
              {msgAction && <p>{msgAction}</p>}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
