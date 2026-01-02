import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../lib/apiClient", () => {
  class MockAdminApiError extends Error {
    code: string
    response?: { status?: number }

    constructor(code: string, response?: { status?: number }) {
      super(code)
      this.name = "AdminApiError"
      this.code = code
      this.response = response
    }
  }

  const ADMIN_PROXY_BASE_PATH = "/api/internal/admin"
  const buildProxyPath = (path: string) => {
    const normalized = path.startsWith("/") ? path : `/${path}`
    return `${ADMIN_PROXY_BASE_PATH}${normalized}`
  }

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
import { VersionDetailCard } from "../../components/VersionDetailCard";
import { DiagnosticOption } from "../../hooks/useDiagnostics";
import { VersionDetail } from "../../hooks/useVersionDetail";
import { VersionSelectOption } from "../../components/ImportStructureCard";

const mockedAdminFetch = adminFetch as unknown as vi.MockedFunction<typeof adminFetch>;

const diagnosticOptions: DiagnosticOption[] = [
  { value: "1", label: "ITキャリア診断", code: "ai-career", isActive: true },
]

const versionOptions: VersionSelectOption[] = [
  { value: "0", label: "初期テンプレート（Draft コピー）", status: "draft", isActive: true },
  { value: "101", label: "Draft-2024", status: "draft", isActive: false },
]

const detail: VersionDetail = {
  id: 101,
  diagnosticId: 1,
  name: "Draft-2024",
  description: "最新ドラフト",
  note: "初期ノート",
  status: "draft",
  systemPromptPreview: "Preview preview...",
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
  audit: {
    lastImportedAt: null,
    lastImportedByAdminId: null,
    finalizedAt: null,
    finalizedByAdminId: null,
  },
}

describe("VersionDetailCard", () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    mockedAdminFetch.mockReset()
  })

  it("renders detail info and fetches full prompt on demand", async () => {
    mockedAdminFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ system_prompt: "Full prompt content\nSecond line." }),
    } as Response)

    const handleReload = vi.fn()

    render(
      <VersionDetailCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="101"
        onSelectVersion={() => {}}
        detail={detail}
        isLoading={false}
        errorMessage={null}
        errorAction={null}
        onReload={handleReload}
      />,
    )

    expect(screen.getAllByText("Draft-2024").length).toBeGreaterThan(0)
    expect(screen.getByText("説明")).toBeTruthy()
    expect(screen.getByText("最新ドラフト")).toBeTruthy()
    expect(screen.getByText("質問: 10 / 選択肢: 30 / アウトカム: 5")).toBeTruthy()
    expect(screen.getByText("SYSTEM_PROMPT プレビュー")).toBeTruthy()
    expect(screen.getByText("Preview preview...")).toBeTruthy()

    const button = screen.getByRole("button", { name: "全文を取得" })
    fireEvent.click(button)

    await waitFor(() =>
      expect(mockedAdminFetch).toHaveBeenCalledWith(
        adminProxyPath("/admin/diagnostics/versions/101/system-prompt"),
        expect.objectContaining({
          method: "GET",
        }),
      ),
    )

    await screen.findByText("Full prompt content", { exact: false })
    expect(screen.getByRole("button", { name: "全文を閉じる" })).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "全文を閉じる" }))
    expect(screen.queryByText("Full prompt content", { exact: false })).toBeNull()
  })

  it("shows template warning for initial template selection", () => {
    render(
      <VersionDetailCard
        token="admin-token"
        diagnosticOptions={diagnosticOptions}
        selectedDiagnosticId="1"
        onSelectDiagnostic={() => {}}
        versionOptions={versionOptions}
        selectedVersionId="0"
        onSelectVersion={() => {}}
        detail={null}
        isLoading={false}
        errorMessage={null}
        errorAction={null}
        onReload={() => {}}
      />,
    )

    expect(screen.getByText("初期テンプレートはAPI対象外のため詳細情報は表示できません。")).toBeTruthy()
  })
})
