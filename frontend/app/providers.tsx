"use client";

import { SessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import React from "react";
import { FeedbackProvider } from "./providers/feedback_provider";
import { useSessionLinker } from "../features/diagnostics/session/useSessionLinker";

function SessionLinkBootstrapper() {
  const { linkPendingSessions } = useSessionLinker();
  const { status } = useSession();
  const triggeredRef = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated") {
      triggeredRef.current = false;
      return;
    }
    if (triggeredRef.current) return;
    triggeredRef.current = true;
    void linkPendingSessions();
  }, [linkPendingSessions, status]);

  return null;
}

export default function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return (
    <SessionProvider session={session}>
      <FeedbackProvider>
        <SessionLinkBootstrapper />
        {children}
      </FeedbackProvider>
    </SessionProvider>
  );
}
