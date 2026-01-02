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

import { adminFetch, adminProxyPath } from "../../lib/apiClient";
import { DiagnosticOption } from "../../hooks/useDiagnostics";
import { VersionSelectOption } from "../../components/ImportStructureCard";
import { SystemPromptCard } from "../../components/SystemPromptCard";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;

const diagnosticOptions: DiagnosticOption[] = [
  { value: "1", label: "ITキャリア診断", code: "diag-a", isActive: true },
  { value: "2", label: "別診断", code: "diag-b", isActive: false },
];

const versionOptions: VersionSelectOption[] = [
  { value: "101", label: "Draft-2024", status: "draft", isActive: false },
  { value: "102", label: "Final-2023", status: "finalized", isActive: true },
];

const versionDetail = {
  id: 101,
  diagnosticId: 1,
  name: "Draft-2024",
  description: "最新ドラフト",
  note: "初期ノート",
  status: "draft" as const,
  systemPromptPreview: "Preview text...",
  srcHash: null,
  createdByAdminId: 9,
  updatedByAdminId: 77,
  createdAt: "2024-10-18T09:00:00Z",
  updatedAt: "2024-10-20T10:00:00Z",
  summary: {
    questions: 10,
    options: 30,
    outcomes: 5,
  },
  audit: null,
};

const systemPromptResponse = {
  system_prompt: "You are an AI career advisor.\nAnswer in Japanese.",
};

describe("SystemPromptCard", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    mockedAdminFetch.mockReset();
  });

  function mockPromptFetch() {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => systemPromptResponse,
    } as Response);
  }

  it("loads system prompt using the detail prop and displays preview", async () => {
    mockPromptFetch();

    render(
      <SystemPromptCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        versionDetail={versionDetail}
        isLoadingDetail={false}
        onReloadVersionDetail={() => {}}
      />,
    );

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(1));

    expect(mockedAdminFetch).toHaveBeenCalledWith(
      adminProxyPath("/admin/diagnostics/versions/101/system-prompt"),
      expect.objectContaining({
        method: "GET",
      }),
    );

    const textArea = await screen.findByLabelText("SYSTEM_PROMPT");
    expect((textArea as HTMLTextAreaElement).value).toBe(systemPromptResponse.system_prompt);

    expect(screen.getByText("Preview text...")).toBeTruthy();
    expect(screen.getByText("最終更新: 2024/10/20 19:00（ID: 77）")).toBeTruthy();
    expect(screen.getByText("49 / 100000")).toBeTruthy();
  });

  it("saves the editor content and triggers reload callbacks", async () => {
    mockPromptFetch();
    const updatedResponse = {
      id: 101,
      system_prompt: "Updated prompt",
      updated_at: "2024-10-21T12:34:56Z",
      updated_by_admin_id: 77,
    };
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => updatedResponse,
    } as Response);
    const handleReloadVersions = vi.fn();
    const handleReloadDetail = vi.fn();

    render(
      <SystemPromptCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        versionDetail={versionDetail}
        isLoadingDetail={false}
        onReloadVersionDetail={handleReloadDetail}
        onReloadVersions={handleReloadVersions}
      />,
    );

    const editor = (await screen.findByLabelText("SYSTEM_PROMPT")) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Updated prompt" } });
    const note = screen.getByLabelText("更新メモ") as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: "  refresh prompt  " } });

    const saveButton = screen.getByRole("button", { name: "保存" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(mockedAdminFetch).toHaveBeenCalledTimes(2));
    expect(mockedAdminFetch).toHaveBeenLastCalledWith(
      adminProxyPath("/admin/diagnostics/versions/101/system-prompt"),
      expect.objectContaining({
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_prompt: "Updated prompt",
          note: "refresh prompt",
        }),
      }),
    );

    await waitFor(() => expect(screen.getByText("SYSTEM_PROMPTを保存しました")).toBeTruthy());
    expect(handleReloadVersions).toHaveBeenCalledTimes(1);
    expect(handleReloadDetail).toHaveBeenCalledTimes(1);
    expect((editor as HTMLTextAreaElement).value).toBe("Updated prompt");
  });

  it("resets prompt and note to the fetched values", async () => {
    mockPromptFetch();

    render(
      <SystemPromptCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        versionDetail={versionDetail}
        isLoadingDetail={false}
        onReloadVersionDetail={() => {}}
      />,
    );

    const editor = (await screen.findByLabelText("SYSTEM_PROMPT")) as HTMLTextAreaElement;
    const note = screen.getByLabelText("更新メモ") as HTMLTextAreaElement;

    fireEvent.change(editor, { target: { value: "Temporary change" } });
    fireEvent.change(note, { target: { value: "Another note" } });

    fireEvent.click(screen.getByRole("button", { name: "リセット" }));

    expect(editor.value).toBe(systemPromptResponse.system_prompt);
    expect(note.value).toBe(versionDetail.note);
  });

  it("disables save when the prompt exceeds the limit", async () => {
    mockPromptFetch();

    render(
      <SystemPromptCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        versionDetail={versionDetail}
        isLoadingDetail={false}
        onReloadVersionDetail={() => {}}
      />,
    );

    const editor = (await screen.findByLabelText("SYSTEM_PROMPT")) as HTMLTextAreaElement;
    const longText = "x".repeat(100_001);
    fireEvent.change(editor, { target: { value: longText } });

    const saveButton = screen.getByRole("button", { name: "保存" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(screen.getByText("100001 / 100000")).toBeTruthy();
    expect(screen.getByText("上限（100000文字）を超えています")).toBeTruthy();
  });
});
