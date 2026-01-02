"use client";

import { useSession, signOut, signIn } from "next-auth/react";
import Link from "next/link";

export default function MyPage() {
  const { data: session, status } = useSession();

  return (
    <main>
      <div className="container">
        <div className="card login-card">
          <h1 className="login-title">My Page</h1>
          <p className="small">
            <a href="/api/debug/session" className="link-accent">Debug session</a>
          </p>

          {status === 'loading' ? (
            <p className="small">Loading...</p>
          ) : session ? (
            <div className="login-grid">
              <p className="subtitle">Signed in as {session.user?.email || session.user?.name}</p>
              <pre className="mypage-pre">
{JSON.stringify(session, null, 2)}
              </pre>
              <div className="login-actions">
                <button className="btn secondary" onClick={() => signOut()}>Sign out</button>
                <Link className="btn" href="/sessions">Session tools</Link>
              </div>
            </div>
          ) : (
            <div className="login-grid">
              <p className="subtitle">Not signed in</p>
              <div className="login-actions">
                <Link className="btn" href="/login">Sign in</Link>
                <Link className="btn secondary" href="/register">Register</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
