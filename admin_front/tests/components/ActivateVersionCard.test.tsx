import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/apiClient", () => {
  class MockAdminApiError extends Error {
    code: string;
    response?: { status?: number; json?: () => Promise<unknown> };

    constructor(code: string, response?: { status?: number; json?: () => Promise<unknown> }) {
      super(code);
      this.name = "AdminApiError";
      this.code = code;
      this.response = response;
    }
  }

  const ADMIN_PROXY_BASE_PATH = "/api/internal/admin";
  const buildProxyPath = (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`;
    return `${ADMIN_PROXY_BASE_PATH}${normalized}`;
  };

  return {
    API_BASE: "http://test.local",
    ADMIN_PROXY_BASE_PATH,
    adminProxyPath: buildProxyPath,
    adminFetch: vi.fn(),
    resolveAdminError: vi.fn(),
    AdminApiError: MockAdminApiError,
  };
});

import { ActivateVersionCard } from "../../components/ActivateVersionCard";
import { ActiveVersionListItem } from "../../hooks/useActiveVersions";
import { adminFetch, resolveAdminError, AdminApiError, adminProxyPath } from "../../lib/apiClient";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;
const mockedResolveError = resolveAdminError as unknown as vi.MockedFunction<typeof resolveAdminError>;

const activeItems: ActiveVersionListItem[] = [
  {
    diagnosticId: 1,
    diagnosticCode: "ai_career",
    displayName: "ITキャリア診断",
    activeVersion: {
      versionId: 10,
      name: "v2024-07",
      srcHash: "hash-prev",
      activatedAt: "2024-07-01T00:00:00Z",
      activatedByAdminId: 2,
    },
  },
  {
    diagnosticId: 2,
    diagnosticCode: "legacy",
    displayName: "旧診断",
    activeVersion: null,
  },
];

describe("ActivateVersionCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedAdminFetch.mockReset();
    mockedResolveError.mockReset();
  });

  it("activates selected version and refreshes lists", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        diagnostic_id: 1,
        items: [
          {
            id: 10,
            name: "v2024-07",
            status: "finalized",
            description: null,
            note: null,
            is_active: true,
            system_prompt_state: "present",
            created_at: "2024-06-01T00:00:00Z",
            updated_at: "2024-07-01T00:00:00Z",
          },
          {
            id: 11,
            name: "v2024-08",
            status: "finalized",
            description: null,
            note: null,
            is_active: false,
            system_prompt_state: "present",
            created_at: "2024-07-01T00:00:00Z",
            updated_at: "2024-07-15T00:00:00Z",
          },
          {
            id: 12,
            name: "Draft 2024-09",
            status: "draft",
            description: null,
            note: null,
            is_active: false,
            system_prompt_state: "empty",
            created_at: "2024-08-01T00:00:00Z",
            updated_at: "2024-08-01T00:00:00Z",
          },
        ],
      }),
    } as Response);
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        diagnostic_id: 1,
        version_id: 11,
        activated_at: "2024-08-10T00:00:00Z",
        activated_by_admin_id: 9,
      }),
    } as Response);
    const handleReloadActive = vi.fn();
    const handleReloadVersions = vi.fn();

    render(
      <ActivateVersionCard
        token="admin-token"
        items={activeItems}
        isLoading={false}
        error={null}
        onReloadActiveVersions={handleReloadActive}
        onReloadVersions={handleReloadVersions}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "切り替え" })[0]);

    await waitFor(() =>
      expect(mockedAdminFetch).toHaveBeenCalledWith(
        adminProxyPath("/admin/diagnostics/1/versions"),
        expect.objectContaining({
          method: "GET",
        }),
      ),
    );

    await waitFor(() => expect(screen.getByLabelText("v2024-08")).toBeTruthy());
    const draftRadio = screen.getByLabelText("Draft 2024-09") as HTMLInputElement;
    expect(draftRadio.disabled).toBe(true);

    fireEvent.click(screen.getByLabelText("v2024-08"));
    fireEvent.click(screen.getByRole("button", { name: "アクティブ版に切り替える" }));

    await waitFor(() =>
      expect(mockedAdminFetch).toHaveBeenCalledWith(
        adminProxyPath("/admin/diagnostics/versions/11/activate"),
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ diagnostic_id: 1 }),
        }),
      ),
    );

    await waitFor(() => expect(handleReloadActive).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(handleReloadVersions).toHaveBeenCalledWith(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("アクティブ版を切り替えました")).toBeTruthy();
  });

  it("shows draft specific error when backend rejects with E030", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        diagnostic_id: 1,
        items: [
          {
            id: 10,
            name: "v2024-07",
            status: "finalized",
            description: null,
            note: null,
            is_active: true,
            system_prompt_state: "present",
            created_at: "2024-06-01T00:00:00Z",
            updated_at: "2024-07-01T00:00:00Z",
          },
          {
            id: 12,
            name: "Draft 2024-09",
            status: "draft",
            description: null,
            note: null,
            is_active: false,
            system_prompt_state: "empty",
            created_at: "2024-08-01T00:00:00Z",
            updated_at: "2024-08-01T00:00:00Z",
          },
        ],
      }),
    } as Response);

    const apiError = new AdminApiError("E030", {
      status: 409,
      json: async () => ({
        error: {
          code: "E030",
        },
      }),
    });
    mockedAdminFetch.mockRejectedValueOnce(apiError);

    render(
      <ActivateVersionCard
        token="admin-token"
        items={activeItems}
        isLoading={false}
        error={null}
        onReloadActiveVersions={() => {}}
        onReloadVersions={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "切り替え" })[0]);
    await waitFor(() => expect(screen.getByLabelText("Draft 2024-09")).toBeTruthy());

    fireEvent.click(screen.getByLabelText("Draft 2024-09"));
    fireEvent.click(screen.getByRole("button", { name: "アクティブ版に切り替える" }));

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("Finalize 済みの版のみアクティブ化できます")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("shows diagnostic mismatch error for E012 responses", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        diagnostic_id: 2,
        items: [
          {
            id: 21,
            name: "legacy-final",
            status: "finalized",
            description: null,
            note: null,
            is_active: true,
            system_prompt_state: "present",
            created_at: "2024-02-01T00:00:00Z",
            updated_at: "2024-02-20T00:00:00Z",
          },
        ],
      }),
    } as Response);
    const apiError = new AdminApiError("E012", {
      status: 400,
      json: async () => ({
        error: {
          code: "E012",
          detail: "指定診断と版が一致しません",
        },
      }),
    });
    mockedAdminFetch.mockRejectedValueOnce(apiError);

    render(
      <ActivateVersionCard
        token="admin-token"
        items={activeItems}
        isLoading={false}
        error={null}
        onReloadActiveVersions={() => {}}
        onReloadVersions={() => {}}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "切り替え" })[1]);
    await waitFor(() => expect(screen.getByLabelText("legacy-final")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "アクティブ版に切り替える" }));

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText("指定診断と版が一致しません")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});
