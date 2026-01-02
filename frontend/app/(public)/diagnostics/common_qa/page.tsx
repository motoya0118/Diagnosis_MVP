import { notFound } from "next/navigation";
import CommonQaScreen from "./CommonQaScreen";

const SUPPORTED_DIAGNOSTIC_CODES = new Set(["ai_career"]);

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DiagnosticCommonQaPage({ searchParams }: PageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
  const diagnosticCodeParam = resolvedParams?.diagnostic_code;
  const diagnosticCode = Array.isArray(diagnosticCodeParam) ? diagnosticCodeParam[0] : diagnosticCodeParam;

  if (!diagnosticCode || !SUPPORTED_DIAGNOSTIC_CODES.has(diagnosticCode)) {
    notFound();
  }

  return <CommonQaScreen diagnosticCode={diagnosticCode} />;
}
