import type { Metadata } from "next";
import ArchitectWorkspace from "../../../components/architect/ArchitectWorkspace";
import { requireArchitectAdminPage } from "../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "مساحة العمل المعمارية | قطان AI",
  description:
    "مساحة عمل مفاهيمية تفاعلية: عدّل المخطط السكني (حجم الموقع، نسبة التقاسم، جانب النواة) عبر المحادثة بجانب لوحة مخطط حيّة مع تصدير SVG وDXF.",
  alternates: {
    canonical: "/ar/architect",
    languages: { en: "/architect", ar: "/ar/architect", "x-default": "/architect" },
  },
  robots: { index: false, follow: false },
};

export default async function ArabicArchitectPage() {
  await requireArchitectAdminPage();
  return <ArchitectWorkspace locale="ar" />;
}
