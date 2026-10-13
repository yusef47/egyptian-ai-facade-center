import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import { generateAutoLisp, LISP_LAB_LIMITS } from "../../../../lib/architect/lisp-lab";
import { isConceptBoardAvailable } from "../../../../lib/architect/concept-board";

export const runtime = "nodejs";
export const maxDuration = 180;

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
  const brief = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>).brief : null;
  if (typeof brief !== "string" || !brief.trim() || brief.length > LISP_LAB_LIMITS.brief) return NextResponse.json({ error: "الطلب فارغ أو أطول من الحد المسموح." }, { status: 400 });

  try {
    const result = await generateAutoLisp(brief);
    return NextResponse.json({ ...result, verified: false, executed: false }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const safeCategory = /^rejected_(?:empty|too_large|fenced|unsafe_symbol|missing_entrypoint|unbalanced|top_level_expression)$/.test(message) ? message : message === "incomplete_response" ? message : "generation_failed";
    console.warn("[LISP_LAB_FAILED]", JSON.stringify({ category: safeCategory }));
    return NextResponse.json({ error: safeCategory.startsWith("rejected_") ? "المصدر المقترح لم يجتز فحوص الأمان والاكتمال. لم يتم تنزيله؛ أعد المحاولة بطلب أوضح." : "تعذر توليد ملف AutoLISP كامل. لم يتم تشغيل أي كود؛ يمكنك المحاولة مرة أخرى." }, { status: 502 });
  }
}
