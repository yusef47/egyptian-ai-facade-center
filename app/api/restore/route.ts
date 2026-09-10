import { NextResponse } from "next/server";
import { executeRestore } from "../../../lib/openrouter-engine.js";
import {
  checkGenerationCredits,
  deductGenerationCredit,
  getGenerationUserId,
  getSupabaseAdminClient,
  getRemainingCredits,
} from "../../../lib/credits.js";
import { dedupe, rateLimit } from "../../../lib/request-guards.js";
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
  // 1) Per-user rate limit: max 5 generation requests per rolling minute.
  const limiterKey = getClientKey(request);
  const limited = rateLimit(limiterKey);
  if (!limited.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many generations in a row. Please wait a moment before trying again.",
      },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 2) Identity + daily credit gate: verifies the caller's Supabase session
  //    (bearer token first, cookie fallback) and re-fetches the REAL balance
  //    from Supabase (never trusts client-side values). Bypassed while
  //    Supabase credentials are not configured yet.
  const creditCheck = await checkGenerationCredits(request);
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: creditCheck.message }, { status: creditCheck.status });
  }
  const userId = getGenerationUserId(creditCheck);

  // 3) Duplicate-request guard: same user within 3s is rejected before any
  //    generation work, protecting the balance from double-click double-fires.
  if (userId) {
    const duplicate = dedupe(userId);
    if (!duplicate.allowed) {
      return NextResponse.json(
        { error: "A generation is already in progress. Please wait a few seconds." },
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

  // 4) Input validation: the payload must carry a genuine image (MIME
  //    allowlist + magic-byte sniffing, max 10MB).
  const payload = (body ?? {}) as { imageDataUrl?: unknown };
  const imageCheck = validateImageDataUrl(payload.imageDataUrl);
  if (!imageCheck.ok) {
    return NextResponse.json({ error: imageCheck.message }, { status: imageCheck.status });
  }

  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(request),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  // ── Credit deduction: EXACTLY ONCE per successful generation ──────────
  // Charged only after a successful, clean, watermark-free render. The RPC
  // is atomic (credits > 0 check, -1 credit, +1 generations_used) and this
  // is the single call site — no retries, no loops.
  let creditsRemaining: number | null = null;
  if (userId) {
    const oldBalance = creditCheck.allowed ? creditCheck.remaining : null;
    const deduction = await deductGenerationCredit(userId);
    if (deduction.ok) {
      creditsRemaining = typeof deduction.remaining === "number" ? deduction.remaining : null;
      // Authoritative re-fetch after deduction (guards against any drift and
      // satisfies the pre/post balance verification requirement).
      const admin = getSupabaseAdminClient();
      if (admin && creditsRemaining === null) {
        creditsRemaining = await getRemainingCredits(admin, userId);
      }
      // Server-side audit trail for production tracing.
      console.log(
        `[credits] deducted userId=${userId} oldBalance=${oldBalance ?? "unknown"} newBalance=${creditsRemaining ?? "unknown"}`,
      );
    } else {
      // A concurrent request drained the balance mid-flight (P0001); report
      // the exhausted state so the header counter drops to zero.
      creditsRemaining = 0;
      console.log(
        `[credits] deduction blocked (insufficient funds) userId=${userId} attemptedFrom=${oldBalance ?? "unknown"}`,
      );
    }
  }

  return NextResponse.json({
    imageDataUrl: result.imageDataUrl,
    creditsRemaining,
  });
}
