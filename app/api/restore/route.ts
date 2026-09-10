import { NextResponse } from "next/server";
import { executeRestore } from "../../../lib/openrouter-engine.js";
import {
  checkGenerationCredits,
  deductGenerationCredit,
  getGenerationUserId,
} from "../../../lib/credits.js";

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
  // Identity + daily credit gate: verifies the caller's Supabase session
  // (bearer token first, cookie fallback) and enforces a positive balance.
  // Bypassed (allowed) while Supabase credentials are not configured yet.
  const creditCheck = await checkGenerationCredits(request);
  if (!creditCheck.allowed) {
    return NextResponse.json({ error: creditCheck.message }, { status: creditCheck.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "صيغة الطلب غير صالحة." }, { status: 400 });
  }

  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(request),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  // Charge one credit only after a successful, clean, watermark-free render,
  // then return the authoritative balance so the UI counter updates instantly.
  const userId = getGenerationUserId(creditCheck);
  let creditsRemaining: number | null = null;
  if (userId) {
    const deduction = await deductGenerationCredit(userId);
    if (deduction.ok && typeof deduction.remaining === "number") {
      creditsRemaining = deduction.remaining;
    } else if (!deduction.ok) {
      // A concurrent request drained the balance mid-flight (P0001); report
      // the exhausted state so the header counter drops to zero.
      creditsRemaining = 0;
    }
  }

  return NextResponse.json({
    imageDataUrl: result.imageDataUrl,
    creditsRemaining,
  });
}
