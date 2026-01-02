"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

import { resolveAdminError } from "../lib/apiClient";
import { useAdminLayout } from "./providers";

export default function LoginPage() {
  const router = useRouter();
  const { setHeaderVisible, resetHeaderConfig } = useAdminLayout();
  const { status } = useSession();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);

  useEffect(() => {
    setHeaderVisible(false);
    resetHeaderConfig();

    return () => {
      setHeaderVisible(true);
    };
  }, [resetHeaderConfig, setHeaderVisible]);

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [router, status]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setErrorAction(null);

    try {
      const result = await signIn("credentials", {
        redirect: false,
        userId,
        password,
      });

      if (result?.error) {
        const normalized = result.error.replace(/^Error:\s*/, "");
        const resolved = resolveAdminError(normalized);
        if (resolved) {
          setError(resolved.message);
          setErrorAction(resolved.action);
        } else if (normalized === "CredentialsSignin") {
          setError("ユーザーIDまたはパスワードが正しくありません");
          setErrorAction(null);
        } else if (normalized === "Failed to fetch") {
          setError("ネットワークエラーが発生しました");
          setErrorAction(null);
        } else if (normalized.startsWith("HTTP_")) {
          setError("ログインに失敗しました");
          setErrorAction(null);
        } else {
          setError(normalized);
          setErrorAction(null);
        }
        return;
      }

      setPassword("");
      router.push("/dashboard");
    } catch (err) {
      if (err instanceof Error && err.message === "Failed to fetch") {
        setError("ネットワークエラーが発生しました");
        setErrorAction(null);
      } else if (err instanceof Error && err.message) {
        const resolved = resolveAdminError(err.message);
        if (resolved) {
          setError(resolved.message);
          setErrorAction(resolved.action);
        } else {
          setError(err.message);
          setErrorAction(null);
        }
      } else {
        setError("ログインに失敗しました");
        setErrorAction(null);
      }
    } finally {
      setLoading(false);
    }
  };

  if (status === "authenticated") {
    return null;
  }

  return (
    <div className="auth-screen">
      <section className="card card--compact" aria-label="admin-login">
        <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>Admin Console Login</h1>
        <p style={{ marginBottom: "2rem", color: "#52606d" }}>
          管理者アカウントでサインインしてください。
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }} suppressHydrationWarning>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>ユーザーID</span>
            <input
              type="text"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              autoComplete="username"
              required
              disabled={loading}
              style={{
                padding: "0.75rem",
                borderRadius: "0.75rem",
                border: "1px solid #cbd2d9",
              }}
              suppressHydrationWarning
            />
          </label>
          <label style={{ display: "grid", gap: "0.35rem" }}>
            <span style={{ fontWeight: 600 }}>パスワード</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
              style={{
                padding: "0.75rem",
                borderRadius: "0.75rem",
                border: "1px solid #cbd2d9",
              }}
              suppressHydrationWarning
            />
          </label>
          {error ? (
            <div role="alert" style={{ color: "#b42318", fontSize: "0.95rem" }}>
              <p>{error}</p>
              {errorAction && <p>{errorAction}</p>}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "0.85rem 1.2rem",
              borderRadius: "9999px",
              border: "none",
              background: loading ? "#94a3b8" : "#2563eb",
              color: "white",
              fontWeight: 600,
              transition: "filter 0.2s ease",
            }}
            suppressHydrationWarning
          >
            {loading ? "認証中..." : "ログイン"}
          </button>
        </form>
      </section>
    </div>
  );
}
