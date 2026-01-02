"use client";

import { signIn } from 'next-auth/react'
import { useState } from 'react'

import { resolveUiError } from '../../../lib/error-codes'

export default function Register() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [errorAction, setErrorAction] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setErrorAction(null)
    if (password !== confirm) {
      setError('Passwords do not match')
      setErrorAction(null)
      return
    }
    setLoading(true)
    try {
      const device_id = (typeof window !== 'undefined') ? (localStorage.getItem('device_id') || '') : ''
      // Call Next.js API route to avoid CORS
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember_me: remember, device_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const code = data?.error?.code as string | undefined
        if (code) {
          const resolved = resolveUiError(code)
          if (resolved) {
            setError(resolved.uiMessage)
            setErrorAction(resolved.action)
          } else {
            setError(code)
            setErrorAction(null)
          }
        } else {
          setError(String(data?.detail || 'Registration failed'))
          setErrorAction(null)
        }
        return
      }
      if (typeof document !== 'undefined') {
        document.cookie = `remember_me=${remember ? '1' : '0'}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`
      }
      await signIn('credentials', { email, password, device_id, remember_me: remember ? '1' : '0', callbackUrl: '/mypage' })
    } catch (e: any) {
      const code = e?.response?.data?.error?.code as string | undefined
      if (code) {
        const resolved = resolveUiError(code)
        if (resolved) {
          setError(resolved.uiMessage)
          setErrorAction(resolved.action)
        } else {
          setError(code)
          setErrorAction(null)
        }
      } else {
        const msg = e?.response?.data?.detail || e?.message || 'Registration failed'
        setError(String(msg))
        setErrorAction(null)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <main>
      <div className="container">
        <div className="card login-card">
          <h1 className="login-title">Create an account</h1>
          <form onSubmit={onSubmit} className="login-form">
            <div className="login-field">
              <label className="small">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                required
                placeholder="you@example.com"
                className="form-input"
              />
            </div>
            <div className="login-field">
              <label className="small">Password</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                required
                placeholder="••••••••"
                className="form-input"
              />
            </div>
            <div className="login-field">
              <label className="small">Confirm Password</label>
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type="password"
                required
                placeholder="••••••••"
                className="form-input"
              />
            </div>
            {error && (
              <div className="small login-alert">
                <p>{error}</p>
                {errorAction && <p>{errorAction}</p>}
              </div>
            )}
            <label className="small login-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me
            </label>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? 'Signing up...' : 'Sign up'}
            </button>
          </form>

          <p className="small" style={{ marginTop: 8 }}>
            Already have an account? <a href="/login">Sign in</a>
          </p>
        </div>
      </div>
    </main>
  )
}
