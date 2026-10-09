"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { BlenderLabViewer } from "./BlenderLabViewer";

type Turn = { role: "user" | "assistant"; text: string };
type Result = { script: string; reply: string; glbBase64: string };
const STORAGE_KEY = "qattan:blender-lab-script-v1";

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

  function download(content: BlobPart, type: string, filename: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadGlb() {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.glbBase64), (char) => char.charCodeAt(0));
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
          <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
            {turns.length === 0 && <p className="text-sm leading-7 text-slate-400">مثال: «ابني تصور مبنى 3 أدوار على أرض 12×20 متر، مدخل من الشارع، نواة سلم في اليمين، أعمدة وكمرات وبلاطات واضحة». بعد النتيجة اطلب تعديلًا مثل «انقل السلم للمنتصف».</p>}
            {turns.map((turn, index) => <div key={index} className={`rounded-xl p-3 text-sm leading-7 ${turn.role === "user" ? "bg-[#203842]" : "bg-[#293023]"}`}>{turn.text}</div>)}
          </div>
          {error && <p role="alert" className="my-2 rounded-xl bg-rose-950/80 p-3 text-sm text-rose-200">{error}</p>}
          <textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} maxLength={1500} rows={4} placeholder="اوصف المبنى أو التعديل اللي عايزه..." className="mt-3 w-full resize-none rounded-xl border border-white/15 bg-[#17282e] p-3 text-sm text-white placeholder:text-slate-500 focus:border-[#d4af37] focus:outline-none" />
          <button type="button" disabled={pending || !available || !instruction.trim()} onClick={() => void submit()} className="mt-3 rounded-xl bg-[#d4af37] px-4 py-3 font-bold text-[#121a1e] disabled:cursor-not-allowed disabled:opacity-45">{pending ? "Blender بيبني النموذج..." : script ? "نفّذ التعديل" : "ابنِ النموذج"}</button>
        </section>
        <section className="space-y-3">
          <BlenderLabViewer glbBase64={result?.glbBase64 ?? null} />
          <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-[#101c21] p-4">
            <button type="button" disabled={!result} onClick={downloadGlb} className="rounded-xl border border-[#d4af37]/50 px-4 py-2 text-sm text-[#f1d985] disabled:opacity-40">تنزيل GLB</button>
            <button type="button" disabled={!script} onClick={() => download(script, "text/x-python", "qattan-concept.py")} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">تنزيل سكربت Blender</button>
            <button type="button" disabled={!script} onClick={() => { setScript(""); setResult(null); setTurns([]); localStorage.removeItem(STORAGE_KEY); }} className="rounded-xl border border-white/20 px-4 py-2 text-sm disabled:opacity-40">مشروع جديد</button>
            <p className="self-center text-xs text-slate-400">تصور أولي فقط؛ لم تُفحص السلامة الإنشائية أو الاشتراطات المصرية.</p>
          </div>
        </section>
      </div>
    </div>
  </main>;
}
