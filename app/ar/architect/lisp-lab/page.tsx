import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AutoLispLabWorkspace } from "../../../../components/architect/AutoLispLabWorkspace";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";
import { isConceptBoardAvailable } from "../../../../lib/architect/concept-board";

export const metadata: Metadata = { title: "AutoLISP Plan Pilot | Qattan AI", robots: { index: false, follow: false } };

export default async function AutoLispLabPage() {
  await requireArchitectAdminPage();
  if (!isConceptBoardAvailable()) notFound();
  return <AutoLispLabWorkspace />;
}
