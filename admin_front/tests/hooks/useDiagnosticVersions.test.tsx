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

import { useDiagnosticVersions } from "../../hooks/useDiagnosticVersions";
import { adminFetchWithAuth, resolveAdminError, AdminApiError } from "../../lib/apiClient";

const mockedFetch = adminFetchWithAuth as unknown as vi.MockedFunction<typeof adminFetchWithAuth>;
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

describe("useDiagnosticVersions", () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedResolveError.mockReset();
    resetSessionMocks();
    setMockSession(mockSession, "authenticated");
  });

  it("fetches diagnostic versions when token and diagnosticId are provided", async () => {
    mockedFetch.mockResolvedValue({
      json: async () => ({
        diagnostic_id: 1,
        items: [
          {
            id: 42,
            name: "2024 Draft",
            status: "draft",
            description: null,
            note: null,
            is_active: false,
            system_prompt_state: "empty",
            created_at: "2024-09-01T00:00:00Z",
            updated_at: "2024-09-01T12:00:00Z",
          },
        ],
      }),
    } as Response);

    const { result } = renderHook(() => useDiagnosticVersions({ diagnosticId: "1" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/1/versions",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
      { token: "admin-token" },
    );
    expect(result.current.versions).toEqual([
      {
        id: 42,
        name: "2024 Draft",
        status: "draft",
        description: null,
        note: null,
        isActive: false,
        systemPromptState: "empty",
        createdAt: "2024-09-01T00:00:00Z",
        updatedAt: "2024-09-01T12:00:00Z",
      },
    ]);
    expect(result.current.error).toBeNull();
  });

  it("adds status and limit query parameters when provided", async () => {
    mockedFetch.mockResolvedValue({
      json: async () => ({
        diagnostic_id: 1,
        items: [],
      }),
    } as Response);

    const { result } = renderHook(() =>
      useDiagnosticVersions({ diagnosticId: "1", status: "draft", limit: 5 }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockedFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/1/versions?status=draft&limit=5",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
      { token: "admin-token" },
    );
  });

  it("skips fetch when diagnosticId is missing", () => {
    const { result } = renderHook(() => useDiagnosticVersions({ diagnosticId: null }));
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(result.current.versions).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("captures admin API errors with resolved messaging", async () => {
    const error = new AdminApiError("E010", { status: 404 });
    mockedFetch.mockRejectedValue(error);
    mockedResolveError.mockReturnValue({
      message: "指定した版が見つかりません",
      action: "版一覧を再読み込みしてください",
    });

    const { result } = renderHook(() => useDiagnosticVersions({ diagnosticId: "2" }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toEqual({
      status: 404,
      code: "E010",
      message: "指定した版が見つかりません",
      action: "版一覧を再読み込みしてください",
    });
    expect(result.current.versions).toEqual([]);
  });
});
