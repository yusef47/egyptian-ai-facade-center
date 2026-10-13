"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import type { ArchitecturalConcept } from "../../lib/architect/concept-board";
import { formatCadRepairFeedback, verifyCadProgressSnapshot } from "../../lib/architect/cad-agent-progress";

type Inspection = { counts: Record<string, number>; warnings: string[]; qualityChecksEvaluated?: boolean; qualityIssues?: { code: string; severity: "blocking" | "improvement"; ids: string[]; message: string }[]; unverifiedChecks?: string[]; objects: number; segments: number };
const MAX_STAGES = 6;
type Turn = { role: "user" | "assistant"; text: string };
const STORAGE = "qattan:cad-agent-project-v1";
const EXAMPLE = "على أرض 20 × 20 متر ارسم مخطط طابق فيه شقتين مستقلتين. كل شقة فيها 3 غرف نوم وحمام ومطبخ وريسبشن. وزّع الفراغات بنفسك، وارسم الحوائط والأبواب والشبابيك والأثاث الأساسي والسلم والمداخل بأبعاد واضحة.";

function newProjectId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => n.toString(16).padStart(2, "0")).join("");
}

function compactQualitySummary(issues: NonNullable<Inspection["qualityIssues"]>) {
  const unique = [...new Map(issues.map((issue) => [`${issue.code}:${issue.ids.join(",")}`, issue])).values()];
  return `${unique.slice(0, 4).map((issue) => issue.message).join(" · ")}${unique.length > 4 ? ` · وملاحظات أخرى (${unique.length - 4})` : ""}`;
}

export function CadAgentWorkspace({ selectedConcept, sourceBrief, conceptRunId, conceptBoardDataUrl }: { selectedConcept?: ArchitecturalConcept; sourceBrief?: string; conceptRunId?: string; conceptBoardDataUrl?: string } = {}) {
  const storageKey = selectedConcept
    ? `${STORAGE}:${conceptRunId ?? "legacy"}:${selectedConcept.id}:${selectedConcept.strategy}:${encodeURIComponent(`${selectedConcept.title}:${selectedConcept.idea}`).slice(0, 80)}`
    : STORAGE;
  const progressKey = `${storageKey}:progress`;
  const selectedBrief = selectedConcept
    ? (sourceBrief ?? "").slice(0, 1500)
    : EXAMPLE;
  const [projectId, setProjectId] = useState("");
  const [instruction, setInstruction] = useState(selectedBrief);
  const [width, setWidth] = useState(String(selectedConcept?.siteWidthM ?? 20));
  const [depth, setDepth] = useState(String(selectedConcept?.siteDepthM ?? 20));
  const [state, setState] = useState<"checking" | "installing" | "ready" | "error">("checking");
  const [status, setStatus] = useState("بنتحقق من بيئة FreeCAD...");
  const [preview, setPreview] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completedSteps, setCompletedSteps] = useState(0);
  const [resumableBrief, setResumableBrief] = useState<string | null>(null);
  const [qualityFeedback, setQualityFeedback] = useState("");
  const [setupAttempt, setSetupAttempt] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    const id = saved && /^[0-9a-f]{24}$/.test(saved) ? saved : newProjectId();
    localStorage.setItem(storageKey, id);
    setProjectId(id);
  }, [storageKey]);

  useEffect(() => {
    if (!projectId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async () => {
      try {
        const supabase = getSupabaseBrowserClient();
        const session = await supabase?.auth.getSession();
        const token = session?.data.session?.access_token;
        if (!token) throw new Error("سجّل دخولك بحساب الأدمن أولًا.");
        const response = await fetch(`/api/architect/cad-agent?projectId=${projectId}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const data = await response.json() as { state?: string; previewSvg?: string; inspection?: Inspection; error?: string };
        if (!response.ok) throw new Error(data.error || "تعذر فتح بيئة CAD");
        if (!active) return;
        if (data.state === "ready") {
          setState("ready"); setStatus("FreeCAD جاهز. المساعد يقدر يبدأ الرسم على المشروع المحفوظ.");
          if (data.previewSvg) setPreview(data.previewSvg);
          if (data.inspection) {
            setInspection(data.inspection);
            try {
              const saved = localStorage.getItem(progressKey);
              const checkpoint = saved ? verifyCadProgressSnapshot(JSON.parse(saved), { projectId, siteWidth: Number(width), siteDepth: Number(depth), inspection: data.inspection }) : null;
              if (checkpoint) {
                setCompletedSteps(checkpoint.completedSteps);
                setResumableBrief(checkpoint.brief);
                setQualityFeedback(checkpoint.qualityFeedback ?? "");
                setInstruction((current) => current === selectedBrief ? checkpoint.brief : current);
              } else {
                setCompletedSteps(0); setResumableBrief(null); setQualityFeedback("");
                if (saved) localStorage.removeItem(progressKey);
              }
            } catch { localStorage.removeItem(progressKey); }
          }
        } else if (data.state === "error") {
          setState("error"); setStatus("تعذر تجهيز FreeCAD على الخادم.");
        } else {
          setState("installing"); setStatus("بنجهّز نسخة FreeCAD الرسمية داخل بيئة سحابية محفوظة. أول مرة ممكن تستغرق عدة دقائق.");
          timer = setTimeout(check, 5000);
        }
      } catch (caught) {
        if (!active) return;
        setState("error"); setStatus(caught instanceof Error ? caught.message : "تعذر الاتصال");
      }
    };
    void check();
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [projectId, setupAttempt, progressKey, width, depth, selectedBrief]);

  async function retrySetup() {
    setError(""); setState("checking");
    try {
      const supabase = getSupabaseBrowserClient();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("سجّل دخولك بحساب الأدمن أولًا.");
      const response = await fetch("/api/architect/cad-agent", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "retry-setup", projectId }),
      });
      if (response.status !== 202) throw new Error("تعذر إعادة تجهيز FreeCAD");
      setSetupAttempt((value) => value + 1);
    } catch (caught) { setState("error"); setError(caught instanceof Error ? caught.message : "تعذر إعادة التجهيز"); }
  }

  async function run() {
    if (busy || state !== "ready" || !projectId || !instruction.trim()) return;
    const siteWidth = Number(width), siteDepth = Number(depth);
    if (!Number.isFinite(siteWidth) || !Number.isFinite(siteDepth) || siteWidth < 3 || siteWidth > 100 || siteDepth < 3 || siteDepth > 100) {
      setError("عرض وعمق الأرض لازم يكونوا بين 3 و100 متر."); return;
    }
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    let token = session?.data.session?.access_token;
    if (!token) { setError("سجّل دخولك بحساب الأدمن أولًا."); return; }
    const brief = instruction.trim();
    const startStep = resumableBrief === brief && completedSteps > 0 ? Math.min(completedSteps, MAX_STAGES - 1) : 0;
    setBusy(true); setError(""); setCompletedSteps(startStep);
    if (startStep === 0) { setResumableBrief(null); localStorage.removeItem(progressKey); }
    let completed = false;
    let feedbackForNextStage = qualityFeedback;
    setTurns((previous) => [...previous, { role: "user", text: brief }]);
    try {
      for (let step = startStep; step < MAX_STAGES; step++) {
        setStatus(`المساعد بيراجع اللوحة ويرسم المرحلة ${step + 1} من ${MAX_STAGES} داخل FreeCAD...`);
        let executionError: string | undefined = feedbackForNextStage || undefined;
        let data: { previewSvg?: string; inspection?: Inspection; summary?: string; selfReview?: string[]; requiredElements?: { requirement: string; status: "met" | "unresolved"; evidenceIds: string[]; evidence: string }[]; unresolvedItems?: string[]; modelDone?: boolean; done?: boolean; error?: string; state?: string; architectureReview?: { verdict: "ready" | "revise"; summary: string; issues: { dimension: string; severity: string; objectIds: string[]; finding: string; proposedEdit: string }[]; rubric: { dimension: string; status: string; evidenceIds: string[]; note: string }[] } | null } | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          const response = await fetch("/api/architect/cad-agent", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ projectId, instruction: brief, siteWidth, siteDepth, step, executionError, selectedConcept, conceptBoardDataUrl }),
          });
          data = await response.json();
          if (response.ok && data?.previewSvg) break;
          if (response.status === 202) throw new Error("FreeCAD لسه بيتجهز. انتظر لحد ما تظهر كلمة جاهز وجرب تاني.");
          if (attempt === 1 || !data?.error?.includes("FreeCAD")) throw new Error(data?.error || "تعذر تنفيذ خطوة الرسم");
          executionError = data.error;
          setStatus(`FreeCAD أبلغ عن خطأ؛ المساعد بيصلح الخطوة ${step + 1}...`);
          const refreshed = await supabase?.auth.refreshSession();
          token = refreshed?.data.session?.access_token ?? token;
        }
        if (!data?.previewSvg || !data.inspection) throw new Error("FreeCAD لم يُرجع لوحة رسم صالحة");
        setPreview(data.previewSvg); setInspection(data.inspection); setCompletedSteps(step + 1); setResumableBrief(brief);
        const reviewFeedback = data.architectureReview?.verdict === "revise"
          ? formatCadRepairFeedback(data.architectureReview, data.inspection.qualityIssues ?? [])
          : "";
        if (reviewFeedback) { feedbackForNextStage = reviewFeedback; setQualityFeedback(reviewFeedback); }
        else if (data.architectureReview?.verdict === "ready") { feedbackForNextStage = ""; setQualityFeedback(""); }
        try { localStorage.setItem(progressKey, JSON.stringify({ projectId, brief, siteWidth, siteDepth, completedSteps: step + 1, counts: data.inspection.counts, objects: data.inspection.objects, segments: data.inspection.segments, qualityFeedback: feedbackForNextStage })); } catch { /* Keep the in-memory resume cursor when browser storage is unavailable. */ }
        setTurns((previous) => [...previous, { role: "assistant", text: `${data?.summary ?? `اكتملت المرحلة ${step + 1}`}${data?.selfReview?.length ? `\nمراجعة الرسم قبل التنفيذ: ${data.selfReview.join(" · ")}` : ""}${data?.architectureReview ? `\nالمراجعة المعمارية بعد التنفيذ (${data.architectureReview.verdict === "ready" ? "مستعدة للمراجعة البشرية" : "تحتاج تعديلًا"}): ${data.architectureReview.summary}${data.architectureReview.issues.length ? ` · ${data.architectureReview.issues.slice(0, 4).map((issue) => `${issue.finding} → ${issue.proposedEdit}`).join(" · ")}` : ""}` : ""}${data?.inspection?.qualityIssues?.length ? `\nأهم فحوص التخطيط: ${compactQualitySummary(data.inspection.qualityIssues)}` : ""}${data?.requiredElements?.length ? `\nمتطلبات الطلب: ${data.requiredElements.map((item) => `${item.status === "met" ? "متحقق" : "غير متحقق"}: ${item.requirement} (${item.evidenceIds.join(", ")})`).join(" · ")}` : ""}${data?.unresolvedItems?.length ? `\nنقاط ما زالت مفتوحة: ${data.unresolvedItems.join(" · ")}` : ""}${data?.modelDone && !data?.done ? "\nالموديل اقترح اكتمال الطلب، لكن المراجعة بعد التنفيذ أو فحوص الرسم لم تسمح بتأكيده." : ""}` }]);
        if (data.done) { completed = true; break; }
      }
      setStatus(completed
        ? "الموديل يقول إن متطلبات الطلب اكتملت وفحوص الهندسة التخطيطية نجحت. راجع المخطط بنفسك؛ فحص الوصول تقريبي ولا يثبت الإخلاء أو إمكانية الوصول، والإنشاء والكود غير معتمدين."
        : `انتهت ${MAX_STAGES} مراحل محفوظة دون اكتمال مؤكد. راجع ملاحظات المراجعة ثم ابدأ جولة محدودة أخرى على المشروع الحالي.`);
      if (completed) setInstruction("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
      setStatus("توقفنا عند آخر خطوة محفوظة. تقدر تصلّح الطلب أو تعيد المحاولة.");
    } finally { setBusy(false); }
  }

  async function download(kind: "fcstd" | "dxf") {
    try {
      const supabase = getSupabaseBrowserClient();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("سجّل دخولك بحساب الأدمن أولًا.");
      const response = await fetch(`/api/architect/cad-agent?projectId=${projectId}&file=${kind}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error("تعذر تنزيل ملف CAD");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = `qattan-cad-project.${kind === "fcstd" ? "FCStd" : "dxf"}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر التنزيل"); }
  }

  async function undo() {
    try {
      const supabase = getSupabaseBrowserClient();
      const session = await supabase?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("سجّل دخولك بحساب الأدمن أولًا.");
      setBusy(true); setError("");
      const response = await fetch("/api/architect/cad-agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "undo", projectId }) });
      const data = await response.json();
      if (!response.ok || !data.previewSvg || !data.inspection) throw new Error(data.error || "لا توجد نسخة سابقة للتراجع إليها");
      setPreview(data.previewSvg); setInspection(data.inspection); setCompletedSteps(0); setResumableBrief(null); localStorage.removeItem(progressKey); setStatus("تم الرجوع إلى النسخة السابقة من الرسم.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر التراجع"); }
    finally { setBusy(false); }
  }

  function reset() {
    const id = newProjectId();
    localStorage.setItem(storageKey, id); setProjectId(id); setState("checking");
    localStorage.removeItem(progressKey);
    setPreview(null); setInspection(null); setTurns([]); setCompletedSteps(0); setResumableBrief(null); setQualityFeedback(""); setError(""); setInstruction(selectedConcept ? selectedBrief : EXAMPLE);
  }

  return <main dir="rtl" className="min-h-screen bg-[#071014] px-4 py-6 text-white md:px-7">
    <div className="mx-auto max-w-[1700px]">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / CAD AGENT LAB</p><h1 className="mt-2 text-3xl font-bold">المساعد يرسم داخل FreeCAD</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">المشروع محفوظ داخل بيئة سحابية؛ كل مرحلة تضيف عناصر CAD حقيقية، والمساعد يراجع اللوحة قبل ما يكمل.</p></div>
        <div className="flex flex-wrap gap-2"><a href="/ar/architect/concept-studio" className="rounded-xl border border-[#d4af37]/50 px-4 py-2 text-sm text-[#f1d985] hover:bg-white/10">استوديو المفاهيم A/B/C</a><a href="/ar/architect/blender-lab" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300 hover:bg-white/10">مختبر Blender</a></div>
      </header>
      <div className="grid gap-4 lg:grid-cols-[390px_minmax(0,1fr)]">
        <section className="flex min-h-[680px] flex-col rounded-2xl border border-white/10 bg-[#101c21] p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">عرض الأرض بالمتر<input type="number" min="3" max="100" value={width} disabled={Boolean(selectedConcept)} onChange={(e) => setWidth(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#17282e] p-2 text-white disabled:opacity-60" /></label>
            <label className="text-sm text-slate-300">عمق الأرض بالمتر<input type="number" min="3" max="100" value={depth} disabled={Boolean(selectedConcept)} onChange={(e) => setDepth(e.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#17282e] p-2 text-white disabled:opacity-60" /></label>
          </div>
          <div className="mt-4 rounded-xl border border-[#d4af37]/25 bg-[#252419] p-3 text-sm leading-6 text-[#eee0aa]" aria-live="polite">{status}</div>
          {state === "installing" && <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-[#d4af37]" /></div>}
          {state === "error" && <button type="button" onClick={() => void retrySetup()} className="mt-3 rounded-xl border border-amber-400/40 px-3 py-2 text-sm text-amber-200">أعد تجهيز FreeCAD</button>}
          <div className="mt-5 flex-1 space-y-3 overflow-y-auto">
            {turns.length === 0 && <p className="rounded-xl bg-[#18292f] p-3 text-sm leading-7 text-slate-400">اكتب وصف المخطط اللي عايزه. المساعد هيرسمه خطوة بخطوة؛ تقدر تطلب تعديل على نفس المشروع بعد النتيجة.</p>}
            {turns.map((turn, i) => <div key={i} className={`rounded-xl p-3 text-sm leading-7 ${turn.role === "user" ? "bg-[#203842]" : "bg-[#293023]"}`}>{turn.text}</div>)}
            {qualityFeedback && <div className="rounded-xl border border-amber-400/30 bg-amber-950/40 p-3 text-xs leading-6 text-amber-100"><strong>أولويات الإصلاح المحفوظة:</strong><pre className="mt-2 whitespace-pre-wrap font-sans">{qualityFeedback}</pre></div>}
          </div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
          <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={5} maxLength={1500} placeholder="اوصف المخطط أو التعديل اللي عايزه..." className="mt-4 w-full resize-none rounded-xl border border-white/15 bg-[#17282e] p-3 text-sm leading-7 text-white focus:border-[#d4af37] focus:outline-none" />
          <button type="button" disabled={state !== "ready" || busy || !instruction.trim()} onClick={() => void run()} className="mt-3 rounded-xl bg-[#d4af37] p-3 font-bold text-[#121a1e] disabled:opacity-40">{busy ? `بيشتغل على المرحلة ${Math.min(completedSteps + 1, MAX_STAGES)}...` : preview ? qualityFeedback ? "تابع التعديلات المعمارية" : "نفّذ التعديل في CAD" : "ابدأ الرسم في CAD"}</button>
        </section>
        <section className="space-y-3">
          <div className="relative grid min-h-[580px] place-items-center overflow-hidden rounded-2xl border border-white/10 bg-[#09151d] p-4" style={{ backgroundImage: "linear-gradient(#142935 1px,transparent 1px),linear-gradient(90deg,#142935 1px,transparent 1px)", backgroundSize: "32px 32px" }}>
            {preview ? <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} alt="لوحة CAD الحالية من مشروع FreeCAD" className="max-h-[76vh] w-full object-contain" /> : <p className="text-center text-slate-400">لوحة CAD هتظهر هنا بعد أول خطوة رسم حقيقية</p>}
            <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-[#0a151bdc] px-3 py-2 text-xs text-slate-300">{completedSteps ? `${completedSteps} مراحل اكتملت` : "مشروع جديد"} · {inspection?.objects ?? 0} عنصر</div>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-[#101c21] p-4">
            <button type="button" disabled={!preview || busy} onClick={() => void download("fcstd")} className="rounded-xl border border-[#d4af37]/50 px-4 py-2 text-sm text-[#f1d985] disabled:opacity-40">تنزيل مشروع FreeCAD</button>
            <button type="button" disabled={!preview || busy} onClick={() => void download("dxf")} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">تنزيل DXF</button>
            <button type="button" disabled={!preview || busy} onClick={() => void undo()} className="rounded-xl border border-amber-300/30 px-4 py-2 text-sm text-amber-100 disabled:opacity-40">تراجع عن آخر نسخة</button>
            <button type="button" disabled={busy} onClick={reset} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">مشروع جديد</button>
            {inspection && <span className="text-xs text-slate-400">{inspection.segments} خط/قوس في الرسم · {inspection.counts.WALL ?? 0} حائط · {inspection.counts.BEAM ?? 0} كمرة تخطيطية · {inspection.counts.COLUMN ?? 0} عمود تخطيطي · {inspection.counts.DOOR ?? 0} باب · {inspection.counts.HATCH ?? 0} تهشير</span>}
          </div>
          {inspection?.warnings?.length ? <div className="rounded-2xl border border-amber-500/30 bg-amber-950/30 p-4 text-xs leading-6 text-amber-100"><strong>ملاحظات الفحص:</strong> {inspection.warnings.slice(0, 5).join(" · ")}</div> : null}
          {selectedConcept && inspection && inspection.qualityChecksEvaluated === false ? <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-4 text-xs leading-6 text-sky-100">سيُعاد فحص المسقط هندسيًا ومعماريًا بعد خطوة الرسم التالية؛ الحالة المحفوظة وحدها لا تعني اجتياز الفحوص.</div> : null}
          {inspection?.unverifiedChecks?.length ? <div className="rounded-2xl border border-sky-500/20 bg-sky-950/20 p-4 text-xs leading-6 text-sky-100"><strong>فحوص غير متاحة آليًا:</strong> {inspection.unverifiedChecks.join(" · ")}</div> : null}
          <p className="text-xs leading-6 text-slate-500">الكمرات والأعمدة والسلالم والأثاث عناصر تخطيطية فقط؛ والتهشير خطوط CAD مستقلة وليست Hatch مرتبطًا بحدوده. لا يوجد تصميم أو تحقق إنشائي. راجع المخطط مع مهندس مختص قبل أي استخدام تنفيذي أو قانوني.</p>
        </section>
      </div>
    </div>
  </main>;
}
