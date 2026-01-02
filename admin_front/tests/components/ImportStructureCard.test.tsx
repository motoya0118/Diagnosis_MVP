import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/apiClient", () => {
  class MockAdminApiError extends Error {
    code: string;
    response?: { status?: number; json: () => Promise<unknown> };
    definition?: { uiMessage: string; action: string | null };

    constructor(
      code: string,
      response?: { status?: number; json: () => Promise<unknown> },
      definition?: { uiMessage: string; action: string | null },
    ) {
      super(code);
      this.name = "AdminApiError";
      this.code = code;
      this.response = response;
      this.definition = definition;
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
import { ImportStructureCard, ImportStructureCardProps } from "../../components/ImportStructureCard";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;
const mockedResolveAdminError = resolveAdminError as unknown as vi.MockedFunction<typeof resolveAdminError>;

const diagnosticOptions: DiagnosticOption[] = [
  { value: "1", label: "ITキャリア診断", code: "diag-a", isActive: true },
];

const versionOptions = [
  { value: "10", label: "Draft-10", status: "draft" as const, isActive: false },
];

const baseProps: ImportStructureCardProps = {
  token: "admin-token",
  diagnosticOptions,
  selectedDiagnosticId: "1",
  onSelectDiagnostic: vi.fn(),
  versionOptions,
  selectedVersionId: "10",
  onSelectVersion: vi.fn(),
  onImportSuccess: vi.fn(),
  isLoading: false,
};

describe("ImportStructureCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedAdminFetch.mockReset();
    mockedResolveAdminError.mockReset();
    (baseProps.onImportSuccess as unknown as vi.Mock).mockClear();
  });

  it("uploads xlsx file and renders success summary", async () => {
    const payload = {
      version_id: 10,
      questions_imported: 3,
      options_imported: 9,
      outcomes_imported: 4,
      warnings: ["新規アウトカムが追加されました"],
    };
    mockedAdminFetch.mockResolvedValue({
      ok: true,
      json: async () => payload,
    } as Response);

    render(<ImportStructureCard {...baseProps} />);

    const file = new File(["dummy"], "structure.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText("テンプレートファイルを選択");
    await waitFor(() =>
      fireEvent.change(input, {
        target: { files: [file] },
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "取り込む" }));

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalled());
    const [url, init] = mockedAdminFetch.mock.calls[0];
    expect(url).toBe(adminProxyPath("/admin/diagnostics/versions/10/structure/import"));
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined();
    const body = init?.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    const entries = Array.from(body.entries());
    expect(entries[0][0]).toBe("file");
    expect(entries[0][1]).toBeInstanceOf(File);

    expect(await screen.findByText("質問: 3 件 / 選択肢: 9 件 / アウトカム: 4 件")).toBeTruthy();
    expect(screen.getByText("新規アウトカムが追加されました")).toBeTruthy();
    expect(baseProps.onImportSuccess).toHaveBeenCalledWith(payload);
  });

  it("displays validation errors with invalid cell detail", async () => {
    mockedResolveAdminError.mockReturnValue({
      message: "入力内容に誤りがあります",
      action: "テンプレートを修正してください",
    });
    const apiError = new AdminApiError(
      "E031",
      {
        status: 400,
        json: async () => ({
          error: {
            code: "E031",
            detail: "multi 列の値が不正です",
            extra: { invalid_cells: ["questions!C12", "options!F8"] },
          },
        }),
      },
      { uiMessage: "入力内容に誤りがあります", action: "テンプレートを修正してください" },
    );
    mockedAdminFetch.mockRejectedValue(apiError);

    render(<ImportStructureCard {...baseProps} />);
    const file = new File(["dummy"], "structure.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const input = screen.getByLabelText("テンプレートファイルを選択");
    fireEvent.change(input, { target: { files: [file] } });

    fireEvent.click(screen.getByRole("button", { name: "取り込む" }));

    expect(await screen.findByText("入力内容に誤りがあります")).toBeTruthy();
    expect(screen.getByText("テンプレートを修正してください")).toBeTruthy();
    expect(screen.getByText("multi 列の値が不正です")).toBeTruthy();
    expect(screen.getByText("questions!C12")).toBeTruthy();
    expect(screen.getByText("options!F8")).toBeTruthy();
  });

  it("allows retry after validation error without reloading", async () => {
    mockedResolveAdminError.mockReturnValueOnce({
      message: "入力内容に誤りがあります",
      action: "テンプレートを修正してください",
    });
    const validationError = new AdminApiError(
      "E40001",
      {
        status: 400,
        json: async () => ({
          error: {
            code: "E40001",
            detail: "シートのフォーマットが正しくありません",
            extra: { invalid_cells: ["questions!B5"] },
          },
        }),
      },
      { uiMessage: "入力内容に誤りがあります", action: "テンプレートを修正してください" },
    );
    const successPayload = {
      version_id: 10,
      questions_imported: 5,
      options_imported: 10,
      outcomes_imported: 3,
      warnings: [],
    };

    mockedAdminFetch.mockRejectedValueOnce(validationError);
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => successPayload,
    } as Response);

    render(<ImportStructureCard {...baseProps} />);

    const input = screen.getByLabelText("テンプレートファイルを選択");

    const invalidFile = new File(["invalid"], "invalid.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(input, { target: { files: [invalidFile] } });
    fireEvent.click(screen.getByRole("button", { name: "取り込む" }));

    expect(await screen.findByText("入力内容に誤りがあります")).toBeTruthy();
    expect(screen.getByText("シートのフォーマットが正しくありません")).toBeTruthy();

    const validFile = new File(["valid"], "valid.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    fireEvent.change(input, { target: { files: [validFile] } });
    fireEvent.click(screen.getByRole("button", { name: "取り込む" }));

    expect(await screen.findByText("質問: 5 件 / 選択肢: 10 件 / アウトカム: 3 件")).toBeTruthy();
    expect(mockedAdminFetch).toHaveBeenCalledTimes(2);
    expect(baseProps.onImportSuccess).toHaveBeenCalledWith(successPayload);
  });

  it("blocks submission when prerequisites are missing", async () => {
    render(
      <ImportStructureCard
        {...baseProps}
        token={null}
        selectedDiagnosticId={null}
        selectedVersionId={null}
      />,
    );

    const button = screen.getByRole("button", { name: "取り込む" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
});
