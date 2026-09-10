import { NextResponse } from "next/server";
import { executeRestore } from "../../../lib/openrouter-engine.js";
import { checkGenerationCredits, deductGenerationCredit } from "../../../lib/credits.js";

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
  // Daily credit gate: 10 free generations per 24h per signed-in user.
  // Bypassed (allowed) when Supabase credentials are not configured yet.
  const creditCheck = await checkGenerationCredits(request);
  if (!creditCheck.allowed) {
    return NextResponse.json(
      { error: creditCheck.message },
      { status: creditCheck.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "صيغة الطلب غير صالحة." },
      { status: 400 },
    );
  }

  const result = await executeRestore(body, {
    apiKey: process.env.OPENROUTER_API_KEY,
    clientKey: getClientKey(request),
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status },
    );
  }

  // Charge one credit only after a successful, clean, watermark-free render.
  if (creditCheck.userId) {
    void deductGenerationCredit(creditCheck.userId);
  }

  return NextResponse.json({ imageDataUrl: result.imageDataUrl });
}
