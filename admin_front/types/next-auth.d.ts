import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    adminUserId?: string | null;
    backendAccessToken?: string;
    backendTokenIssuedAt?: number | null;
    backendTokenExpiresAt?: number | null;
    error?: string | null;
  }

  interface User {
    userId?: string;
    accessToken?: string;
    refreshToken?: string;
    issuedAt?: number;
    expiresAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    backendAccessToken?: string;
    backendRefreshToken?: string;
    backendTokenIssuedAt?: number;
    backendTokenExpiresAt?: number;
    adminUserId?: string;
    error?: string;
  }
}
