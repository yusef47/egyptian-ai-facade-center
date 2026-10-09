import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlenderLabWorkspace } from "../../../../components/architect/BlenderLabWorkspace";
import { isBlenderLabEnabled } from "../../../../lib/architect/blender-lab";
import { requireArchitectAdminPage } from "../../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "Blender Lab | Qattan AI",
  robots: { index: false, follow: false },
};

export default async function BlenderLabPage() {
  await requireArchitectAdminPage();
  if (!isBlenderLabEnabled()) notFound();
  return <BlenderLabWorkspace />;
}
