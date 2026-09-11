import { NextResponse } from "next/server";
import { executeRestore } from "../../../lib/openrouter-engine.js";
import {
  CREDITS_EXHAUSTED_BILINGUAL,
  deductGenerationCredit,
  refreshDailyCredits,
  refundGenerationCredit,
  verifySupabaseUser,
} from "../../../lib/credits.js";
import { RATE_LIMIT_MESSAGE_BILINGUAL, rateLimit } from "../../../lib/request-guards.js";
import { getSupabaseAdminClient } from "../../../lib/credits.js";
import { validateImageDataUrl } from "../../../lib/image-validation.js";

export const runtime = "nodejs";
export const maxDuration = 60;

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0].trim() || "unknown";
}

function methodNotAllowed(): NextResponse {
  return NextResponse.json(
    { error: "يسمح هذا المسار بطلبات POST فقط." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function GET(): Promise<NextResponse> {
  return methodNotAllowed();
}

export async function POST(request: Request): Promise<NextResponse> {
  // ── Simple, linear credit flow (per launch spec) ──────────────────────
  // 1) Per-IP abuse guard: 15 requests per rolling minute (keeps bursts off).
  const limited = rateLimit(getClientKey(request));
  if (!limited.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE_BILINGUAL },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 2) Authenticate: bearer token first, cookie fallback. No user → 401.
  const userId = await verifySupabaseUser(request);
  const hasSession = Boolean(userId);
  console.log(`[RESTORE_START] ${JSON.stringify({ userId: userId ?? null, hasSession })}`);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in with Google to generate. Every account gets 10 free credits daily." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  // 3) Input validation: genuine image only — before any credit is touched.
  const payload = (body ?? {}) as { imageDataUrl?: unknown };
  const imageCheck = validateImageDataUrl(payload.imageDataUrl);
  if (!imageCheck.ok) {
    return NextResponse.json({ error: imageCheck.message }, { status: imageCheck.status });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json(
      { error: "Credit service unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // 4) Refresh: RPC returns the current balance (resets to 10 after 24h).
  const creditsAfterRefresh = await refreshDailyCredits(admin, userId);
  console.log(`[REFRESH_CHECK] ${JSON.stringify({ userId, creditsAfterRefresh })}`);
  if (creditsAfterRefresh === null || creditsAfterRefresh <= 0) {
    return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
  }

  // 5) Deduct exactly 1 credit atomically (pre-generation).
  console.log(`[PRE_DEDUCT] ${JSON.stringify({ userId, currentCredits: creditsAfterRefresh })}`);
  const deduction = await deductGenerationCredit(userId);
  if (!deduction.ok) {
    console.log(`[DEDUCT_FAILED] ${JSON.stringify({ userId, remaining: deduction.remaining ?? null })}`);
    return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
  }
  let creditsRemaining = typeof deduction.remaining === "number" ? deduction.remaining : null;
  console.log(`[POST_DEDUCT] ${JSON.stringify({ userId, ok: deduction.ok, newBalance: creditsRemaining })}`);

  // 6) Generate — only reached when the deduction succeeded.
  console.log(`[CALLING_ENGINE] ${JSON.stringify({ userId, toolId: (body as { toolId?: string })?.toolId ?? null })}`);
  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(request),
  });

  if (!result.ok) {
    // 7) Compensating transaction: a failed generation must not consume a
    // credit. Refund exactly what the pre-deduction charged, and report the
    // post-refund balance so the header badge stays truthful.
    const refund = await refundGenerationCredit(userId);
    creditsRemaining = typeof refund.remaining === "number" ? refund.remaining : creditsRemaining;
    console.log(
      `[CREDIT_REFUNDED] ${JSON.stringify({ userId, ok: refund.ok, remaining: refund.remaining ?? null })}`,
    );
    return NextResponse.json(
      { error: result.message, creditsRemaining },
      { status: result.status },
    );
  }

  return NextResponse.json({
    imageDataUrl: result.imageDataUrl,
    creditsRemaining,
  });
}
