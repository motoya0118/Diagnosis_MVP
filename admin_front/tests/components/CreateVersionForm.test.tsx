import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../../lib/apiClient";
import { DiagnosticOption } from "../../hooks/useDiagnostics";
import { CreateVersionForm } from "../../components/CreateVersionForm";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;
const mockedResolveAdminError = resolveAdminError as unknown as vi.MockedFunction<typeof resolveAdminError>;

const options: DiagnosticOption[] = [
  { value: "1", label: "ITキャリア診断", code: "diag-a", isActive: true },
  { value: "2", label: "別診断", code: "diag-b", isActive: false },
];

describe("CreateVersionForm", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedAdminFetch.mockReset();
    mockedResolveAdminError.mockReset();
  });

  it("submits new version and resets the form on success", async () => {
    const payload = {
      id: 42,
      diagnostic_id: 1,
      name: "Draft-1",
      description: null,
      system_prompt: null,
      note: "初稿",
      src_hash: null,
      created_by_admin_id: 99,
      updated_by_admin_id: 99,
      created_at: "2024-10-20T10:00:00Z",
      updated_at: "2024-10-20T10:00:00Z",
    };
    mockedAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);
    const handleSelect = vi.fn();
    const handleCreated = vi.fn();

    render(
      <CreateVersionForm
        token="admin-token"
        diagnosticOptions={options}
        selectedDiagnosticId="1"
        onSelectDiagnostic={handleSelect}
        onCreated={handleCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("診断名"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("版名"), { target: { value: "  Draft-1  " } });
    fireEvent.change(screen.getByLabelText("作成メモ"), { target: { value: "初稿" } });
    const [form] = screen.getAllByRole("form", { name: "create-version-form" });
    fireEvent.submit(form);

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalled());

    expect(mockedAdminFetch).toHaveBeenCalledWith(
      adminProxyPath("/admin/diagnostics/versions"),
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          diagnostic_id: 1,
          name: "Draft-1",
          description: null,
          system_prompt: null,
          note: "初稿",
        }),
      }),
    );

    await waitFor(() => expect(handleCreated).toHaveBeenCalledWith(payload));
    expect(screen.getByText("診断版を作成しました")).toBeTruthy();
    expect((screen.getByLabelText("版名") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("作成メモ") as HTMLTextAreaElement).value).toBe("");
  });

  it("shows API error messages when creation fails", async () => {
    const apiError = new AdminApiError("E002", { status: 409 });
    mockedAdminFetch.mockRejectedValue(apiError);
    mockedResolveAdminError.mockReturnValue({
      message: "同じ版名がすでに存在します",
      action: "版名を変更してください",
    });

    render(
      <CreateVersionForm
        token="admin-token"
        diagnosticOptions={options}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("版名"), { target: { value: "Draft-1" } });
    const [form] = screen.getAllByRole("form", { name: "create-version-form" });
    fireEvent.submit(form);

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalled());
    expect(screen.getByText("同じ版名がすでに存在します")).toBeTruthy();
    expect(screen.getByText("版名を変更してください")).toBeTruthy();
  });

  it("validates required fields before submitting", async () => {
    const { rerender } = render(
      <CreateVersionForm
        token="admin-token"
        diagnosticOptions={options}
        selectedDiagnosticId={null}
        onSelectDiagnostic={() => {}}
      />,
    );

    let [form] = screen.getAllByRole("form", { name: "create-version-form" });
    fireEvent.submit(form);

    expect(await screen.findByText("診断を選択してください", { selector: "span" })).toBeTruthy();

    mockedAdminFetch.mockClear();

    rerender(
      <CreateVersionForm
        token="admin-token"
        diagnosticOptions={options}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
      />,
    );
    [form] = screen.getAllByRole("form", { name: "create-version-form" });
    fireEvent.submit(form);
    expect(await screen.findByText("版名を入力してください", { selector: "span" })).toBeTruthy();
  });
});
