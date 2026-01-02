"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { resolveUiError } from "../../../lib/error-codes";
import { useSessionLinker } from "../../../features/diagnostics/session/useSessionLinker";

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { linkPendingSessions } = useSessionLinker();
  const linkTriggeredRef = useRef(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sp = new URLSearchParams(window.location.search);
    const encoded = sp.get('error');
    if (encoded) {
      const raw = decodeURIComponent(encoded);
      const decoded = raw.replace(/^Error:\s*/, '');
      const resolved = resolveUiError(decoded);
      if (resolved) {
        setError(resolved.uiMessage);
        setErrorAction(resolved.action);
      } else {
        setError(decoded);
        setErrorAction(null);
      }
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      linkTriggeredRef.current = false;
      return;
    }
    if (linkTriggeredRef.current) return;
    linkTriggeredRef.current = true;
    void linkPendingSessions();
  }, [linkPendingSessions, status]);

  const setDeviceCookies = () => {
    if (typeof window === "undefined") return "";
    const key = "device_id";
    let id: string = localStorage.getItem(key) || "";
    if (!id) {
      const gen = (typeof crypto !== "undefined" && (crypto as any).randomUUID?.()) || Math.random().toString(36).slice(2);
      id = String(gen);
      localStorage.setItem(key, id);
    }
    if (typeof document !== "undefined") {
      document.cookie = `device_id=${id}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
      document.cookie = `remember_me=${remember ? "1" : "0"}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    }
    return id;
  };

  const onSubmitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setErrorAction(null);
    const device_id = setDeviceCookies();
    const res = await signIn("credentials", {
      email,
      password,
      device_id,
      remember_me: remember ? "1" : "0",
      redirect: false,
    });
    if (res?.error) {
      const normalized = res.error.replace(/^Error:\s*/, '');
      const resolved = resolveUiError(normalized);
      if (resolved) {
        setError(resolved.uiMessage);
        setErrorAction(resolved.action);
      } else if (normalized === "CredentialsSignin") {
        setError("メールアドレスまたはパスワードが正しくありません");
        setErrorAction(null);
      } else {
        setError(normalized);
        setErrorAction(null);
      }
      setSubmitting(false);
    } else {
      router.push("/mypage");
    }
  };

  const isLoading = !hydrated || status === "loading";

  return (
    <main>
      <div className="container">
        <div className="card login-card">
          <h1 className="login-title">Sign in</h1>

          {isLoading ? (
            <p className="small">Loading...</p>
          ) : session ? (
            <div className="login-grid">
              <p className="subtitle">Signed in as {session.user?.email || session.user?.name}</p>
              <div className="login-actions">
                <button className="btn" onClick={() => router.push("/mypage")}>My Pageへ</button>
                <button className="btn secondary" onClick={() => signOut()}>Sign out</button>
              </div>
            </div>
          ) : (
            <div>
              {error && (
                <div className="small login-alert">
                  <p>{error}</p>
                  {errorAction && <p>{errorAction}</p>}
                </div>
              )}

              <form onSubmit={onSubmitCredentials} className="login-form">
                <div className="login-field">
                  <label htmlFor="email" className="small">Email</label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="form-input"
                  />
                </div>
                <div className="login-field">
                  <label htmlFor="password" className="small">Password</label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="form-input"
                  />
                </div>

                <label className="small login-check">
                  <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                  <span>Remember me</span>
                </label>

                <button type="submit" className="btn" disabled={submitting}>
                  {submitting ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <div className="login-actions">
                <button
                  className="btn"
                  onClick={() => {
                    setDeviceCookies();
                    signIn("github", { callbackUrl: "/mypage" });
                  }}
                >
                  Sign in with GitHub
                </button>

                <button className="btn secondary" onClick={() => router.push("/register")}>
                  Register
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
