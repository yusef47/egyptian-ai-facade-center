import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConceptStudioWorkspace } from "../../../../components/architect/ConceptStudioWorkspace";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";
import { isConceptBoardAvailable } from "../../../../lib/architect/concept-board";

export const metadata: Metadata = { title: "Architectural Concept Pilot | Qattan AI", robots: { index: false, follow: false } };

export default async function ConceptStudioPage() {
  await requireArchitectAdminPage();
  if (!isConceptBoardAvailable()) notFound();
  return <ConceptStudioWorkspace />;
}
