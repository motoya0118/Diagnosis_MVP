import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { adminFetchWithAuth, resolveAdminError, AdminApiError } from "../../lib/apiClient";
import { useActiveVersions } from "../../hooks/useActiveVersions";

const mockedAdminFetch = adminFetchWithAuth as unknown as vi.MockedFunction<typeof adminFetchWithAuth>;
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

describe("useActiveVersions", () => {
  beforeEach(() => {
    mockedAdminFetch.mockReset();
    mockedResolveError.mockReset();
    resetSessionMocks();
    setMockSession(mockSession, "authenticated");
  });

  it("fetches active versions and normalises payload", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      json: async () => ({
        items: [
          {
            diagnostic_id: 1,
            diagnostic_code: "ai_career",
            display_name: "ITキャリア診断",
            active_version: {
              version_id: 37,
              name: "v2024-08",
              src_hash: "abc123",
              activated_at: "2024-09-01T12:00:00Z",
              activated_by_admin_id: 4,
            },
          },
          {
            diagnostic_id: 2,
            diagnostic_code: "legacy",
            display_name: "旧診断",
            active_version: null,
          },
        ],
      }),
    } as Response);

    const { result } = renderHook(() =>
      useActiveVersions({
        diagnosticId: null,
        diagnosticCode: null,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedAdminFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/active-versions",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
      { token: "admin-token" },
    );
    expect(result.current.items).toEqual([
      {
        diagnosticId: 1,
        diagnosticCode: "ai_career",
        displayName: "ITキャリア診断",
        activeVersion: {
          versionId: 37,
          name: "v2024-08",
          srcHash: "abc123",
          activatedAt: "2024-09-01T12:00:00Z",
          activatedByAdminId: 4,
        },
      },
      {
        diagnosticId: 2,
        diagnosticCode: "legacy",
        displayName: "旧診断",
        activeVersion: null,
      },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("appends query parameters when filters supplied", async () => {
    mockedAdminFetch.mockResolvedValue({
      json: async () => ({ items: [] }),
    } as Response);

    const { result, rerender } = renderHook(
      ({ diagnosticId, diagnosticCode }: { diagnosticId: string | null; diagnosticCode: string | null }) =>
        useActiveVersions({
          diagnosticId,
          diagnosticCode,
        }),
      {
        initialProps: { diagnosticId: "5", diagnosticCode: null },
      },
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedAdminFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/active-versions?diagnostic_id=5",
      expect.any(Object),
      { token: "admin-token" },
    );

    rerender({ diagnosticId: null, diagnosticCode: "diag-x" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedAdminFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/active-versions?diagnostic_code=diag-x",
      expect.any(Object),
      { token: "admin-token" },
    );
  });

  it("exposes resolved error information on failures", async () => {
    const error = new AdminApiError("E00999", { status: 500 });
    mockedAdminFetch.mockRejectedValueOnce(error);
    mockedResolveError.mockReturnValue({ message: "不明なエラーが発生しました", action: "やり直してください" });

    const { result } = renderHook(() =>
      useActiveVersions({
        diagnosticId: null,
        diagnosticCode: null,
      }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual({
      status: 500,
      code: "E00999",
      message: "不明なエラーが発生しました",
      action: "やり直してください",
    });
    expect(result.current.items).toEqual([]);
  });

  it("does not trigger fetch when token missing", () => {
    resetSessionMocks();
    setMockSession(null, "unauthenticated");

    const { result } = renderHook(() =>
      useActiveVersions({ diagnosticId: null, diagnosticCode: null }),
    );

    expect(mockedAdminFetch).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("supports manual reload", async () => {
    mockedAdminFetch.mockResolvedValue({
      json: async () => ({ items: [] }),
    } as Response);

    const { result } = renderHook(() => useActiveVersions({ diagnosticId: null, diagnosticCode: null }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockedAdminFetch).toHaveBeenCalledTimes(1);

    result.current.reload();
    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(2));
  });
});
