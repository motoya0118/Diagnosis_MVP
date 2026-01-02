import { notFound, redirect } from "next/navigation";

import { ResultScreen } from "../../../../../features/diagnostics/result";
import { DiagnosticSessionProvider } from "../../../../../features/diagnostics/session";

const SUPPORTED_DIAGNOSTIC_CODES = new Set(["ai_career"]);

type PageProps = {
  params: Promise<{ diagnostic_code: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiagnosticResultPage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const diagnosticCode = resolvedParams.diagnostic_code;
  if (!SUPPORTED_DIAGNOSTIC_CODES.has(diagnosticCode)) {
    notFound();
  }

  const query = searchParams ? await searchParams : {};
  const rawCode = query.session_code;
  const sessionCode = Array.isArray(rawCode) ? rawCode[0] : rawCode;

  if (!sessionCode || typeof sessionCode !== "string" || !sessionCode.trim()) {
    redirect(`/diagnostics/common_qa?diagnostic_code=${encodeURIComponent(diagnosticCode)}`);
  }

  return (
    <DiagnosticSessionProvider diagnosticCode={diagnosticCode}>
      <ResultScreen diagnosticCode={diagnosticCode} sessionCode={sessionCode.trim()} />
    </DiagnosticSessionProvider>
  );
}
