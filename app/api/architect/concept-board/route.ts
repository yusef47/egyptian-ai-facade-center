import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import {
  generateConceptBoard,
  generateConceptDialogue,
  isConceptBoardAvailable,
  parseConceptDialogue,
  parseConceptDialogueInput,
} from "../../../../lib/architect/concept-board";

export const runtime = "nodejs";
// Stay within Vercel Hobby's 60s ceiling even when Fluid Compute is disabled.
export const maxDuration = 60;

async function authorize(request: Request): Promise<string | null> {
  if (!isConceptBoardAvailable()) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const gate = await authorizeArchitectPilot(request, admin);
  return gate.authorized ? gate.userId : null;
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  const userId = await authorize(request);
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`concept-board:${userId}`);
  if (!limited.allowed) return NextResponse.json({ error: "انتظر قليلًا قبل طلب آخر." }, { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const value = body as Record<string, unknown>;
  try {
    if (value.action === "dialogue") {
      const input = parseConceptDialogueInput(value);
      if (!input) return NextResponse.json({ error: "وصف الطلب أو سجل الحوار غير صالح." }, { status: 400 });
      const result = await generateConceptDialogue(input);
      return NextResponse.json({ ...result.dialogue, costUsd: result.costUsd }, { headers: { "Cache-Control": "no-store" } });
    }
    if (value.action === "board") {
      const parsed = parseConceptDialogue({ type: "concepts", reply: "Validated concepts", concepts: value.concepts });
      if (!parsed || parsed.type !== "concepts") return NextResponse.json({ error: "المفاهيم الثلاثة غير صالحة." }, { status: 400 });
      // One explicit user action starts exactly one upstream image request.
      const result = await generateConceptBoard(parsed.concepts);
      return NextResponse.json({ imageDataUrl: result.imageDataUrl, model: "Nano Banana 2 Lite", requestCount: 1, costUsd: result.costUsd }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Concept request failed";
    const imageFailure = value.action === "board";
    console.warn("[CONCEPT_BOARD_REQUEST_FAILED]", JSON.stringify({ action: imageFailure ? "board" : "dialogue", category: imageFailure ? "image_generation" : "concept_interview" }));
    return NextResponse.json({ error: message.slice(0, 240), requestCount: imageFailure ? 1 : undefined }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
