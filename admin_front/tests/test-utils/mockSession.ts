import { vi } from "vitest";
import type { Session } from "next-auth";

type SessionStatus = "authenticated" | "unauthenticated" | "loading";

const DEFAULT_SESSION: Session = {
  user: {
    name: null,
    email: null,
    image: null,
  },
  expires: new Date(0).toISOString(),
};

const sessionState: { data: Session | null; status: SessionStatus } = {
  data: null,
  status: "unauthenticated",
};

const updateMock = vi.fn(async (data?: Partial<Session>) => {
  if (data) {
    sessionState.data = {
      ...(sessionState.data ?? DEFAULT_SESSION),
      ...data,
    };
  }
  return sessionState.data;
});

const useSessionMock = vi.fn(() => ({
  data: sessionState.data,
  status: sessionState.status,
  update: updateMock,
}));

vi.mock("next-auth/react", () => ({
  useSession: useSessionMock,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

export function setMockSession(session: Session | null, status: SessionStatus = session ? "authenticated" : "unauthenticated") {
  sessionState.data = session;
  sessionState.status = status;
}

export function resetSessionMocks(): void {
  sessionState.data = null;
  sessionState.status = "unauthenticated";
  updateMock.mockClear();
  useSessionMock.mockClear();
}

export { useSessionMock };
