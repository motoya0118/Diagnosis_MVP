import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

import { resetSessionMocks, setMockSession } from "../test-utils/mockSession";

vi.mock("../../lib/apiClient", () => {
  class MockAdminApiError extends Error {
    code: string;
    response?: { status?: number };

    constructor(code: string, response?: { status?: number }) {
      super(code);
      this.name = "AdminApiError";
      this.code = code;
      this.response = response;
    }
  }

  return {
    API_BASE: "http://test.local",
    adminFetchWithAuth: vi.fn(),
    resolveAdminError: vi.fn(),
    AdminApiError: MockAdminApiError,
  };
});

import { useAdminDiagnostics } from "../../hooks/useDiagnostics";
import { adminFetchWithAuth, resolveAdminError, AdminApiError } from "../../lib/apiClient";

const mockedAdminFetchWithAuth = adminFetchWithAuth as unknown as vi.MockedFunction<
  typeof adminFetchWithAuth
>;
const mockedResolveError = resolveAdminError as unknown as vi.MockedFunction<typeof resolveAdminError>;

const mockSession = {
  user: { name: "admin" },
  expires: new Date(Date.now() + 60_000).toISOString(),
  adminUserId: "admin-user",
  backendAccessToken: "admin-token",
  backendRefreshToken: "admin-refresh",
  backendTokenIssuedAt: Date.now(),
  backendTokenExpiresAt: Date.now() + 60_000,
  error: null,
} as any;

describe("useAdminDiagnostics", () => {
  beforeEach(() => {
    mockedAdminFetchWithAuth.mockReset();
    mockedResolveError.mockReset();
    resetSessionMocks();
    setMockSession(mockSession, "authenticated");
  });

  it("fetches diagnostics and exposes options", async () => {
    const payload = {
      items: [
        {
          id: 1,
          code: "diag-a",
          display_name: "ITキャリア診断",
          description: "AI職種とのフィット診断",
          outcome_table_name: "mst_ai_jobs",
          is_active: true,
        },
      ],
    };
    mockedAdminFetchWithAuth.mockResolvedValue({
      json: async () => payload,
    } as Response);

    const { result } = renderHook(() => useAdminDiagnostics({ includeInactive: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAdminFetchWithAuth).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
      { token: "admin-token" },
    );
    expect(result.current.options).toEqual([
      { value: "1", label: "ITキャリア診断", code: "diag-a", isActive: true },
    ]);
    expect(result.current.diagnostics[0].outcomeTableName).toBe("mst_ai_jobs");
    expect(result.current.error).toBeNull();
  });

  it("appends include_inactive parameter when requested", async () => {
    mockedAdminFetchWithAuth.mockResolvedValue({
      json: async () => ({ items: [] }),
    } as Response);

    const { result, rerender } = renderHook(
      ({ includeInactive }: { includeInactive: boolean }) =>
        useAdminDiagnostics({ includeInactive }),
      {
        initialProps: { includeInactive: true },
      },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAdminFetchWithAuth).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics?include_inactive=true",
      expect.any(Object),
      { token: "admin-token" },
    );

    rerender({ includeInactive: false });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedAdminFetchWithAuth).toHaveBeenLastCalledWith(
      "http://test.local/admin/diagnostics",
      expect.any(Object),
      { token: "admin-token" },
    );
  });

  it("captures admin API errors with resolved messaging", async () => {
    const error = new AdminApiError("E011", { status: 400 });
    mockedAdminFetchWithAuth.mockRejectedValue(error);
    mockedResolveError.mockReturnValue({ message: "診断一覧の取得条件が不正です", action: "フィルタを確認する" });

    const { result } = renderHook(() => useAdminDiagnostics({ includeInactive: false }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual({
      status: 400,
      code: "E011",
      message: "診断一覧の取得条件が不正です",
      action: "フィルタを確認する",
    });
    expect(result.current.diagnostics).toEqual([]);
  });

  it("does not invoke fetch when token is missing", () => {
    resetSessionMocks();
    setMockSession(null, "unauthenticated");

    const { result } = renderHook(() => useAdminDiagnostics({ includeInactive: false }));
    expect(mockedAdminFetchWithAuth).not.toHaveBeenCalled();
    expect(result.current.diagnostics).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
