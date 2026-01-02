import React, { DragEvent, useCallback, useMemo, useRef, useState } from "react";

import { AdminApiError, adminFetch, adminProxyPath, resolveAdminError } from "../lib/apiClient";
import { DiagnosticOption } from "../hooks/useDiagnostics";

export type VersionSelectOption = {
  value: string;
  label: string;
  status: "draft" | "finalized";
  isActive: boolean;
};

export type ImportStructureResponse = {
  version_id: number;
  questions_imported: number;
  options_imported: number;
  outcomes_imported: number;
  warnings: string[];
};

export type ImportStructureCardProps = {
  token: string | null;
  diagnosticOptions: DiagnosticOption[];
  selectedDiagnosticId: string | null;
  onSelectDiagnostic: (value: string) => void;
  versionOptions: VersionSelectOption[];
  selectedVersionId: string | null;
  onSelectVersion: (value: string) => void;
  onImportSuccess?: (payload: ImportStructureResponse) => void;
  isLoading: boolean;
};

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ImportStructureCard({
  token,
  diagnosticOptions,
  selectedDiagnosticId,
  onSelectDiagnostic,
  versionOptions,
  selectedVersionId,
  onSelectVersion,
  onImportSuccess,
  isLoading,
}: ImportStructureCardProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorAction, setErrorAction] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [invalidCells, setInvalidCells] = useState<string[]>([]);
  const [result, setResult] = useState<ImportStructureResponse | null>(null);

  const canSubmit = useMemo(() => {
    if (!token) return false;
    if (!selectedDiagnosticId) return false;
    if (!selectedVersionId || selectedVersionId === "0") return false;
    if (!file) return false;
    if (uploading || isLoading) return false;
    return true;
  }, [token, selectedDiagnosticId, selectedVersionId, file, uploading, isLoading]);

  const filteredVersionOptions = useMemo(
    () => versionOptions.filter((option) => option.status === "draft" && option.value !== "0"),
    [versionOptions],
  );

  const resetFileSelection = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    setFile(null);
  }, []);

  const resetStates = useCallback(() => {
    setError(null);
    setErrorAction(null);
    setDetail(null);
    setInvalidCells([]);
    setResult(null);
  }, []);

  const handleFile = useCallback(
    (incoming: File | null) => {
      if (!incoming) {
        resetFileSelection();
        return;
      }
      const isXlsx =
        incoming.type === XLSX_MIME ||
        incoming.name.toLowerCase().endsWith(".xlsx");
      if (!isXlsx) {
        setError("Excel（.xlsx）形式のファイルを選択してください");
        setErrorAction("テンプレートを再ダウンロードしてください");
        setDetail(null);
        setInvalidCells([]);
        setResult(null);
        resetFileSelection();
        return;
      }
      setFile(incoming);
      resetStates();
    },
    [resetFileSelection, resetStates],
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files;
      handleFile(files && files.length > 0 ? files[0] : null);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      const files = event.dataTransfer.files;
      handleFile(files && files.length > 0 ? files[0] : null);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canSubmit || !token || !selectedDiagnosticId || !selectedVersionId || !file) {
        return;
      }

      setUploading(true);
      setError(null);
      setErrorAction(null);
      setDetail(null);
      setInvalidCells([]);
      setResult(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await adminFetch(
          adminProxyPath(`/admin/diagnostics/versions/${selectedVersionId}/structure/import`),
          {
            method: "POST",
            body: formData,
          },
        );
        const payload = (await response.json()) as ImportStructureResponse;
        setResult(payload);
        setInvalidCells([]);
        onImportSuccess?.(payload);
        resetFileSelection();
      } catch (err) {
        if (err instanceof AdminApiError) {
          const resolved = resolveAdminError(err.code);
          setError(resolved?.message ?? err.message);
          setErrorAction(resolved?.action ?? null);
          try {
            const body = (await err.response?.json()) as any;
            if (body?.error?.detail && typeof body.error.detail === "string") {
              setDetail(body.error.detail);
            }
            const cells = body?.error?.extra?.invalid_cells;
            if (Array.isArray(cells)) {
              setInvalidCells(cells);
            }
          } catch {
            // ignore parse errors
          }
        } else if (err instanceof Error) {
          setError(err.message === "Failed to fetch" ? "インポートの通信に失敗しました" : err.message);
          setErrorAction(null);
        } else {
          setError("インポート処理に失敗しました");
          setErrorAction(null);
        }
        resetFileSelection();
      } finally {
        setUploading(false);
      }
    },
    [canSubmit, file, onImportSuccess, resetFileSelection, selectedVersionId, token, selectedDiagnosticId],
  );

  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: "0.75rem", padding: "1rem", display: "grid", gap: "0.75rem" }}>
      <header>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>テンプレート取込</h2>
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
          Draft 版へテンプレートの設問・選択肢・アウトカムを一括で取り込みます。
        </p>
      </header>

      <form onSubmit={handleSubmit} aria-label="import-structure-form" style={{ display: "grid", gap: "0.75rem" }}>
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontWeight: 600 }}>診断名</span>
          <select
            value={selectedDiagnosticId ?? ""}
            onChange={(event) => onSelectDiagnostic(event.target.value)}
            disabled={isLoading || diagnosticOptions.length === 0}
            style={{
              padding: "0.65rem",
              borderRadius: "0.65rem",
              border: "1px solid #cbd2d9",
              background: isLoading ? "#f8fafc" : "white",
            }}
          >
            {diagnosticOptions.length === 0 ? (
              <option value="">診断が登録されていません</option>
            ) : (
              diagnosticOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.isActive ? "" : "（非アクティブ）"}
                </option>
              ))
            )}
          </select>
        </label>

        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontWeight: 600 }}>版（Draft）</span>
          <select
            value={selectedVersionId ?? ""}
            onChange={(event) => onSelectVersion(event.target.value)}
            disabled={!selectedDiagnosticId || isLoading}
            style={{
              padding: "0.65rem",
              borderRadius: "0.65rem",
              border: "1px solid #cbd2d9",
              background: !selectedDiagnosticId || isLoading ? "#f8fafc" : "white",
            }}
          >
            {!selectedDiagnosticId ? (
              <option value="">診断を選択してください</option>
            ) : filteredVersionOptions.length === 0 ? (
              <option value="">Draft 版が存在しません</option>
            ) : (
              filteredVersionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            )}
          </select>
        </label>

        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          style={{
            border: "1px dashed #94a3b8",
            borderRadius: "0.75rem",
            padding: "1rem",
            display: "grid",
            gap: "0.5rem",
            alignItems: "center",
            justifyItems: "center",
            background: "#f8fafc",
          }}
        >
          <span style={{ fontWeight: 600 }}>テンプレートファイルを選択</span>
          <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
            .xlsx ファイルをドラッグ&ドロップするか、下のボタンから選択してください
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            aria-label="テンプレートファイルを選択"
            onChange={handleInputChange}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "1px solid #2563eb",
              background: "white",
              color: "#2563eb",
              fontWeight: 600,
            }}
          >
            ファイルを選択
          </button>
          {file ? (
            <span style={{ fontSize: "0.85rem", color: "#0f172a" }}>{file.name}</span>
          ) : null}
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          style={{
            padding: "0.6rem 1rem",
            borderRadius: "9999px",
            border: "none",
            background: canSubmit ? "#15803d" : "#94a3b8",
            color: "white",
            fontWeight: 600,
            cursor: canSubmit ? "pointer" : "not-allowed",
          }}
        >
          {uploading ? "取り込み中..." : "取り込む"}
        </button>
      </form>

      {error ? (
        <div role="alert" style={{ color: "#b42318" }}>
          <p style={{ margin: 0 }}>{error}</p>
          {errorAction ? <p style={{ margin: 0 }}>{errorAction}</p> : null}
          {detail ? <p style={{ margin: 0 }}>{detail}</p> : null}
          {invalidCells.length > 0 ? (
            <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
              {invalidCells.map((cell) => (
                <li key={cell}>{cell}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div
          role="status"
          style={{
            background: "#ecfdf5",
            borderRadius: "0.75rem",
            padding: "0.75rem",
            border: "1px solid #86efac",
            color: "#14532d",
            display: "grid",
            gap: "0.5rem",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>インポートが完了しました。</p>
          <p style={{ margin: 0 }}>
            質問: {result.questions_imported} 件 / 選択肢: {result.options_imported} 件 / アウトカム: {result.outcomes_imported} 件
          </p>
          {result.warnings.length ? (
            <ul style={{ margin: 0, paddingLeft: "1.25rem" }}>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
