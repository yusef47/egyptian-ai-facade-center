"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type Result = {
  model: string;
  elapsedMs?: number;
  finishReason?: string | null;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number } | null;
  validJson?: boolean;
  output?: { spec?: { walls?: unknown[]; openings?: unknown[]; rooms?: unknown[]; stairs?: unknown[] }; furniture?: unknown[]; selfReview?: string[] } | null;
  responseExcerpt?: string | null;
  rawResponse?: string | null;
  error?: string;
};

const MODELS = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5" },
  { id: "anthropic/claude-opus-5.5", label: "Claude Opus 5.5" },
  { id: "moonshotai/kimi-k3", label: "Kimi K3" },
] as const;

export function CadBenchmarkWorkspace() {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [progress, setProgress] = useState<Record<string, { elapsedMs: number; contentChars?: number; phase?: string }>>({});

  async function run(model: string) {
    if (busy) return;
    setBusy(model);
    setProgress((previous) => ({ ...previous, [model]: { elapsedMs: 0, phase: "connecting" } }));
    try {
      const session = await getSupabaseBrowserClient()?.auth.getSession();
      const token = session?.data.session?.access_token;
      if (!token) throw new Error("سجّل دخولك بحساب الأدمن أولًا.");
      const response = await fetch("/api/architect/cad-benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ model }),
        cache: "no-store",
      });
      if (!response.ok) {
        const data = await response.json() as Result;
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }
      if (!response.body) throw new Error("الاتصال لم يبدأ");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let completed = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
          const dataText = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
          if (!event || !dataText) continue;
          const data = JSON.parse(dataText) as Result & { phase?: string; contentChars?: number };
          if (event === "progress" || event === "status") {
            setProgress((previous) => ({ ...previous, [model]: { elapsedMs: data.elapsedMs ?? 0, contentChars: data.contentChars, phase: data.phase } }));
          } else if (event === "result") {
            setResults((previous) => ({ ...previous, [model]: data }));
            completed = true;
          } else if (event === "error") {
            throw new Error(data.error ?? "فشل اتصال الموديل");
          }
        }
      }
      if (!completed) throw new Error("انقطع الاتصال قبل اكتمال النتيجة");
    } catch (error) {
      setResults((previous) => ({ ...previous, [model]: { model, error: error instanceof Error ? error.message : "تعذر الاتصال" } }));
    } finally {
      setBusy(null);
    }
  }

  function download(model: string) {
    const result = results[model];
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `qattan-cad-benchmark-${model.split("/")[1]}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main dir="rtl" className="min-h-screen bg-[#071014] px-4 py-8 text-white md:px-8">
    <div className="mx-auto max-w-6xl">
      <p className="text-xs font-bold tracking-[0.2em] text-[#d4af37]">QATTAN AI / CAD MODEL BENCHMARK</p>
      <h1 className="mt-3 text-3xl font-bold">تجربة 3 موديلات على نفس مخطط CAD</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">نفس الطلب لكل موديل: أرض 20 × 20 متر، شقتان مستقلتان، في كل شقة 3 غرف نوم وحمام ومطبخ وريسبشن، مع مدخل وسلم مشترك وعفش أساسي. كل زر يعمل اتصالًا مدفوعًا واحدًا بـOpenRouter. النتيجة هنا مواصفات CAD؛ جودة المخطط تُراجع بعد رسمها.</p>
      <div className="mt-7 grid gap-4 md:grid-cols-3">
        {MODELS.map(({ id, label }) => {
          const result = results[id];
          const spec = result?.output?.spec;
          return <section key={id} className="rounded-2xl border border-white/10 bg-[#102027] p-5">
            <h2 className="text-xl font-semibold text-[#f1d985]">{label}</h2>
            <p dir="ltr" className="mt-1 text-xs text-slate-400">{id}</p>
            <button type="button" disabled={Boolean(busy)} onClick={() => void run(id)} className="mt-5 w-full rounded-xl bg-[#d4af37] px-4 py-3 font-bold text-[#102027] disabled:opacity-40">{busy === id ? "الموديل بيخطط وبيجهز العفش..." : result ? "أعد التجربة" : "جرّب الموديل"}</button>
            {busy === id && <p className="mt-3 text-xs text-cyan-200" aria-live="polite">اتصال مباشر · {((progress[id]?.elapsedMs ?? 0) / 1000).toFixed(0)} ثانية · {progress[id]?.contentChars ? `${progress[id].contentChars} حرف من المخطط` : "الموديل بيفكر"}</p>}
            {result && <div className="mt-5 space-y-2 text-sm leading-6">
              <p className={result.error || !result.validJson ? "text-rose-300" : "text-emerald-300"}>{result.error ?? (result.validJson ? "رجّع مواصفات JSON قابلة للفحص" : result.finishReason === "length" ? "الموديل استهلك حدّ التوكنز قبل ما يكمل المخطط؛ تكلفة الاتصال اتحسبت. نزّل الملف لو محتاج تفحص الرد." : "الرد لم يكن مواصفات JSON صالحة")}</p>
              {result.elapsedMs !== undefined && <p>المدة: {(result.elapsedMs / 1000).toFixed(1)} ثانية</p>}
              {result.finishReason && <p>سبب التوقف: {result.finishReason}</p>}
              {spec && <p>{spec.walls?.length ?? 0} حائط · {spec.openings?.length ?? 0} فتحة · {spec.rooms?.length ?? 0} فراغ · {result.output?.furniture?.length ?? 0} قطعة عفش</p>}
              {result.usage?.cost !== undefined && <p>تكلفة الاتصال المبلّغ عنها: ${result.usage.cost.toFixed(4)}</p>}
              {result.responseExcerpt && <p className="max-h-32 overflow-auto break-all rounded-lg bg-black/30 p-2 text-xs text-slate-400">{result.responseExcerpt}</p>}
              <button type="button" onClick={() => download(id)} className="rounded-lg border border-white/25 px-3 py-2 text-xs hover:bg-white/10">نزّل نتيجة JSON للفحص والرسم</button>
            </div>}
          </section>;
        })}
      </div>
      <p className="mt-6 text-xs leading-6 text-slate-500">تجربة خاصة بحسابَي الأدمن فقط. JSON صالح لا يعني أن المخطط صالح معماريًا أو مطابق للكود المصري؛ تُفحص الرسومات والأبواب والحركة والعفش بعد تصدير DXF.</p>
    </div>
  </main>;
}
