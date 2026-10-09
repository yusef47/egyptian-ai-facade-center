import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import {
  generateBlenderScript,
  isBlenderLabEnabled,
  parseBlenderLabInput,
  reviewBlenderScript,
  runBlenderInSandbox,
} from "../../../../lib/architect/blender-lab";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!isBlenderLabEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await authorizeArchitectPilot(request, adminClient);
  if (!gate.authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ available: true }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  if (!isBlenderLabEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`architect-blender:${request.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown"}`);
  if (!limited.allowed) return NextResponse.json({ error: "Please wait before trying again" }, { status: 429 });
  const adminClient = getSupabaseAdminClient();
  if (!adminClient) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const gate = await authorizeArchitectPilot(request, adminClient);
  if (!gate.authorized) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let raw: unknown;
  try { raw = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const input = parseBlenderLabInput(raw);
  if (!input) return NextResponse.json({ error: "Invalid site, message or previous script" }, { status: 400 });

  try {
    const draft = await generateBlenderScript(input);
    const reviewed = await reviewBlenderScript(input, draft);
    const glb = await runBlenderInSandbox(reviewed.script);
    return NextResponse.json({ ...reviewed, glbBase64: glb.toString("base64") }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[BLENDER_LAB_FAILED]", message.slice(0, 1500));
    if (message.startsWith("Reviewed Blender script still has geometry errors")) {
      return NextResponse.json({ error: "النموذج لم يجتز مراجعة الأبعاد والفتحات، لذلك لم نعرضه. حاول مرة أخرى." }, { status: 422 });
    }
    return NextResponse.json({ error: "Blender could not build this concept. Try a simpler request." }, { status: 502 });
  }
}
