import type { Metadata } from "next";
import "./globals.css";
import { AdminAppShell } from "./providers";
import { getServerSession } from "next-auth";

import { authOptions } from "../lib/auth/options";

/**
 * Server components default to the Edge runtime on some hosts (e.g. Amplify).
 * Force Node.js so `process.env` is available when resolving NextAuth secrets.
 */
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Admin Console",
  description: "Minimal admin authentication console",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="ja">
      <body>
        <AdminAppShell session={session}>{children}</AdminAppShell>
      </body>
    </html>
  );
}
