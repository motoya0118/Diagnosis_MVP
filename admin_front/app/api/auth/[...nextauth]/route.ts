import NextAuth from "next-auth";

import { authOptions } from "../../../../lib/auth/options";

/**
 * Amplify runs route handlers on the Edge runtime by default, where `process.env`
 * is not available. NextAuth requires access to server environment variables
 * (e.g. `NEXTAUTH_SECRET`), so force the Node.js runtime.
 */
export const runtime = "nodejs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
