import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GitHubProvider from 'next-auth/providers/github'
import { cookies as nextCookies } from 'next/headers'

import {
  loginWithCredentials,
  exchangeGithub,
  refreshToken,
  logout as backendLogout,
  extractErrorCode,
} from '../backend'

const SESSION_MAX_AGE_MIN = parseInt(
  process.env.NEXTAUTH_SESSION_MAX_AGE_MINUTES ||
    process.env.ACCESS_TOKEN_EXPIRE_MINUTES ||
    '15',
  10,
)
const SESSION_MAX_AGE_SEC = (Number.isFinite(SESSION_MAX_AGE_MIN) && SESSION_MAX_AGE_MIN > 0
  ? SESSION_MAX_AGE_MIN
  : 15) * 60

const authSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || ''

export const authOptions: NextAuthOptions = {
  secret: authSecret || undefined,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
        device_id: { label: 'Device', type: 'text', optional: true },
        remember_me: { label: 'Remember', type: 'text', optional: true },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null
        try {
          const cookieStore = await nextCookies()
          const deviceId = (credentials as any).device_id || cookieStore.get('device_id')?.value
          const rememberCookie = cookieStore.get('remember_me')?.value
          const rememberFlag = (credentials as any).remember_me !== undefined
            ? ((credentials as any).remember_me === '1' || (credentials as any).remember_me === 'true')
            : (rememberCookie === '1' || rememberCookie === 'true')
          const tokens = await loginWithCredentials(credentials.email, credentials.password, deviceId, rememberFlag)
          return { id: credentials.email, email: credentials.email, tokens, deviceId, remember: rememberFlag }
        } catch (e) {
          const definition = extractErrorCode(e)
          if (definition) {
            throw new Error(definition.code)
          }
          if (e instanceof Error && e.message) {
            throw e
          }
          throw new Error('E00999')
        }
      },
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_ID || '',
      clientSecret: process.env.GITHUB_SECRET || '',
      authorization: {
        params: { scope: 'read:user user:email' },
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: SESSION_MAX_AGE_SEC,
    updateAge: Math.min(SESSION_MAX_AGE_SEC, 60),
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'github' && account.access_token) {
        try {
          const cookieStore = await nextCookies()
          const deviceId = cookieStore.get('device_id')?.value
          const rememberCookie = cookieStore.get('remember_me')?.value
          const rememberFlag = rememberCookie === '1' || rememberCookie === 'true'
          const tokens = await exchangeGithub(undefined, account.access_token as string, deviceId, rememberFlag)
          ;(user as any).tokens = tokens
          ;(user as any).deviceId = deviceId
          ;(user as any).remember = rememberFlag
          return true
        } catch (e: any) {
          const definition = extractErrorCode(e)
          const code = definition?.code || 'E00999'
          return `/login?error=${encodeURIComponent(code)}`
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user && (user as any).tokens) {
        token.accessToken = (user as any).tokens.access_token
        token.refreshToken = (user as any).tokens.refresh_token
        token.expiresAt = Date.now() + (((user as any).tokens.expires_in ?? 3600)) * 1000
        if ((user as any).deviceId) (token as any).deviceId = (user as any).deviceId
        if ((user as any).remember !== undefined) (token as any).remember = (user as any).remember
        return token
      }
      if (token.expiresAt && Date.now() > (token.expiresAt as number) - 30_000) {
        if (token.refreshToken && ((token as any).remember ?? false)) {
          try {
            const tokens = await refreshToken(token.refreshToken as string, (token as any).deviceId as string | undefined)
            token.accessToken = tokens.access_token
            token.refreshToken = tokens.refresh_token
            token.expiresAt = Date.now() + ((tokens.expires_in ?? 3600)) * 1000
          } catch {
          }
        } else {
          return {}
        }
      }
      return token
    },
    async session({ session, token }) {
      if (!(token as any)?.accessToken) {
        return null as any
      }
      ;(session as any).accessToken = (token as any).accessToken
      ;(session as any).refreshToken = (token as any).refreshToken
      return session
    },
  },
  events: {
    async signOut({ token }) {
      const rt = (token as any)?.refreshToken as string | undefined
      if (rt) {
        try {
          await backendLogout(rt, (token as any).deviceId as string | undefined)
        } catch {}
      }
    },
  },
  pages: {
    signIn: '/login',
  },
}

