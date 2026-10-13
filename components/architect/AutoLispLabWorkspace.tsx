"use client";

import { useEffect, useState } from "react";
import { LispSseParser } from "../../lib/architect/lisp-sse";
import { getSupabaseBrowserClient } from "../../lib/supabase";

const DEFAULT_BRIEF = "Schematic plan, 20x20 m site. Two independent apartments, each exactly 3 bedrooms, 1 bathroom, 1 kitchen, 1 reception/living room. Add shared entrance and usable shared stair. Use millimetres; keep all geometry inside the site. Draw labeled rooms, walls with real door/window gaps and symbols, named layers, and overall dimensions. Choose your own layout. Concept only; no code or structural verification.";
const STAGES = ["layout", "helpers", "shell", "interior"] as const;
const STAGE_LABELS: Record<(typeof STAGES)[number], string> = { layout: "تخطيط توزيع الفراغات", helpers: "إنشاء دوال الرسم", shell: "رسم المحيط والفتحات والسلم", interior: "إضافة الغرف والأبعاد" };
const PROGRESS_KEY = "qattan-lisp-job-v2";

type Plan = { siteMm: [number, number]; walls: unknown[]; openings: unknown[]; rooms: unknown[]; stair: unknown };
type Usage = { promptTokens: number | null; completionTokens: number | null; costUsd: number | null };
type Job = { brief: string; nextStage: number; plan?: Plan; parts: string[]; usage: Usage };
type Generated = { source: string; model: string; usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null }; verified: false; executed: false };

function formatCost(value: number | null): string { return value === null ? "التكلفة غير متاحة من سجل المزود" : `$${value.toFixed(4)} حسب تقرير المزود`; }
function blankJob(brief: string): Job { return { brief, nextStage: 0, parts: [], usage: { promptTokens: 0, completionTokens: 0, costUsd: 0 } }; }
function isJob(value: unknown): value is Job {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<Job>;
  const validUsage = !!job.usage && [job.usage.promptTokens, job.usage.completionTokens, job.usage.costUsd].every((n) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0));
  return typeof job.brief === "string" && job.brief.trim().length > 0 && job.brief.length <= 2000 && Number.isInteger(job.nextStage) && (job.nextStage as number) >= 0 && (job.nextStage as number) <= STAGES.length && Array.isArray(job.parts) && job.parts.length === Math.max(0, (job.nextStage as number) - 1) && job.parts.every((part) => typeof part === "string") && job.parts.join("").length <= 80_000 && (job.nextStage === 0 || (!!job.plan && typeof job.plan === "object")) && validUsage;
}

export function AutoLispLabWorkspace() {
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [job, setJob] = useState<Job | null>(null);
  const [liveText, setLiveText] = useState("");
  const [stageStatus, setStageStatus] = useState("");
  const [generated, setGenerated] = useState<Generated | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try { const saved = sessionStorage.getItem(PROGRESS_KEY); if (saved) { const parsed: unknown = JSON.parse(saved); if (isJob(parsed)) { setJob(parsed); setBrief(parsed.brief); } } } catch { /* progress remains in memory only */ }
  }, []);

  function saveJob(next: Job) {
    setJob(next);
    try { sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(next)); } catch { /* staged work can continue in memory */ }
  }

  async function getToken() {
    const session = await getSupabaseBrowserClient()?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("سجّل الدخول بحساب مالك التجربة أولًا.");
    return token;
  }

  async function readStage(response: Response, onText: (text: string) => void, onHeartbeat: () => void): Promise<Record<string, unknown>> {
    if (!response.ok) {
      let data: { error?: string } = {};
      try { data = await response.json() as { error?: string }; } catch { /* generic */ }
      throw new Error(data.error || "تعذر بدء مرحلة الرسم.");
    }
    if (!response.body) throw new Error("اتصال البث غير متاح.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new LispSseParser();
    let completion: Record<string, unknown> | null = null;
    const handle = (events: Array<{ event: string; data: unknown }>) => {
      for (const item of events) {
        const payload = item.data && typeof item.data === "object" ? item.data as Record<string, unknown> : {};
        if (item.event === "delta" && typeof payload.text === "string") onText(payload.text);
        if (item.event === "heartbeat") onHeartbeat();
        if (item.event === "complete") completion = payload;
        if (item.event === "error") throw new Error(typeof payload.message === "string" ? payload.message : "لم تكتمل المرحلة.");
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      handle(parser.push(decoder.decode(value, { stream: true })));
    }
    handle(parser.push(decoder.decode()));
    handle(parser.finish());
    if (!completion) throw new Error("انقطع البث قبل اعتماد المرحلة.");
    return completion;
  }

  async function generate() {
    if (busy || !brief.trim() || brief.length > 2000) return;
    const activeJob = job?.brief === brief ? job : blankJob(brief);
    setBusy(true); setError(""); setGenerated(null); setLiveText("");
    let current = activeJob;
    saveJob(current);
    try {
      const token = await getToken();
      for (let index = current.nextStage; index < STAGES.length; index++) {
        const stage = STAGES[index];
        setStageStatus(`${index + 1}/${STAGES.length} · ${STAGE_LABELS[stage]} · انتظار استجابة سونيت`);
        setLiveText("");
        let live = "";
        const response = await fetch("/api/architect/lisp-lab", {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ stage, brief: current.brief, plan: current.plan, priorSource: current.parts.join("\n\n") }), cache: "no-store",
        });
        let heartbeatCount = 0;
        const result = await readStage(response, (text) => { live += text; setLiveText(live); setStageStatus(`${index + 1}/${STAGES.length} · ${STAGE_LABELS[stage]} · يستقبل المصدر تدريجيًا`); }, () => { heartbeatCount += 1; setStageStatus(`${index + 1}/${STAGES.length} · ${STAGE_LABELS[stage]} · سونيت يعالج الطلب (${heartbeatCount * 10} ث)`); });
        const usageRaw = result.usage && typeof result.usage === "object" ? result.usage as Record<string, unknown> : {};
        const addUsage = (previous: number | null, value: unknown) => previous !== null && typeof value === "number" && Number.isFinite(value) ? previous + value : null;
        const usage: Usage = { promptTokens: addUsage(current.usage.promptTokens, usageRaw.promptTokens), completionTokens: addUsage(current.usage.completionTokens, usageRaw.completionTokens), costUsd: addUsage(current.usage.costUsd, usageRaw.costUsd) };
        if (usage.completionTokens !== null && usage.completionTokens > 100_000) throw new Error("تجاوزت مراحل التوليد ميزانية المخرجات المحددة.");
        const output = typeof result.output === "string" ? result.output : null;
        if (output === null || !output.trim()) throw new Error("وصلت نتيجة مرحلة غير مكتملة؛ لم يتم اعتمادها.");
        const nextPlan = stage === "layout" && result.plan && typeof result.plan === "object" ? result.plan as Plan : current.plan;
        if (stage === "layout" && !nextPlan) throw new Error("لم يصل مخطط توزيع صالح؛ لم يتم اعتماد المرحلة.");
        const nextParts = stage === "layout" ? current.parts : [...current.parts, `${output.trim()}\n`];
        if (nextParts.join("\n").length > 80_000) throw new Error("تجاوز المصدر المجمع حد الحجم؛ لم يتم اعتماد الملف.");
        current = { brief: current.brief, nextStage: index + 1, plan: nextPlan, parts: nextParts, usage };
        saveJob(current);
      }
      setStageStatus("التحقق النهائي من المصدر المجمع");
      const finalResponse = await fetch("/api/architect/lisp-lab", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stage: "finalize", brief: current.brief, plan: current.plan, parts: current.parts }), cache: "no-store",
      });
      const finalData = await finalResponse.json() as Generated & { error?: string };
      if (!finalResponse.ok) throw new Error(finalData.error || "لم يجتز المصدر المجمع التحقق النهائي.");
      setGenerated({ ...finalData, usage: { promptTokens: current.usage.promptTokens, completionTokens: current.usage.completionTokens, costUsd: current.usage.costUsd } });
      setStageStatus("اجتاز المصدر فحوص الاكتمال البنيوي والمحتوى المحظور؛ لم يُشغّل داخل CAD.");
      try { sessionStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
      setJob(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر الاتصال بالموديل.");
      setStageStatus(current.nextStage > 0 ? `توقفت بعد ${current.nextStage} مراحل مكتملة؛ يمكنك الاستكمال من المرحلة التالية.` : "لم تكتمل أي مرحلة بعد.");
      saveJob(current);
    } finally { setBusy(false); }
  }

  function startOver() {
    try { sessionStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
    setJob(null); setGenerated(null); setError(""); setStageStatus(""); setLiveText("");
  }

  function download() {
    if (!generated) return;
    const blob = new Blob([generated.source], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "qattan-two-apartments.lsp"; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const canResume = job?.brief === brief && job.nextStage > 0 && job.nextStage <= STAGES.length;
  return <main dir="rtl" className="min-h-screen bg-[#071014] px-4 py-7 text-white md:px-8">
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / PRIVATE AUTOLISP PILOT</p><h1 className="mt-2 text-3xl font-bold">مولّد مخطط AutoLISP</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">سونيت يبني المخطط على مراحل متصلة؛ يظهر التقدم أثناء البث. لا يُتاح التنزيل قبل اكتمال جميع المراحل وفحص المصدر، ولا يشغّل الخادم الكود.</p></div>
        <a href="/ar/architect/concept-studio" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300">العودة إلى استوديو المفاهيم</a>
      </header>
      <section className="mt-7 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <label htmlFor="lisp-brief" className="text-sm font-bold text-[#f1d985]">وصف المخطط</label>
        <textarea id="lisp-brief" value={brief} onChange={(event) => setBrief(event.target.value)} disabled={busy} maxLength={2000} rows={6} className="mt-3 w-full rounded-xl border border-white/15 bg-[#091216] p-4 text-sm leading-7 text-white outline-none focus:border-[#d4af37] disabled:opacity-70" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{brief.length}/2000 حرف · Claude Sonnet 5.5 · حتى 4 مراحل متصلة</span><div className="flex gap-2"><button type="button" onClick={generate} disabled={busy || !brief.trim() || brief.length > 2000} className="rounded-xl bg-[#d4af37] px-5 py-3 font-bold text-[#121a1e] disabled:cursor-not-allowed disabled:opacity-50">{busy ? "سونيت يعمل على المرحلة…" : canResume ? "استكمل المراحل المتبقية" : "ابدأ توليد المخطط"}</button>{job && !busy && <button type="button" onClick={startOver} className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300">ابدأ من جديد</button>}</div></div>
        {stageStatus && <p aria-live="polite" className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#d4af37]/[0.06] p-3 text-sm text-[#f1d985]">{stageStatus}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {busy && liveText && <pre dir="ltr" aria-label="المصدر الجاري توليده" className="mt-3 max-h-56 overflow-auto rounded-xl border border-white/10 bg-[#05090b] p-3 text-left text-xs text-emerald-100">{liveText.slice(-12_000)}</pre>}
        {job?.brief === brief && !generated && <p className="mt-3 text-xs text-slate-500">مراحل مكتملة: {job.nextStage}/{STAGES.length} · مخرجات Sonnet: {job.usage.completionTokens === null ? "بيانات الاستخدام غير متاحة" : `${job.usage.completionTokens} tokens`}</p>}
      </section>
      <aside className="mt-5 rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm leading-7 text-amber-100"><strong>مخطط مفاهيمي فقط؛ فحوص الخادم بنيوية وساكنة ولا تثبت اكتمال البرنامج أو جودة التوزيع أو مطابقة الكود.</strong> الملف غير منفذ أو متحقق هندسيًا. افتحه يدويًا في برنامج CAD متوافق مع AutoLISP بعد مراجعة محتواه. لم يجرِ تشغيله أو اختباره داخل AutoCAD؛ راجع الوحدات والأبعاد والفتحات قبل استخدامه.</aside>
      {generated && <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">المصدر المقترح</h2><p className="mt-1 text-xs text-slate-500">{generated.model} · {formatCost(generated.usage.costUsd)} · {generated.usage.completionTokens === null ? "بيانات الاستخدام غير متاحة" : `${generated.usage.completionTokens} output tokens`}</p></div><button type="button" onClick={download} className="rounded-xl border border-[#d4af37]/60 px-4 py-2 text-sm font-bold text-[#f1d985]">تنزيل ‎.lsp</button></div><pre dir="ltr" className="mt-4 max-h-[65vh] overflow-auto rounded-xl border border-white/10 bg-[#05090b] p-4 text-left text-xs leading-6 text-emerald-100"><code>{generated.source}</code></pre></section>}
    </div>
  </main>;
}
