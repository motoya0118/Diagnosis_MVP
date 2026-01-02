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

import { adminFetch, resolveAdminError, AdminApiError, adminProxyPath } from "../../lib/apiClient";
import { DiagnosticOption } from "../../hooks/useDiagnostics";
import { VersionSelectOption } from "../../components/ImportStructureCard";
import { FinalizeVersionCard } from "../../components/FinalizeVersionCard";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;
const mockedResolveError = resolveAdminError as unknown as vi.MockedFunction<typeof resolveAdminError>;

const diagnosticOptions: DiagnosticOption[] = [
  { value: "1", label: "ITキャリア診断", code: "diag-a", isActive: true },
  { value: "2", label: "別診断", code: "diag-b", isActive: false },
];

const versionOptions: VersionSelectOption[] = [
  { value: "101", label: "Draft-2024", status: "draft", isActive: false },
  { value: "102", label: "Final-2023", status: "finalized", isActive: true },
];

const finalizeResponse = {
  version_id: 101,
  src_hash: "deadbeef",
  summary: {
    questions: 3,
    options: 12,
    outcomes: 2,
  },
  finalized_at: "2024-10-21T12:34:56Z",
  finalized_by_admin_id: 9,
};

describe("FinalizeVersionCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedAdminFetch.mockReset();
    mockedResolveError.mockReset();
  });

  it("finalizes a draft version after confirmation", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => finalizeResponse,
    } as Response);
    const handleFinalized = vi.fn();

    render(
      <FinalizeVersionCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        onFinalized={handleFinalized}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "版フリーズ" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "実行する" }));

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(1));
    expect(mockedAdminFetch).toHaveBeenCalledWith(
      adminProxyPath("/admin/diagnostics/versions/101/finalize"),
      expect.objectContaining({
        method: "POST",
      }),
    );

    await waitFor(() => expect(handleFinalized).toHaveBeenCalledWith(finalizeResponse));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("版をフリーズしました")).toBeTruthy();
    expect(screen.getByText("質問: 3 / 選択肢: 12 / アウトカム: 2")).toBeTruthy();
  });

  it("shows API errors inside the confirmation dialog", async () => {
    mockedResolveError.mockReturnValue({
      message: "依存データが不足しています",
      action: "Draft を確認してください",
    });
    const error = new AdminApiError("E030", {
      status: 409,
      json: async () => ({
        error: {
          code: "E030",
          detail: "Active options missing",
        },
      }),
    });
    mockedAdminFetch.mockRejectedValueOnce(error);

    render(
      <FinalizeVersionCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "版フリーズ" }));
    fireEvent.click(screen.getByRole("button", { name: "実行する" }));

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(1));

    expect(await screen.findByText("依存データが不足しています")).toBeTruthy();
    expect(await screen.findByText("Draft を確認してください")).toBeTruthy();
    expect(await screen.findByText("Active options missing")).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("closes the dialog without calling the API when cancelled", () => {
    render(
      <FinalizeVersionCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "版フリーズ" }));
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockedAdminFetch).not.toHaveBeenCalled();
  });
});
