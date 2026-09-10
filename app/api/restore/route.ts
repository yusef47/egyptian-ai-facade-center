import { NextResponse } from "next/server";
import { executeRestore } from "../../../lib/openrouter-engine.js";
import {
  CREDITS_EXHAUSTED_BILINGUAL,
  checkGenerationCredits,
  deductGenerationCredit,
  getGenerationUserId,
  refundGenerationCredit,
} from "../../../lib/credits.js";
import { RATE_LIMIT_MESSAGE_BILINGUAL, dedupe, rateLimit } from "../../../lib/request-guards.js";
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
  // ── Security hardening ────────────────────────────────────────────────
  // 1) Per-user rate limit: max 15 generation requests per rolling minute.
  const limiterKey = getClientKey(request);
  const limited = rateLimit(limiterKey);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE_BILINGUAL },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 2) Identity + balance gate: verifies the caller's Supabase session
  //    (bearer token first, cookie fallback) and re-fetches the REAL balance
  //    from Supabase — client-sent credit values are never trusted.
  const creditCheck = await checkGenerationCredits(request);
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: creditCheck.message }, { status: creditCheck.status });
  }
  const userId = getGenerationUserId(creditCheck);

  // 3) Duplicate-request guard: same user within 3s is rejected outright.
  if (userId) {
    const duplicate = dedupe(userId);
    if (!duplicate.allowed) {
      return NextResponse.json(
        { error: RATE_LIMIT_MESSAGE_BILINGUAL },
        { status: 429, headers: { "Retry-After": String(duplicate.retryAfterSeconds) } },
      );
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  // 4) Input validation: genuine image only (MIME allowlist + magic bytes,
  //    max 10MB) — before any credit is touched.
  const payload = (body ?? {}) as { imageDataUrl?: unknown };
  const imageCheck = validateImageDataUrl(payload.imageDataUrl);
  if (!imageCheck.ok) {
    return NextResponse.json({ error: imageCheck.message }, { status: imageCheck.status });
  }

  // ── STRICT PRE-GENERATION DEDUCTION ───────────────────────────────────
  // The credit is deducted (atomic RPC via the service-role client, which
  // bypasses RLS and updates credits -1 / generations_used +1) BEFORE any
  // OpenRouter call. If the balance is exhausted or the deduction fails,
  // we abort here — the generation API is never invoked.
  let creditsRemaining: number | null = null;
  if (userId) {
    const deduction = await deductGenerationCredit(userId);
    if (!deduction.ok) {
      // Insufficient funds or RPC failure: abort WITHOUT calling OpenRouter.
      return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
    }
    creditsRemaining = typeof deduction.remaining === "number" ? deduction.remaining : null;
    console.log(
      `[CREDIT_DEDUCTED] ${JSON.stringify({ userId, remaining: creditsRemaining })}`,
    );
  }

  // ── Generation (only reached when deduction succeeded or auth dormant) ─
  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(request),
  });

  if (!result.ok) {
    // Compensating transaction: a failed generation must not consume a
    // credit. Refund exactly what the pre-deduction charged.
    if (userId) {
      const refund = await refundGenerationCredit(userId);
      console.log(
        `[CREDIT_REFUNDED] ${JSON.stringify({ userId, ok: refund.ok, remaining: refund.remaining ?? null })}`,
      );
    }
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json({
    imageDataUrl: result.imageDataUrl,
    creditsRemaining,
  });
}
