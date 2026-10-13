import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import {
  cadAgentAvailable, cadCompletionReady, compileCadCommands, getCadSandbox, parseCadInput, proposeCadCommands,
  readCadDownload, readCadInspection, retryCadSetup, rollbackCadProject, runCadAction, setupCadSandbox,
} from "../../../../lib/architect/cad-agent";

export const runtime = "nodejs";
export const maxDuration = 300;

async function authorize(request: Request) {
  if (!cadAgentAvailable()) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const gate = await authorizeArchitectPilot(request, admin);
  return gate.authorized ? gate.userId : null;
}

export async function GET(request: Request) {
  const userId = await authorize(request);
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");
  if (!projectId || !/^[0-9a-f]{24}$/.test(projectId)) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  try {
    const sandbox = await getCadSandbox(userId);
    const file = url.searchParams.get("file");
    if (file) {
      if (file !== "fcstd" && file !== "dxf") return NextResponse.json({ error: "Invalid file" }, { status: 400 });
      const data = await readCadDownload(sandbox, projectId, file);
      await sandbox.stop();
      return new Response(new Uint8Array(data), { headers: {
        "Content-Type": file === "dxf" ? "application/dxf" : "application/octet-stream",
        "Content-Disposition": `attachment; filename="qattan-cad-project.${file === "fcstd" ? "FCStd" : "dxf"}"`,
        "Cache-Control": "no-store",
      } });
    }
    const state = await setupCadSandbox(sandbox);
    const drawing = state === "ready" ? await readCadInspection(sandbox, projectId) : null;
    if (drawing) await sandbox.stop();
    return NextResponse.json({ state, previewSvg: drawing?.preview ?? null, inspection: drawing?.inspection ? {
      counts: drawing.inspection.counts, warnings: drawing.inspection.warnings, unverifiedChecks: drawing.inspection.unverifiedChecks ?? [],
      objects: drawing.inspection.objects.length, segments: drawing.inspection.segments,
    } : null }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[CAD_STATUS_FAILED]", error instanceof Error ? error.message.slice(0, 700) : "unknown");
    return NextResponse.json({ error: "تعذر تجهيز بيئة CAD" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!isAllowedOrigin(request)) return NextResponse.json({ error: "Origin denied" }, { status: 403 });
  const userId = await authorize(request);
  if (!userId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const limited = rateLimit(`cad-agent:${userId}`);
  if (!limited.allowed) return NextResponse.json({ error: "استنى لحظة قبل الخطوة الجاية" }, { status: 429 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).action === "retry-setup") {
    const projectId = (data as Record<string, unknown>).projectId;
    if (typeof projectId !== "string" || !/^[0-9a-f]{24}$/.test(projectId)) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    try {
      const sandbox = await getCadSandbox(userId);
      await retryCadSetup(sandbox);
      const state = await setupCadSandbox(sandbox);
      return NextResponse.json({ state }, { status: 202 });
    } catch (error) {
      console.error("[CAD_SETUP_RETRY_FAILED]", error instanceof Error ? error.message.slice(0, 700) : "unknown");
      return NextResponse.json({ error: "تعذر إعادة تجهيز FreeCAD" }, { status: 503 });
    }
  }
  if (data && typeof data === "object" && !Array.isArray(data) && (data as Record<string, unknown>).action === "undo") {
    const projectId = (data as Record<string, unknown>).projectId;
    if (typeof projectId !== "string" || !/^[0-9a-f]{24}$/.test(projectId)) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
    let sandbox;
    try {
      sandbox = await getCadSandbox(userId);
      if (await setupCadSandbox(sandbox) !== "ready") return NextResponse.json({ error: "FreeCAD is not ready" }, { status: 503 });
      const result = await rollbackCadProject(sandbox, projectId);
      await sandbox.stop();
      return NextResponse.json({ previewSvg: result.preview, inspection: { counts: result.inspection.counts, warnings: result.inspection.warnings, unverifiedChecks: result.inspection.unverifiedChecks ?? [], objects: result.inspection.objects.length, segments: result.inspection.segments } });
    } catch (error) {
      if (sandbox) await sandbox.stop().catch(() => {});
      return NextResponse.json({ error: error instanceof Error ? error.message : "CAD undo failed" }, { status: 409 });
    }
  }
  const input = parseCadInput(data);
  if (!input) return NextResponse.json({ error: "طلب CAD أو أبعاد الأرض غير صالحة" }, { status: 400 });
  let sandbox;
  try {
    sandbox = await getCadSandbox(userId);
    const state = await setupCadSandbox(sandbox);
    if (state !== "ready") return NextResponse.json({ state }, { status: state === "error" ? 503 : 202 });
    const previous = await readCadInspection(sandbox, input.projectId);
    const action = await proposeCadCommands(input, previous.inspection, previous.preview);
    const result = await runCadAction(sandbox, input, { python: compileCadCommands(action), summary: action.summary, done: action.done });
    await sandbox.stop();
    return NextResponse.json({
      summary: action.summary, selfReview: action.selfReview, requiredElements: action.requiredElements, unresolvedItems: action.unresolvedItems,
      modelDone: action.done, done: cadCompletionReady(action, result.inspection), step: input.step + 1,
      previewSvg: result.preview, inspection: {
        counts: result.inspection.counts, warnings: result.inspection.warnings, unverifiedChecks: result.inspection.unverifiedChecks ?? [],
        objects: result.inspection.objects.length, segments: result.inspection.segments,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    console.error("[CAD_STEP_FAILED]", message.slice(0, 1500));
    if (sandbox) await sandbox.stop().catch(() => {});
    return NextResponse.json({ error: message.startsWith("FreeCAD action failed:")
      ? `فشلت خطوة الرسم داخل FreeCAD: ${message.slice(23, 350)}`
      : "تعذّر إكمال خطوة CAD. المشروع المحفوظ لم يتغير؛ حاول مرة أخرى." }, { status: 502 });
  }
}
