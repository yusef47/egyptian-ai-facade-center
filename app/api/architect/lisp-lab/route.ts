import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import { assembleAutoLispStages, LISP_GENERATION_STAGES, LISP_LAB_LIMITS, streamAutoLispStage, validateLispPlan, type LispGenerationStage } from "../../../../lib/architect/lisp-lab";
import { isConceptBoardAvailable } from "../../../../lib/architect/concept-board";

export const runtime = "nodejs";
export const maxDuration = 300;

function event(controller: ReadableStreamDefaultController<Uint8Array>, name: string, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`));
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  const admin = getSupabaseAdminClient();
  if (!admin || !isConceptBoardAvailable()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await authorizeArchitectPilot(request, admin);
  if (!gate.authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`architect-lisp-lab:${gate.userId}`);
  if (!limited.allowed) return NextResponse.json({ error: "يرجى الانتظار قبل طلب آخر." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const stage = input.stage;
  const brief = input.brief;
  if (typeof brief !== "string" || !brief.trim() || brief.length > LISP_LAB_LIMITS.brief) return NextResponse.json({ error: "الطلب فارغ أو أطول من الحد المسموح." }, { status: 400 });
  const finalize = stage === "finalize";
  if (!finalize && (typeof stage !== "string" || !LISP_GENERATION_STAGES.includes(stage as LispGenerationStage))) return NextResponse.json({ error: "مرحلة غير صالحة." }, { status: 400 });
  if (finalize) {
    if (JSON.stringify(input.parts ?? []).length > LISP_LAB_LIMITS.source || !Array.isArray(input.parts) || input.parts.some((part) => typeof part !== "string")) return NextResponse.json({ error: "مراحل المصدر أطول من الحد المسموح." }, { status: 400 });
    const checked = assembleAutoLispStages(input.plan, input.parts);
    if (!checked.valid) return NextResponse.json({ error: "لم يجتز المصدر فحوص الاكتمال والأمان." }, { status: 422 });
    return NextResponse.json({ source: checked.source, model: "anthropic/claude-sonnet-5.5", verified: false, executed: false }, { headers: { "Cache-Control": "no-store" } });
  }
  const generationStage = stage as LispGenerationStage;
  const plan = generationStage === "layout" ? undefined : validateLispPlan(input.plan);
  if (generationStage !== "layout" && !plan) return NextResponse.json({ error: "مخطط المرحلة السابقة غير صالح؛ أعد المحاولة من البداية." }, { status: 400 });
  const priorSource = typeof input.priorSource === "string" ? input.priorSource : "";
  if (priorSource.length > LISP_LAB_LIMITS.source) return NextResponse.json({ error: "سياق المصدر أطول من الحد المسموح." }, { status: 400 });

  let streamClosed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const abortController = new AbortController();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, payload: unknown) => { if (!streamClosed) event(controller, name, payload); };
      const finish = () => { if (!streamClosed) { streamClosed = true; if (heartbeat) clearInterval(heartbeat); controller.close(); } };
      send("progress", { stage: generationStage, state: "started" });
      heartbeat = setInterval(() => send("heartbeat", { at: Date.now() }), 10_000);
      void (async () => {
        try {
          const result = await streamAutoLispStage({ stage: generationStage, brief, plan: plan ?? undefined, priorSource, signal: abortController.signal, onDelta: (text) => send("delta", { text }) });
          send("complete", result);
          finish();
        } catch (error) {
          const message = error instanceof Error ? error.message : "unknown";
          const safeCategory = ["incomplete_response", "invalid_layout", "invalid_source_fragment", "upstream_failed", "invalid_stream", "upstream_stream_error", "stage_too_large"].includes(message) ? message : "generation_failed";
          console.warn("[LISP_LAB_STAGE_FAILED]", JSON.stringify({ stage: generationStage, category: safeCategory }));
          send("error", { category: safeCategory, message: "تعذر إكمال هذه المرحلة؛ لم يتم اعتماد الملف." });
          finish();
        } finally { if (heartbeat) clearInterval(heartbeat); }
      })();
    },
    cancel() { streamClosed = true; if (heartbeat) clearInterval(heartbeat); abortController.abort(); },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
