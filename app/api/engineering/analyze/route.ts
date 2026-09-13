import { NextResponse } from "next/server";
import {
  CREDITS_EXHAUSTED_BILINGUAL,
  deductGenerationCredit,
  getSupabaseAdminClient,
  readProfileCredits,
  refreshDailyCredits,
  refundGenerationCredit,
  verifySupabaseUser,
} from "../../../../lib/credits.js";
import { ENGINE_BUSY_BILINGUAL } from "../../../../lib/openrouter-engine.js";
import { RATE_LIMIT_MESSAGE_BILINGUAL, rateLimit } from "../../../../lib/request-guards.js";
import { validateImageDataUrl } from "../../../../lib/image-validation.js";
import { analyzeEngineeringGeometry } from "../../../../lib/engineering-engine.js";

/**
 * Tool #9 — Engineering Multiview & 3D.
 *
 * The AI is used ONLY as a drawing reader: it returns structured JSON geometry,
 * and the browser-side Three.js CAD engine draws the orthographic projections
 * and the 3D isometric from that geometry (see components/qattan/EngineeringCADViewer.tsx).
 *
 * Credit contract is identical to /api/restore: exactly one credit per analysis,
 * deducted BEFORE the model call and refunded if the analysis fails.
 */

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

const DEFAULT_BRIEF =
  "Deduce the missing orthographic view and the exact 3D isometric projection of this part.";

export async function POST(request: Request): Promise<NextResponse> {
  // 1) Per-IP abuse guard (shared rolling window with the render route).
  const limited = rateLimit(getClientKey(request));
  if (!limited.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE_BILINGUAL },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 2) Authenticate: bearer token first, cookie fallback. No user → 401.
  const userId = await verifySupabaseUser(request);
  console.log(
    `[ENGINEERING_START] ${JSON.stringify({ userId: userId ?? null, hasSession: Boolean(userId) })}`,
  );
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

  // 3) Input validation before any credit is touched.
  const payload = (body ?? {}) as { imageDataUrl?: unknown; prompt?: unknown };
  const imageCheck = validateImageDataUrl(payload.imageDataUrl);
  if (!imageCheck.ok) {
    return NextResponse.json({ error: imageCheck.message }, { status: imageCheck.status });
  }
  const brief =
    typeof payload.prompt === "string" && payload.prompt.trim().length >= 3
      ? payload.prompt.slice(0, 3000)
      : DEFAULT_BRIEF;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json(
      { error: "Credit service unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // 4) Refresh: returns the current balance (resets to 10 after 24h).
  const creditsAfterRefresh = await refreshDailyCredits(admin, userId);
  console.log(
    `[ENGINEERING_REFRESH] ${JSON.stringify({ userId, creditsAfterRefresh })}`,
  );
  if (creditsAfterRefresh === null || creditsAfterRefresh <= 0) {
    return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
  }

  // 5) Deduct exactly 1 credit atomically, BEFORE the analysis call.
  const deduction = await deductGenerationCredit(userId);
  if (!deduction.ok) {
    console.log(
      `[ENGINEERING_DEDUCT_FAILED] ${JSON.stringify({
        userId,
        reason: deduction.reason,
        remaining: deduction.remaining ?? null,
      })}`,
    );
    return deduction.reason === "insufficient"
      ? NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 })
      : NextResponse.json({ error: ENGINE_BUSY_BILINGUAL }, { status: 503 });
  }
  let creditsRemaining = typeof deduction.remaining === "number" ? deduction.remaining : null;
  if (creditsRemaining === null) {
    creditsRemaining = await readProfileCredits(admin, userId);
  }
  if (creditsRemaining === null) {
    creditsRemaining = Math.max((creditsAfterRefresh ?? 1) - 1, 0);
    console.log(`[ENGINEERING_CREDITS_ESTIMATED] ${JSON.stringify({ userId, creditsRemaining })}`);
  }
  console.log(
    `[ENGINEERING_DEDUCTED] ${JSON.stringify({ userId, remaining: creditsRemaining })}`,
  );

  // 6) Analyze the drawing (text-only JSON geometry, no image generation).
  console.log(`[ENGINEERING_CALLING_ENGINE] ${JSON.stringify({ userId })}`);
  const result = await analyzeEngineeringGeometry(
    payload.imageDataUrl as string,
    brief,
    process.env.OPENROUTER_API_KEY,
  );

  if (!result.ok) {
    // Compensating transaction: a failed analysis must not consume a credit.
    const refund = await refundGenerationCredit(userId);
    creditsRemaining = typeof refund.remaining === "number" ? refund.remaining : creditsRemaining;
    if (creditsRemaining === null) creditsRemaining = await readProfileCredits(admin, userId);
    console.log(
      `[ENGINEERING_REFUNDED] ${JSON.stringify({ userId, ok: refund.ok, remaining: refund.remaining ?? null })}`,
    );
    console.log(
      `[ENGINEERING_RESPONSE] ${JSON.stringify({ ok: false, status: result.status, creditsRemaining })}`,
    );
    return NextResponse.json(
      { error: result.message, creditsRemaining },
      { status: result.status },
    );
  }

  console.log(
    `[ENGINEERING_RESPONSE] ${JSON.stringify({
      ok: true,
      status: 200,
      operations: result.geometry.operations.length,
      creditsRemaining,
    })}`,
  );
  return NextResponse.json({ geometry: result.geometry, creditsRemaining });
}
