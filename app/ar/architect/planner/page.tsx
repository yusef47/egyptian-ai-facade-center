import type { Metadata } from "next";
import ArchitectWorkspace from "../../../../components/architect/ArchitectWorkspace";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "المخطط المعماري | قطان AI",
  robots: { index: false, follow: false },
};

export default async function ArchitectPlannerPage() {
  await requireArchitectAdminPage();
  return <ArchitectWorkspace locale="ar" />;
}
