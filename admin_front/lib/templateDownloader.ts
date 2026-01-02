import { AdminApiError, API_BASE, adminFetchWithAuth } from "./apiClient";

export type DownloadTemplateArgs = {
  diagnosticId: string;
  versionId: string;
  token?: string | null;
};

function parseFilename(contentDisposition: string | null): string | null {
  if (!contentDisposition) return null
  const match = contentDisposition.match(/filename\*?=(?:UTF-8'')?"?([^\";]+)"?/)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

export async function downloadVersionTemplate({
  token,
  diagnosticId,
  versionId,
}: DownloadTemplateArgs): Promise<string> {
  if (typeof window === "undefined") {
    throw new Error("downloadVersionTemplate can only run in a browser context")
  }

  const url = new URL(`/admin/diagnostics/versions/${versionId}/template`, API_BASE)
  if (versionId === "0") {
    url.searchParams.set("diagnostic_id", diagnosticId)
  }

  const response = await adminFetchWithAuth(
    url.toString(),
    {
      method: "GET",
    },
    { token: token ?? null },
  );
  const blob = await response.blob()
  const filename = parseFilename(response.headers.get("content-disposition")) ?? "diagnostic_template.xlsx"

  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = objectUrl
  link.download = filename
  link.style.display = "none"
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(objectUrl)

  return filename
}

export type TemplateDownloadError = AdminApiError | Error
