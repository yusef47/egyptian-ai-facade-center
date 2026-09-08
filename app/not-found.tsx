import Link from "next/link";

export default function NotFound() {
  return (
    <main className="qattan-not-found" dir="rtl">
      <p className="qattan-eyebrow">Qattan AI / قطان AI</p>
      <h1>الصفحة غير موجودة</h1>
      <p>ارجع إلى الاستوديو المعماري لاستكشاف أدوات التصور والتصميم.</p>
      <Link className="qattan-button qattan-button-primary" href="/ar">
        العودة إلى الصفحة الرئيسية
      </Link>
    </main>
  );
}
