import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { JWT } from "next-auth/jwt";

type AdminLoginResponse = {
  access_token: string;
  expires_in: number;
  issued_at?: string;
  refresh_token?: string | null;
};

type AdminJwtToken = JWT & {
  backendAccessToken?: string;
  backendTokenIssuedAt?: number;
  backendTokenExpiresAt?: number;
  adminUserId?: string;
  backendRefreshToken?: string;
  error?: string;
};

const backendBaseUrl =
  process.env.ADMIN_BACKEND_URL ??
  process.env.NEXT_PUBLIC_BACKEND_URL ??
  "http://localhost:8000";

/**
 * Resolve the NextAuth secret at runtime instead of build time.
 * Bracket notation prevents Next.js from inlining an empty string when
 * the environment variable is absent during `next build`.
 */
function resolveAuthSecret(): string | undefined {
  const secretFromEnv =
    process.env["NEXTAUTH_SECRET"] ||
    process.env["AUTH_SECRET"] ||
    process.env["ADMIN_NEXTAUTH_SECRET"];
  if (!secretFromEnv && process.env.NODE_ENV === "production") {
    console.error(
      "NEXTAUTH_SECRET (or AUTH_SECRET/ADMIN_NEXTAUTH_SECRET) must be set for production builds.",
    );
  }
  return secretFromEnv ?? undefined;
}

const authSecret = resolveAuthSecret();
const secureCookie = process.env.NODE_ENV === "production";
const cookiePrefix =
  (process.env.ADMIN_NEXTAUTH_COOKIE_PREFIX ?? "admin-next-auth").trim() || "admin-next-auth";
const sessionCookieName = `${cookiePrefix}.session-token`;
const callbackCookieName = `${cookiePrefix}.callback-url`;
const csrfCookieName = `${cookiePrefix}.csrf-token`;
const pkceCookieName = `${cookiePrefix}.pkce.code_verifier`;
const stateCookieName = `${cookiePrefix}.state`;
const nonceCookieName = `${cookiePrefix}.nonce`;

function resolveErrorCode(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { code?: string } }).error;
  if (error && typeof error.code === "string") {
    return error.code;
  }
  if (typeof (payload as { detail?: string }).detail === "string") {
    return (payload as { detail: string }).detail;
  }
  return null;
}

function parseIssuedAt(value?: string): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

async function login(userId: string, password: string): Promise<AdminLoginResponse> {
  const response = await fetch(`${backendBaseUrl}/admin_auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ user_id: userId, password, remember_me: true }),
    cache: "no-store",
  });

  if (!response.ok) {
    let errorCode: string | null = null;
    try {
      const payload = await response.json();
      errorCode = resolveErrorCode(payload);
    } catch {
      // ignore JSON parse failures
    }
    throw new Error(errorCode ?? `HTTP_${response.status}`);
  }

  return (await response.json()) as AdminLoginResponse;
}

async function refreshToken(token: AdminJwtToken): Promise<AdminJwtToken> {
  if (!token.backendRefreshToken) {
    return { ...token, error: "MissingBackendRefreshToken" };
  }

  try {
    const response = await fetch(`${backendBaseUrl}/admin_auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: token.backendRefreshToken }),
      cache: "no-store",
    });

    if (!response.ok) {
      let errorCode: string | null = null;
      try {
        const payload = await response.json();
        errorCode = resolveErrorCode(payload);
      } catch {
        // ignore
      }
      return {
        ...token,
        backendAccessToken: undefined,
        backendRefreshToken: undefined,
        backendTokenExpiresAt: undefined,
        backendTokenIssuedAt: undefined,
        error: errorCode ?? `HTTP_${response.status}`,
      };
    }

    const data = (await response.json()) as AdminLoginResponse;
    const issuedAtMs = parseIssuedAt(data.issued_at);
    const refreshValue = data.refresh_token ?? null;
    if (!refreshValue) {
      return {
        ...token,
        backendAccessToken: undefined,
        backendRefreshToken: undefined,
        backendTokenExpiresAt: undefined,
        backendTokenIssuedAt: undefined,
        error: "E11104",
      };
    }
    return {
      ...token,
      backendAccessToken: data.access_token,
      backendTokenIssuedAt: issuedAtMs,
      backendTokenExpiresAt: issuedAtMs + data.expires_in * 1000,
      backendRefreshToken: refreshValue,
      error: undefined,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message ? error.message : "FailedToRefreshToken";
    return {
      ...token,
      backendAccessToken: undefined,
      backendRefreshToken: undefined,
      backendTokenExpiresAt: undefined,
      backendTokenIssuedAt: undefined,
      error: message,
    };
  }
}

export const authOptions: NextAuthOptions = {
  secret: authSecret || undefined,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60, // 1 hour
    updateAge: 5 * 60,
  },
  // Use admin-specific cookie names to avoid conflicts with the public frontend (also NextAuth).
  cookies: {
    sessionToken: {
      name: secureCookie ? `__Secure-${sessionCookieName}` : sessionCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
    callbackUrl: {
      name: secureCookie ? `__Host-${callbackCookieName}` : callbackCookieName,
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
    csrfToken: {
      name: secureCookie ? `__Host-${csrfCookieName}` : csrfCookieName,
      options: {
        httpOnly: false,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
    pkceCodeVerifier: {
      name: secureCookie ? `__Host-${pkceCookieName}` : pkceCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
    state: {
      name: secureCookie ? `__Host-${stateCookieName}` : stateCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
    nonce: {
      name: secureCookie ? `__Host-${nonceCookieName}` : nonceCookieName,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: secureCookie,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        userId: { label: "User ID", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const userId = credentials?.userId?.trim();
        const password = credentials?.password;
        if (!userId || !password) {
          throw new Error("E00999");
        }
        try {
          const data = await login(userId, password);
          const issuedAtMs = parseIssuedAt(data.issued_at);
          const refreshTokenValue = data.refresh_token ?? null;
          if (!refreshTokenValue) {
            throw new Error("E00999");
          }
          return {
            id: userId,
            userId,
            accessToken: data.access_token,
            refreshToken: refreshTokenValue,
            issuedAt: issuedAtMs,
            expiresAt: issuedAtMs + data.expires_in * 1000,
          };
        } catch (error) {
          if (error instanceof Error && error.message) {
            throw new Error(error.message);
          }
          throw new Error("E00999");
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      const adminToken = token as AdminJwtToken;

      if (user) {
        const issuedAtMs =
          typeof (user as any).issuedAt === "number" ? (user as any).issuedAt : Date.now();
        const expiresAt =
          typeof (user as any).expiresAt === "number"
            ? (user as any).expiresAt
            : issuedAtMs + 15 * 60 * 1000;

        return {
          ...adminToken,
          backendAccessToken: (user as any).accessToken,
          backendRefreshToken: (user as any).refreshToken,
          backendTokenIssuedAt: issuedAtMs,
          backendTokenExpiresAt: expiresAt,
          adminUserId: (user as any).userId ?? (user as any).id,
          error: undefined,
        };
      }

      if (trigger === "update" && session && (session as any).action === "refresh") {
        return refreshToken(adminToken);
      }

      const expiresAt = adminToken.backendTokenExpiresAt;
      if (!expiresAt) {
        return adminToken;
      }

      const now = Date.now();
      // Refresh the token 30 seconds before expiration.
      if (now > expiresAt - 30_000) {
        return refreshToken(adminToken);
      }

      return adminToken;
    },
    async session({ session, token }) {
      const adminToken = token as AdminJwtToken;
      if (!adminToken.backendAccessToken) {
        return null as unknown as Session;
      }

      return {
        ...session,
        user: {
          ...session.user,
          name: adminToken.adminUserId ?? session.user?.name,
          email: session.user?.email ?? null,
        },
        adminUserId: adminToken.adminUserId ?? null,
        backendAccessToken: adminToken.backendAccessToken,
        backendTokenIssuedAt: adminToken.backendTokenIssuedAt ?? null,
        backendTokenExpiresAt: adminToken.backendTokenExpiresAt ?? null,
        error: adminToken.error ?? null,
      } as Session & {
        adminUserId: string | null;
        backendAccessToken: string;
        backendTokenIssuedAt: number | null;
        backendTokenExpiresAt: number | null;
        error: string | null;
      };
    },
  },
  events: {
    async signOut({ token }) {
      const adminToken = token as AdminJwtToken;
      if (!adminToken.backendRefreshToken) return;
      try {
        await fetch(`${backendBaseUrl}/admin_auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ refresh_token: adminToken.backendRefreshToken }),
          cache: "no-store",
        });
      } catch {
        // ignore logout errors
      }
    },
  },
  pages: {
    signIn: "/",
  },
};
