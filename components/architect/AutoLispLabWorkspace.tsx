"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

const DEFAULT_BRIEF = "Schematic plan, 20x20 m site. Two independent apartments, each exactly 3 bedrooms, 1 bathroom, 1 kitchen, 1 reception/living room. Add shared entrance and usable shared stair. Use millimetres; keep all geometry inside the site. Draw labeled rooms, walls with real door/window gaps and symbols, named layers, and overall dimensions. Choose your own layout. Concept only; no code or structural verification.";

type Generated = { source: string; model: string; usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null }; verified: false; executed: false };

function formatCost(value: number | null): string {
  return value === null ? "التكلفة غير متاحة من سجل المزود" : `$${value.toFixed(4)} حسب تقرير المزود`;
}

export function AutoLispLabWorkspace() {
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    if (busy || brief.trim().length === 0 || brief.length > 2000) return;
    setBusy(true); setError(""); setGenerated(null);
    try {
      const session = await getSupabaseBrowserClient()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("سجّل الدخول بحساب مالك التجربة أولًا.");
      const response = await fetch("/api/architect/lisp-lab", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brief }), cache: "no-store",
      });
      const data = await response.json() as Generated & { error?: string };
      if (!response.ok) throw new Error(data.error || "تعذر توليد المصدر");
      setGenerated(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر الاتصال بالموديل.");
    } finally { setBusy(false); }
  }

  function download() {
    if (!generated) return;
    const blob = new Blob([generated.source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "qattan-two-apartments.lsp"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main dir="rtl" className="min-h-screen bg-[#071014] px-4 py-7 text-white md:px-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / PRIVATE AUTOLISP PILOT</p><h1 className="mt-2 text-3xl font-bold">مولّد مخطط AutoLISP</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">يحوّل سونيت الطلب إلى ملف مصدر AutoLISP قابل للتنزيل. الطلب يرسل استدعاءً واحدًا، ولا يشغّل الخادم الكود المولّد.</p></div>
        <a href="/ar/architect/concept-studio" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300">العودة إلى استوديو المفاهيم</a>
      </header>

      <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <label htmlFor="lisp-brief" className="text-sm font-bold text-[#f1d985]">وصف المخطط</label>
        <textarea id="lisp-brief" value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={2000} rows={7} className="mt-3 w-full rounded-xl border border-white/15 bg-[#091216] p-4 text-sm leading-7 text-white outline-none focus:border-[#d4af37]" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{brief.length}/2000 حرف · Claude Sonnet 5.5</span><button type="button" onClick={generate} disabled={busy || !brief.trim() || brief.length > 2000} className="rounded-xl bg-[#d4af37] px-5 py-3 font-bold text-[#121a1e] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "سونيت يكتب المصدر…" : "ولّد ملف AutoLISP"}</button></div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
      </section>

      <aside className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-7 text-amber-100"><strong>ملف نصي غير منفذ أو متحقق هندسيًا.</strong> افتحه يدويًا في برنامج CAD متوافق مع AutoLISP بعد مراجعة محتواه. لم يجرِ تشغيل الملف أو اختباره داخل AutoCAD؛ راجع الوحدات والأبعاد والفتحات قبل استخدامه.</aside>

      {generated && <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">المصدر المقترح</h2><p className="mt-1 text-xs text-slate-500">{generated.model} · {formatCost(generated.usage.costUsd)}</p></div><button type="button" onClick={download} className="rounded-xl border border-[#d4af37]/60 px-4 py-2 text-sm font-bold text-[#f1d985]">تنزيل ‎.lsp</button></div>
        <pre dir="ltr" className="mt-4 max-h-[65vh] overflow-auto rounded-xl border border-white/10 bg-[#05090b] p-4 text-left text-xs leading-6 text-emerald-100"><code>{generated.source}</code></pre>
      </section>}
    </div>
  </main>;
}
