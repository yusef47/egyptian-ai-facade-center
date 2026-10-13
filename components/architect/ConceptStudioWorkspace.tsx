"use client";

import { useEffect, useState } from "react";
import { CadAgentWorkspace } from "./CadAgentWorkspace";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import type { ArchitecturalConcept, ConceptChatTurn, ConceptDialogue } from "../../lib/architect/concept-board";

type ChatLine = { role: "user" | "assistant"; content: string };
type SavedState = { brief: string; sourceBrief?: string | null; conceptRunId?: string | null; history: ConceptChatTurn[]; chat?: ChatLine[]; concepts: ArchitecturalConcept[] | null; boardImageDataUrl: string | null; boardIdentity?: string | null; selectedId: "A" | "B" | "C" | null; dialogueCostUsd: number | null; boardCostUsd: number | null };
const STORAGE_KEY = "qattan:architect-concept-pilot-v1";
const DEFAULT_BRIEF = "على أرض 20×20 متر أريد شقتين مستقلتين، كل واحدة فيها 3 غرف نوم وحمام ومطبخ وريسبشن، مع سلم ومدخل مشترك. اقترح ثلاث توزيعات مختلفة للحركة والخصوصية.";
const ASSUMPTIONS_INSTRUCTION = "Proceed with reasonable stated assumptions. Do not ask another question; summarize any assumptions and produce concepts.";

export function freezeConceptSourceBrief(originalBrief: string, turns: ConceptChatTurn[], maxLength = 1500): string {
  const followUps = turns
    .filter((turn) => turn.role === "user" && turn.content.trim() && turn.content.trim() !== ASSUMPTIONS_INSTRUCTION)
    .map((turn) => turn.content.trim());
  const kept: string[] = [];
  const prefix = "\n\nتوضيحات المستخدم: ";
  for (const item of followUps.slice().reverse()) {
    const candidate = [...kept, item].join("\n");
    const available = maxLength - prefix.length - candidate.length;
    if (available >= 0) kept.unshift(item);
    else if (!kept.length && maxLength > prefix.length) kept.unshift(item.slice(-(maxLength - prefix.length)));
    else break;
  }
  const suffix = kept.length ? `${prefix}${kept.join("\n")}` : "";
  const original = originalBrief.trim().slice(0, Math.max(0, maxLength - suffix.length));
  return `${original}${suffix}`.slice(0, maxLength);
}

function formatUsd(value: number | null): string {
  return value === null ? "التكلفة الفعلية غير متاحة من سجل المزود" : `$${value.toFixed(4)} حسب تقرير المزود`;
}

export function ConceptStudioWorkspace() {
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [followUp, setFollowUp] = useState("");
  const [history, setHistory] = useState<ConceptChatTurn[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [concepts, setConcepts] = useState<ArchitecturalConcept[] | null>(null);
  const [sourceBrief, setSourceBrief] = useState<string | null>(null);
  const [conceptRunId, setConceptRunId] = useState<string | null>(null);
  const [board, setBoard] = useState<string | null>(null);
  const [boardIdentity, setBoardIdentity] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<"A" | "B" | "C" | null>(null);
  const [cadStarted, setCadStarted] = useState(false);
  const [dialogueCostUsd, setDialogueCostUsd] = useState<number | null>(null);
  const [boardCostUsd, setBoardCostUsd] = useState<number | null>(null);
  const [busy, setBusy] = useState<"dialogue" | "board" | null>(null);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as SavedState;
        if (typeof saved.brief === "string" && saved.brief.length <= 1500) setBrief(saved.brief);
        if (typeof saved.sourceBrief === "string" && saved.sourceBrief.length <= 1500) setSourceBrief(saved.sourceBrief);
        if (typeof saved.conceptRunId === "string" && /^[0-9a-f-]{36}$/i.test(saved.conceptRunId)) setConceptRunId(saved.conceptRunId);
        if (Array.isArray(saved.history)) setHistory(saved.history.slice(-8));
        if (Array.isArray(saved.chat)) setChat(saved.chat.slice(-16));
        if (Array.isArray(saved.concepts)) setConcepts(saved.concepts);
        if (typeof saved.boardImageDataUrl === "string" && saved.boardImageDataUrl.length <= 2_000_000) {
          setBoard(saved.boardImageDataUrl);
          if (typeof saved.boardIdentity === "string" && saved.boardIdentity.length <= 100) setBoardIdentity(saved.boardIdentity);
          else setBoardIdentity(`restored-${saved.boardImageDataUrl.length}-${saved.boardImageDataUrl.slice(0, 48)}`);
        }
        if (saved.selectedId === "A" || saved.selectedId === "B" || saved.selectedId === "C") setSelectedId(saved.selectedId);
        setDialogueCostUsd(typeof saved.dialogueCostUsd === "number" ? saved.dialogueCostUsd : null);
        setBoardCostUsd(typeof saved.boardCostUsd === "number" ? saved.boardCostUsd : null);
      }
    } catch { localStorage.removeItem(STORAGE_KEY); }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const saved: SavedState = { brief, sourceBrief, conceptRunId, history, chat, concepts, boardImageDataUrl: board, boardIdentity, selectedId, dialogueCostUsd, boardCostUsd };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* Keep this session usable if browser storage is full. */ }
  }, [hydrated, brief, sourceBrief, conceptRunId, history, chat, concepts, board, boardIdentity, selectedId, dialogueCostUsd, boardCostUsd]);

  async function accessToken() {
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("سجّل الدخول بحساب أحد مالكي التجربة أولًا.");
    return token;
  }

  async function callDialogue(message: string, initial: boolean) {
    if (!message.trim() || busy) return;
    setBusy("dialogue"); setError("");
    const newHistory = initial ? [] : [...history, { role: "user" as const, content: message.trim() }].slice(-8);
    try {
      const token = await accessToken();
      const response = await fetch("/api/architect/concept-board", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "dialogue", brief: initial ? message.trim() : brief, history: newHistory }) });
      const data = await response.json() as ConceptDialogue & { error?: string; costUsd?: number | null };
      if (!response.ok) throw new Error(data.error || "تعذر تجهيز المفاهيم");
      const assistantText = data.type === "clarify" ? `${data.reply}\n\n${data.question}` : data.reply;
      setChat((items) => [...items, { role: "user", content: message.trim() }, { role: "assistant", content: assistantText }]);
      const finishedHistory = [...newHistory, { role: "assistant" as const, content: assistantText.slice(0, 500) }].slice(-8);
      setHistory(finishedHistory);
      setDialogueCostUsd(typeof data.costUsd === "number" ? data.costUsd : null);
      if (data.type === "concepts") { setConcepts(data.concepts); setSourceBrief(freezeConceptSourceBrief(initial ? message.trim() : sourceBrief ?? brief, newHistory)); setConceptRunId(crypto.randomUUID()); setBoard(null); setBoardIdentity(null); setSelectedId(null); }
      setFollowUp("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر الاتصال"); }
    finally { setBusy(null); }
  }

  async function generateBoard() {
    if (!concepts || busy || board) return;
    setBusy("board"); setError("");
    try {
      const token = await accessToken();
      const response = await fetch("/api/architect/concept-board", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "board", concepts }) });
      const data = await response.json() as { imageDataUrl?: string; model?: string; requestCount?: number; costUsd?: number | null; error?: string };
      if (!response.ok || typeof data.imageDataUrl !== "string" || data.requestCount !== 1) throw new Error(data.error || "لم تصل لوحة المفاهيم؛ لم تحدث إعادة تلقائية للطلب المدفوع.");
      setBoard(data.imageDataUrl); setBoardIdentity(crypto.randomUUID()); setBoardCostUsd(data.costUsd ?? null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إنشاء اللوحة"); }
    finally { setBusy(null); }
  }

  function startOver() {
    setBrief(DEFAULT_BRIEF); setSourceBrief(null); setConceptRunId(null); setFollowUp(""); setHistory([]); setChat([]); setConcepts(null); setBoard(null); setBoardIdentity(null); setSelectedId(null); setCadStarted(false); setDialogueCostUsd(null); setBoardCostUsd(null); setError("");
    localStorage.removeItem(STORAGE_KEY);
  }

  const chosenConcept = concepts?.find((concept) => concept.id === selectedId) ?? null;
  const selectedConcept = cadStarted ? chosenConcept : null;

  return <main dir="rtl" className="min-h-screen bg-[#071014] px-4 py-6 text-white md:px-7">
    <div className="mx-auto max-w-[1500px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / PRIVATE ARCHITECT PILOT</p><h1 className="mt-2 text-3xl font-bold">ثلاثة مفاهيم معمارية ثم اختيارك لـ CAD</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">سونيت يساعدك على صياغة البرنامج وثلاثة توزيعات مكانية مختلفة. بعد اختيارك الصريح، نرسل المفهوم المنظم ومرجع اللوحة إلى مساعد FreeCAD. اللوحة للتصور وليست مخططًا بمقياس أو اعتمادًا هندسيًا.</p></div><a href="/ar/architect/cad-agent" className="rounded-xl border border-white/20 px-4 py-2 text-sm text-slate-300">مختبر CAD الحالي</a></header>

      {!selectedConcept && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#101c21] p-4">
          <h2 className="text-xl font-bold">١. brief والحوار</h2>
          <label className="block text-sm text-slate-300">وصف المشروع<textarea value={brief} onChange={(event) => setBrief(event.target.value)} disabled={Boolean(concepts)} maxLength={1500} rows={5} className="mt-2 w-full rounded-xl border border-white/15 bg-[#17282e] p-3 leading-7 text-white disabled:opacity-60" /></label>
          {!concepts && <button type="button" disabled={busy !== null || !brief.trim()} onClick={() => void callDialogue(brief, true)} className="rounded-xl bg-[#d4af37] px-4 py-3 font-bold text-[#121a1e] disabled:opacity-40">{busy === "dialogue" ? "سونيت يراجع الطلب..." : "حلّل الطلب واقترح مفاهيم"}</button>}
          <div className="max-h-72 space-y-3 overflow-y-auto">{chat.map((line, index) => <div key={index} className={`whitespace-pre-wrap rounded-xl p-3 text-sm leading-7 ${line.role === "user" ? "bg-[#203842]" : "bg-[#293023]"}`}>{line.content}</div>)}</div>
          {chat.length > 0 && !concepts && <div className="space-y-2"><textarea value={followUp} onChange={(event) => setFollowUp(event.target.value)} maxLength={500} rows={2} placeholder="أجب عن السؤال أو أضف تفضيلًا..." className="w-full rounded-xl border border-white/15 bg-[#17282e] p-3 text-sm" /><div className="flex flex-wrap gap-2"><button type="button" disabled={busy !== null || !followUp.trim()} onClick={() => void callDialogue(followUp, false)} className="rounded-xl border border-[#d4af37]/50 px-4 py-2 text-sm disabled:opacity-40">{busy === "dialogue" ? "جاري التفكير..." : "أرسل الإجابة"}</button><button type="button" disabled={busy !== null} onClick={() => void callDialogue(ASSUMPTIONS_INSTRUCTION, false)} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">تابع بافتراضات معقولة</button></div></div>}
          <p className="text-xs text-slate-500">كل ضغطة حوار ترسل طلبًا نصيًا واحدًا. يمكنك المتابعة بعد السؤال أو مراجعة الافتراضات بدل دورة أسئلة آلية.</p>
          {(dialogueCostUsd !== null) && <p className="text-xs text-slate-400">تكلفة آخر طلب حوار: {formatUsd(dialogueCostUsd)}</p>}
          <button type="button" onClick={startOver} className="rounded-xl border border-white/15 px-3 py-2 text-xs text-slate-300">ابدأ brief جديدًا</button>
        </section>

        <section className="space-y-4 rounded-2xl border border-white/10 bg-[#101c21] p-4">
          <h2 className="text-xl font-bold">٢. مقارنة واختيار</h2>
          {concepts ? <div className="grid gap-3">{concepts.map((concept) => <article key={concept.id} className="rounded-xl border border-white/10 bg-[#17282e] p-3"><h3 className="font-bold text-[#f1d985]">{concept.id} · {concept.title}</h3><p className="mt-2 text-sm leading-6 text-slate-300">{concept.idea}</p><p className="mt-1 text-xs leading-5 text-slate-400">الحركة: {concept.circulation}</p><p className="mt-1 text-xs text-slate-500">البرنامج المشترك: {concept.program.join("، ")}</p></article>)}</div> : <p className="rounded-xl bg-[#17282e] p-4 text-sm leading-7 text-slate-400">ستظهر المفاهيم الثلاثة بعد اكتمال brief. نتحقق من اختلاف استراتيجيات الحركة وتطابق البرنامج قبل عرضها.</p>}
          {concepts && !board && <button type="button" disabled={busy !== null} onClick={() => void generateBoard()} className="rounded-xl bg-[#d4af37] px-4 py-3 font-bold text-[#121a1e] disabled:opacity-40">{busy === "board" ? "طلب صورة واحد قيد التنفيذ..." : "أنشئ لوحة المقارنة · طلب صورة واحد"}</button>}
          {board && <div className="space-y-3"><div className="relative overflow-hidden rounded-xl border border-white/15"><img src={board} alt="لوحة مفاهيم معمارية بثلاثة بدائل" className="block w-full" />{(["A", "B", "C"] as const).map((id, index) => <button key={id} type="button" aria-pressed={selectedId === id} aria-label={`اختيار المفهوم ${id}`} onClick={() => { setSelectedId(id); setCadStarted(false); }} className={`absolute inset-y-0 w-1/3 border-2 transition ${selectedId === id ? "border-[#d4af37] bg-[#d4af37]/10" : "border-transparent hover:border-white/70"}`} style={{ left: `${index * 33.333}%` }}><span className="absolute left-2 top-2 rounded-lg bg-[#071014]/90 px-3 py-2 text-lg font-black text-[#f1d985]">{id}</span></button>)}</div><p className="text-sm text-slate-300">اختر A أو B أو C بالنقر على اللوحة. النموذج قد لا يلتزم تمامًا بالفواصل؛ تحقق من عنوان المفهوم قبل المتابعة.</p><p className="text-xs text-slate-500">طلب صورة واحد من Nano Banana 2 Lite · {formatUsd(boardCostUsd)}</p>{selectedId && <p className="text-sm text-[#f1d985]">اختيارك: المفهوم {selectedId}. اضغط متابعة إلى CAD عند جاهزيتك.</p>}</div>}
        </section>
      </div>}

      {error && <p role="alert" className="rounded-xl bg-rose-950 p-3 text-sm text-rose-200">{error}</p>}
      {board && !cadStarted && selectedId && chosenConcept && <button type="button" onClick={() => setCadStarted(true)} className="rounded-xl bg-[#d4af37] px-5 py-3 font-bold text-[#121a1e]">تابع إلى CAD بالمفهوم {chosenConcept.id}</button>}
      {selectedConcept && board && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d4af37]/30 bg-[#252419] p-4"><div><strong>المفهوم المحدد: {selectedConcept.id} · {selectedConcept.title}</strong><p className="mt-1 text-sm text-slate-300">{selectedConcept.strategy} · {selectedConcept.circulation}</p></div><button type="button" onClick={() => setCadStarted(false)} className="rounded-xl border border-white/20 px-3 py-2 text-sm">تغيير الاختيار</button></div><CadAgentWorkspace key={`${conceptRunId ?? "concept"}:${boardIdentity ?? "board"}:${selectedConcept.id}`} selectedConcept={selectedConcept} sourceBrief={sourceBrief ?? brief} conceptRunId={conceptRunId ?? "legacy"} conceptBoardDataUrl={board} /></section>}
    </div>
  </main>;
}
