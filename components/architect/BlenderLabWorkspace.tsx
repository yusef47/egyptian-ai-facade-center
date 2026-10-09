"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { BlenderLabViewer } from "./BlenderLabViewer";

type Turn = { role: "user" | "assistant"; text: string };
type Result = { script: string; reply: string; glbBase64: string };
const STORAGE_KEY = "qattan:blender-lab-script-v1";
const VILLA_STAGES = ["الأرض", "الفيلا والغرف", "الأثاث", "الجنينة والمسبح"];

export function BlenderLabWorkspace() {
  const [instruction, setInstruction] = useState("");
  const [siteWidth, setSiteWidth] = useState("12");
  const [siteDepth, setSiteDepth] = useState("20");
  const [script, setScript] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [villaBrief, setVillaBrief] = useState("فيلا حديثة دافئة من دور أرضي، غرفتا نوم وريسبشن مفتوح على الجنينة، حمام سباحة أنيق وجلسة خارجية");
  const [villaGlb, setVillaGlb] = useState<string | null>(null);
  const [villaStage, setVillaStage] = useState(0);
  const [villaStatus, setVillaStatus] = useState("");
  const [villaPending, setVillaPending] = useState(false);
  const [villaError, setVillaError] = useState("");
  const [villaFallback, setVillaFallback] = useState(false);
  const [showRoof, setShowRoof] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.length <= 36000) setScript(saved);
    void fetch("/api/architect/blender-lab").then((response) => response.json()).then((data) => setAvailable(data.available === true)).catch(() => setAvailable(false));
  }, []);

  async function submit() {
    const message = instruction.trim();
    if (!message || pending) return;
    const width = Number(siteWidth);
    const depth = Number(siteDepth);
    if (!Number.isFinite(width) || !Number.isFinite(depth) || width < 3 || width > 100 || depth < 3 || depth > 100) {
      setError("الأبعاد لازم تكون بين 3 و100 متر."); return;
    }
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) { setError("سجّل دخولك بحساب الأدمن أولًا."); return; }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/architect/blender-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ instruction: message, siteWidth: width, siteDepth: depth, previousScript: script || undefined }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "تعذر توليد النموذج");
      const built = data as Result;
      if (!built.script || !built.glbBase64) throw new Error("الاستجابة غير مكتملة");
      setResult(built);
      setVillaGlb(null);
      setScript(built.script);
      localStorage.setItem(STORAGE_KEY, built.script);
      setTurns((previous) => [...previous, { role: "user", text: message }, { role: "assistant", text: built.reply }]);
      setInstruction("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
    } finally {
      setPending(false);
    }
  }

  async function runVillaDemo() {
    if (villaPending || pending || !available || !villaBrief.trim()) return;
    const supabase = getSupabaseBrowserClient();
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) { setVillaError("سجّل دخولك بحساب الأدمن أولًا."); return; }
    setVillaPending(true);
    setVillaGlb(null);
    setVillaStage(0);
    setVillaError("");
    setVillaFallback(false);
    setVillaStatus("جاري بدء تجربة الفيلا...");
    let completed = false;
    try {
      const response = await fetch("/api/architect/villa-live", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ brief: villaBrief.trim() }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || "تعذر بدء التجربة");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handleLine = (line: string) => {
        if (!line) return;
        const event = JSON.parse(line) as { type: string; label?: string; stage?: number; glbBase64?: string; source?: string; message?: string };
        if (event.type === "status" && event.label) setVillaStatus(event.label);
        if (event.type === "design" && event.source === "fallback") setVillaFallback(true);
        if (event.type === "stage" && event.stage && event.glbBase64) {
          setVillaGlb(event.glbBase64);
          setVillaStage(event.stage);
          setVillaStatus(`${VILLA_STAGES[event.stage - 1]} جاهزة — المجسم اتحدث قدامك`);
          if (event.stage >= 3) setShowRoof(false);
        }
        if (event.type === "done") completed = true;
        if (event.type === "error") throw new Error(event.message || "فشل بناء الفيلا");
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      }
      if (buffer.trim()) handleLine(buffer.trim());
      if (!completed) throw new Error("اتقطع الاتصال قبل اكتمال التجربة");
      setVillaStatus("الفيلا التجريبية جاهزة؛ تقدر تلف حولها وتخفي السقف");
    } catch (caught) {
      setVillaError(caught instanceof Error ? caught.message : "حدث خطأ غير متوقع");
    } finally {
      setVillaPending(false);
    }
  }

  function download(content: BlobPart, type: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadGlb() {
    const data = villaGlb ?? result?.glbBase64;
    if (!data) return;
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    download(bytes.buffer, "model/gltf-binary", "qattan-concept.glb");
  }

  return <main dir="rtl" className="min-h-screen bg-[#071014] p-4 text-white md:p-7">
    <div className="mx-auto max-w-[1600px]">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / BLENDER LAB</p><h1 className="mt-1 text-2xl font-bold md:text-3xl">ابنِ نموذجك بالكلام</h1><p className="mt-1 text-sm text-slate-400">المساعد يكتب سكربت Blender، يشغّله في بيئة معزولة عند إرسال الطلب، ويعرض النموذج الناتج هنا.</p></div>
        <a href="/ar/architect/planner" className="rounded-xl border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">فتح المخطط السابق ←</a>
      </header>
      <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="flex min-h-[650px] flex-col rounded-2xl border border-white/10 bg-[#101c21] p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm text-slate-300">عرض الأرض بالمتر<input type="number" min="3" max="100" value={siteWidth} onChange={(event) => setSiteWidth(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#17282e] p-2 text-white" /></label>
            <label className="text-sm text-slate-300">عمق الأرض بالمتر<input type="number" min="3" max="100" value={siteDepth} onChange={(event) => setSiteDepth(event.target.value)} className="mt-1 w-full rounded-xl border border-white/15 bg-[#17282e] p-2 text-white" /></label>
          </div>
          <p className="mt-3 rounded-xl bg-[#1b2a30] p-3 text-xs leading-6 text-slate-300">{available === null ? "جارٍ فحص الخدمة..." : available ? "المختبر مفعّل. كل رسالة تشغّل نموذج ذكاء اصطناعي وبيئة Blender مؤقتة." : "المختبر غير مفعّل على هذا الخادم. يلزم إعداد QATTAN_BLENDER_LAB_ENABLED وموديل النص."}</p>
          <div className="mt-4 rounded-xl border border-[#d4af37]/35 bg-[#211f19] p-3">
            <p className="text-sm font-bold text-[#f1d985]">تجربة البناء المباشر · فيلا 12×20 متر</p>
            <p className="mt-1 text-xs leading-6 text-slate-300">فيلا دور واحد بغرفتي نوم. هتشوف الأرض، المبنى، الأثاث، ثم الجنينة وحمام السباحة واحدًا بعد الآخر. في التجربة دي الوصف بيحدد الطابع ومكان المسبح؛ توزيع الغرف ثابت مؤقتًا، ومشروع الشات الحالي منفصل.</p>
            <textarea value={villaBrief} onChange={(event) => setVillaBrief(event.target.value)} maxLength={500} rows={2} aria-label="وصف تجربة الفيلا" className="mt-2 w-full resize-none rounded-lg border border-white/15 bg-[#17282e] p-2 text-sm text-white" />
            <button type="button" disabled={villaPending || pending || !available || !villaBrief.trim()} onClick={() => void runVillaDemo()} className="mt-2 w-full rounded-lg bg-[#d4af37] px-3 py-2 text-sm font-bold text-[#121a1e] disabled:opacity-45">{villaPending ? "الفيلا بتتبني..." : "ابدأ تجربة الفيلا الحية"}</button>
            {(villaPending || villaStage > 0) && <div className="mt-3" aria-live="polite">
              <p className="mb-2 text-xs text-[#f1d985]">{villaStatus}</p>
              <div className="grid grid-cols-4 gap-1">{VILLA_STAGES.map((label, index) => <div key={label} className={`rounded-md p-1 text-center text-[10px] ${index < villaStage ? "bg-emerald-700 text-white" : index === villaStage && villaPending ? "bg-[#725d24] text-white" : "bg-white/10 text-slate-400"}`}>{label}</div>)}</div>
            </div>}
            {villaFallback && <p className="mt-2 text-xs text-amber-200">الموديل لم يرجع تصميمًا صالحًا؛ استخدمنا طابعًا تجريبيًا محددًا.</p>}
            {villaError && <p role="alert" className="mt-2 text-xs text-rose-300">{villaError}</p>}
          </div>
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {turns.length === 0 && <p className="text-sm leading-7 text-slate-400">مثال: «ابني تصور مبنى 3 أدوار على أرض 12×20 متر، مدخل من الشارع، نواة سلم في اليمين، أعمدة وكمرات وبلاطات واضحة». بعد النتيجة اطلب تعديلًا مثل «انقل السلم للمنتصف».</p>}
            {turns.map((turn, index) => <div key={index} className={`rounded-xl p-3 text-sm leading-7 ${turn.role === "user" ? "bg-[#203842]" : "bg-[#293023]"}`}>{turn.text}</div>)}
          </div>
          {error && <p role="alert" className="my-2 rounded-xl bg-rose-950/80 p-3 text-sm text-rose-200">{error}</p>}
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={1500} rows={4} placeholder="اوصف المبنى أو التعديل اللي عايزه..." className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-[#17282e] p-3 text-sm text-white placeholder:text-slate-500 focus:border-[#d4af37] focus:outline-none" />
          <button type="button" disabled={pending || villaPending || !available || !instruction.trim()} onClick={() => void submit()} className="mt-3 rounded-xl bg-[#d4af37] px-4 py-3 font-bold text-[#121a1e] disabled:cursor-not-allowed disabled:opacity-45">{pending ? "المساعد بيبني وبيراجع النموذج..." : script ? "نفّذ التعديل" : "ابنِ النموذج"}</button>
        </section>
        <section className="space-y-3">
          <BlenderLabViewer glbBase64={villaGlb ?? result?.glbBase64 ?? null} showRoof={showRoof} />
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#101c21] p-4">
            <button type="button" disabled={!villaGlb && !result} onClick={downloadGlb} className="rounded-xl border border-[#d4af37]/50 px-4 py-2 text-sm text-[#f1d985] disabled:opacity-40">تنزيل GLB</button>
            <button type="button" disabled={!villaGlb} onClick={() => setShowRoof((value) => !value)} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">{showRoof ? "اخفِ السقف وشوف الغرف" : "أظهر السقف"}</button>
            <button type="button" disabled={!script} onClick={() => download(script, "text/x-python", "qattan-concept.py")} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">تنزيل سكربت Blender</button>
            <button type="button" disabled={!script && !villaGlb} onClick={() => { setScript(""); setResult(null); setTurns([]); setVillaGlb(null); setVillaStage(0); setVillaStatus(""); localStorage.removeItem(STORAGE_KEY); }} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">مشروع جديد</button>
            <p className="self-center text-xs text-slate-400">تصور أولي فقط؛ لم تُفحص السلامة الإنشائية أو الاشتراطات المصرية.</p>
          </div>
        </section>
      </div>
    </div>
  </main>;
}
