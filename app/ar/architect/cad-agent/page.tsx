import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CadAgentWorkspace } from "../../../../components/architect/CadAgentWorkspace";
import { cadAgentAvailable } from "../../../../lib/architect/cad-agent";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "CAD Agent Lab | Qattan AI",
  robots: { index: false, follow: false },
};

export default async function CadAgentPage() {
  await requireArchitectAdminPage();
  if (!cadAgentAvailable()) notFound();
  return <CadAgentWorkspace />;
}
