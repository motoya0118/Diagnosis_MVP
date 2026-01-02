/** @jest-environment node */

import { startDiagnosticSession } from "../../../features/diagnostics/commonQa";

const buildResponse = (body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("Diagnostics API routing", () => {
  const sessionResponse = {
    session_code: "SESSION-ai_career",
    diagnostic_id: 101,
    version_id: 202,
    started_at: "2024-01-01T00:00:00.000Z",
  };

  let originalWindow: unknown;
  let originalBackendUrl: string | undefined;

  beforeEach(() => {
    originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.test";

    originalWindow = (globalThis as any).window;
    const windowStub = {
      location: {
        origin: "http://localhost",
        pathname: "/",
        search: "",
      },
    } as Pick<Window, "location">;
    (globalThis as any).window = windowStub;

    (global.fetch as jest.Mock).mockImplementation(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : String(input);

      if (url.includes("/api/diagnostics/diagnostics/ai_career/sessions")) {
        return buildResponse(sessionResponse);
      }

      throw new Error(`Unexpected request: ${url}`);
    });
  });

  afterEach(() => {
    if (originalBackendUrl === undefined) {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    } else {
      process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    }

    if (typeof originalWindow === "undefined") {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it("routes session creation through the diagnostics proxy instead of the backend origin", async () => {
    const response = await startDiagnosticSession("ai_career");

    expect(response).toEqual(sessionResponse);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [input, init] = (global.fetch as jest.Mock).mock.calls[0] as [RequestInfo | URL, RequestInit];
    const calledUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input instanceof Request
            ? input.url
            : String(input);

    expect(calledUrl).toContain("/api/diagnostics/diagnostics/ai_career/sessions");
    expect(init?.method ?? "GET").toBe("POST");
  });
});
