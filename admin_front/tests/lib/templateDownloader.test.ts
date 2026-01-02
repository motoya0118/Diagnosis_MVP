import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/apiClient", () => {
  class MockAdminApiError extends Error {
    code: string;
    response?: Response;

    constructor(code: string, response?: Response) {
      super(code);
      this.name = "AdminApiError";
      this.code = code;
      this.response = response;
    }
  }

  return {
    API_BASE: "http://test.local",
    adminFetchWithAuth: vi.fn(),
    AdminApiError: MockAdminApiError,
  };
});

import { downloadVersionTemplate } from "../../lib/templateDownloader";
import { adminFetchWithAuth } from "../../lib/apiClient";

const mockedFetch = adminFetchWithAuth as unknown as vi.MockedFunction<typeof adminFetchWithAuth>;

describe("downloadVersionTemplate", () => {
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalCreateElement = document.createElement;
  const appendChildSpy = vi.spyOn(document.body, "appendChild");

  beforeEach(() => {
    mockedFetch.mockReset();
    appendChildSpy.mockReset();
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.createElement = originalCreateElement;
  });

  it("invokes download for finalized version", async () => {
    const blob = new Blob(["data"]);
    mockedFetch.mockResolvedValue({
      blob: async () => blob,
      headers: new Headers({
        "content-disposition": 'attachment; filename="career_v12.xlsx"',
      }),
    } as Response);

    const anchor = originalCreateElement.call(document, "a") as HTMLAnchorElement;
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    const removeSpy = vi.spyOn(anchor, "remove").mockImplementation(() => {});
    document.createElement = vi.fn().mockReturnValue(anchor) as unknown as typeof document.createElement;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:url");
    URL.revokeObjectURL = vi.fn();

    const filename = await downloadVersionTemplate({
      token: "token",
      diagnosticId: "1",
      versionId: "12",
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/versions/12/template",
      expect.objectContaining({
        method: "GET",
      }),
      { token: "token" },
    );
    expect(anchor.download).toBe("career_v12.xlsx");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(anchor.href).toContain("blob:url");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url");
    expect(filename).toBe("career_v12.xlsx");
  });

  it("appends diagnostic_id when requesting draft template", async () => {
    mockedFetch.mockResolvedValue({
      blob: async () => new Blob(),
      headers: new Headers(),
    } as Response);

    const anchor = originalCreateElement.call(document, "a") as HTMLAnchorElement;
    const clickSpy = vi.spyOn(anchor, "click").mockImplementation(() => {});
    const removeSpy = vi.spyOn(anchor, "remove").mockImplementation(() => {});
    document.createElement = vi.fn().mockReturnValue(anchor) as unknown as typeof document.createElement;
    URL.createObjectURL = vi.fn().mockReturnValue("blob:url");
    URL.revokeObjectURL = vi.fn();

    await downloadVersionTemplate({
      token: "token",
      diagnosticId: "5",
      versionId: "0",
    });

    expect(mockedFetch).toHaveBeenCalledWith(
      "http://test.local/admin/diagnostics/versions/0/template?diagnostic_id=5",
      expect.any(Object),
      { token: "token" },
    );
    expect(anchor.download).toBe("diagnostic_template.xlsx");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
  });
});
