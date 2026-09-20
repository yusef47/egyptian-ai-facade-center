import { NextResponse } from "next/server";
import { ENGINE_BUSY_BILINGUAL, executeRestore } from "../../../lib/openrouter-engine.js";
import {
  AUTH_REQUIRED_BILINGUAL,
  CREDITS_EXHAUSTED_BILINGUAL,
  deductGenerationCredit,
  provisionProfileCredits,
  readProfileCredits,
  refreshDailyCredits,
  refundGenerationCredit,
  verifySupabaseUser,
} from "../../../lib/credits.js";
import { RATE_LIMIT_MESSAGE_BILINGUAL, rateLimit } from "../../../lib/request-guards.js";
import { isAllowedOrigin } from "../../../lib/origin.js";
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
  // 0) CSRF origin gate: the apex (qattan-ai.com), www, Vercel deployments,
  //    and localhost are all trusted first-party origins. The apex MUST be
  //    allowed — Vercel serves the site from both hosts, and a www-only
  //    allowlist would 403 every visitor landing on qattan-ai.com.
  if (!isAllowedOrigin(request)) {
    console.log(
      `[RESTORE_403_REASON] ${JSON.stringify({ reason: "origin_rejected", status: 403, origin: request.headers.get("origin") })}`,
    );
    return NextResponse.json(
      { error: "Request origin is not allowed." },
      { status: 403 },
    );
  }

  // 1) Per-IP abuse guard: 15 requests per rolling minute (keeps bursts off).
  const limited = rateLimit(getClientKey(request));
  if (!limited.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE_BILINGUAL },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 2) Authenticate: bearer token first, cookie fallback. No verified user →
  //    401 with nothing generated. This route has NO unauthenticated
  //    fallback: every render past this point is attributed to `userId` and
  //    paid for by a real deduction, so a missing Authorization header can
  //    never produce a free generation.
  const userId = await verifySupabaseUser(request);
  const hasSession = Boolean(userId);
  console.log(`[RESTORE_START] ${JSON.stringify({ userId: userId ?? null, hasSession })}`);
  if (!userId) {
    // Pinpoint the exact auth failure class for Vercel log triage:
    // missing_bearer_token = no Authorization header at all;
    // auth_verification_failed = a token was sent but Supabase rejected it
    // (expired, revoked, or wrong audience) — the client auto-refreshes
    // expired tokens before the call, so this now indicates a deeper issue.
    const authReason = request.headers.get("authorization")
      ? "auth_verification_failed"
      : "missing_bearer_token";
    console.log(
      `[RESTORE_403_REASON] ${JSON.stringify({ reason: authReason, status: 401 })}`,
    );
    // Diagnostics for the "generated but never charged" failure class: record
    // whether the browser attached a credential at all.
    console.log(
      `[AUTH_REQUIRED] ${JSON.stringify({
        hasBearerHeader: Boolean(request.headers.get("authorization")),
        hasCookie: Boolean(request.headers.get("cookie")),
      })}`,
    );
    return NextResponse.json({ error: AUTH_REQUIRED_BILINGUAL }, { status: 401 });
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
    console.log(
      `[RESTORE_403_REASON] ${JSON.stringify({ reason: "service_role_error", status: 503 })}`,
    );
    console.log("[NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json(
      { error: "Credit service unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  // 4) Refresh: returns the current balance (resets at the Cairo midnight
  //    boundary). A null here means the profile row is UNREADABLE — most
  //    commonly a user who signed up before the on_auth_user_created trigger
  //    existed. Provision-on-first-use instead of answering 429: locking
  //    paying users out with "daily limit reached" when they actually hold a
  //    fresh allowance is exactly the class of bug this gate must never
  //    produce. Provisioning is race-safe (ignoreDuplicates) and re-reads the
  //    authoritative row when a concurrent provision wins.
  let creditsAfterRefresh = await refreshDailyCredits(admin, userId);
  if (creditsAfterRefresh === null) {
    console.log(`[REFRESH_PROFILE_MISSING] provisioning on first use: ${JSON.stringify({ userId })}`);
    creditsAfterRefresh = await provisionProfileCredits(admin, userId);
  }
  console.log(`[REFRESH_CHECK] ${JSON.stringify({ userId, creditsAfterRefresh })}`);
  if (creditsAfterRefresh === null || creditsAfterRefresh <= 0) {
    return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
  }

  // 5) Deduct exactly 1 credit atomically (pre-generation).
  console.log(`[PRE_DEDUCT] ${JSON.stringify({ userId, currentCredits: creditsAfterRefresh })}`);
  const deduction = await deductGenerationCredit(userId);
  if (!deduction.ok) {
    console.log(
      `[DEDUCT_FAILED] ${JSON.stringify({
        userId,
        reason: deduction.reason,
        remaining: deduction.remaining ?? null,
      })}`,
    );
    // Only a genuinely empty balance is reported as such. A failed RPC (bad
    // parameter name, missing function, permission) is an engine problem and
    // must never be presented to the user as "your credits ran out".
    return deduction.reason === "insufficient"
      ? NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 })
      : NextResponse.json({ error: ENGINE_BUSY_BILINGUAL }, { status: 503 });
  }
  // The response MUST always carry a numeric balance: the client only
  // broadcasts the header-badge update when `creditsRemaining` is a number,
  // so a null here freezes the badge at its stale value.
  let creditsRemaining = typeof deduction.remaining === "number" ? deduction.remaining : null;
  if (creditsRemaining === null) {
    creditsRemaining = await readProfileCredits(admin, userId);
    console.log(`[CREDITS_FALLBACK_READ] ${JSON.stringify({ userId, creditsRemaining })}`);
  }
  if (creditsRemaining === null) {
    // Last resort: the pre-deduction balance we refreshed at step 4 minus the
    // single credit just charged — guarantees the badge still moves.
    creditsRemaining = Math.max((creditsAfterRefresh ?? 1) - 1, 0);
    console.log(`[CREDITS_ESTIMATED] ${JSON.stringify({ userId, creditsRemaining })}`);
  }
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
    if (creditsRemaining === null) creditsRemaining = await readProfileCredits(admin, userId);
    console.log(
      `[CREDIT_REFUNDED] ${JSON.stringify({ userId, ok: refund.ok, remaining: refund.remaining ?? null })}`,
    );
    console.log(`[RESPONSE] ${JSON.stringify({ ok: false, status: result.status, creditsRemaining })}`);
    return NextResponse.json(
      { error: result.message, creditsRemaining },
      { status: result.status },
    );
  }

  console.log(`[RESPONSE] ${JSON.stringify({ ok: true, status: 200, creditsRemaining })}`);
  return NextResponse.json({
    imageDataUrl: result.imageDataUrl,
    creditsRemaining,
  });
}
