import type { Metadata } from "next";
import ArchitectWorkspace from "../../components/architect/ArchitectWorkspace";
import { requireArchitectAdminPage } from "../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "Architect Workspace | Qattan AI",
  description:
    "Conversational concept-plan workspace: chat to adjust a residential concept (site size, unit split, core side) beside a live plan canvas with SVG and DXF export.",
  alternates: {
    canonical: "/architect",
    languages: { en: "/architect", ar: "/ar/architect", "x-default": "/architect" },
  },
  robots: { index: false, follow: false },
};

export default async function ArchitectPage() {
  await requireArchitectAdminPage();
  return <ArchitectWorkspace locale="en" />;
}
