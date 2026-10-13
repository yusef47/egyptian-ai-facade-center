import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CadBenchmarkWorkspace } from "../../../../components/architect/CadBenchmarkWorkspace";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "CAD Model Benchmark | Qattan AI",
  robots: { index: false, follow: false },
};

export default async function CadBenchmarkPage() {
  await requireArchitectAdminPage();
  if (!process.env.OPENROUTER_API_KEY?.trim()) notFound();
  return <CadBenchmarkWorkspace />;
}
