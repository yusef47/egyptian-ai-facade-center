import type { Metadata } from "next";
import { BlenderLabWorkspace } from "../../../components/architect/BlenderLabWorkspace";
import { isBlenderLabEnabled } from "../../../lib/architect/blender-lab";
import { requireArchitectAdminPage } from "../../../lib/architect/private-page";

export const metadata: Metadata = {
  title: "مساعد Blender المعماري | قطان AI",
  description:
    "محادثة معمارية تجريبية للأدمن تنفّذ نماذج Blender في بيئة معزولة وتعرض النتيجة ثلاثية الأبعاد.",
  alternates: {
    canonical: "/ar/architect",
    languages: { en: "/architect", ar: "/ar/architect", "x-default": "/architect" },
  },
  robots: { index: false, follow: false },
};

export default async function ArabicArchitectPage() {
  await requireArchitectAdminPage();
  if (!isBlenderLabEnabled()) {
    return <main dir="rtl" className="min-h-screen bg-[#071014] p-8 text-white">
      <h1 className="text-2xl font-bold">مساعد Blender غير مفعّل حاليًا</h1>
      <p className="mt-3 text-slate-300">إعداد تشغيل النموذج أو بيئة Blender غير مكتمل على الخادم.</p>
      <a href="/ar/architect/planner" className="mt-6 inline-block rounded-xl border border-white/20 px-4 py-2">افتح المخطط السابق</a>
    </main>;
  }
  return <BlenderLabWorkspace />;
}
