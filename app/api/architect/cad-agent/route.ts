import { NextResponse } from "next/server";
import { authorizeArchitectPilot } from "../../../../lib/admin";
import { getSupabaseAdminClient } from "../../../../lib/credits";
import { isAllowedOrigin } from "../../../../lib/origin";
import { rateLimit } from "../../../../lib/request-guards";
import {
  CAD_AGENT, CadCommandValidationError, CadGeometryBoundsError, cadAgentAvailable, cadCompletionReady, compileCadCommands, critiqueCadPlan, getCadSandbox, parseCadInput, proposeCadCommands,
  readCadDownload, readCadInspection, retryCadSetup, rollbackCadProject, runCadAction, setupCadSandbox,
} from "../../../../lib/architect/cad-agent";
import { evaluateCadPlanQuality } from "../../../../lib/architect/cad-plan-quality";

export const runtime = "nodejs";
export const maxDuration = 300;

async function authorize(request: Request) {
  if (!cadAgentAvailable()) return null;
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const gate = await authorizeArchitectPilot(request, admin);
  return gate.authorized ? gate.userId : null;
}

function withQualityChecks<T extends { objects: { id?: string; semantic?: string; text?: string; kind?: string; boundsMm?: number[]; positionMm?: number[]; wallStartMm?: number[]; wallEndMm?: number[]; wallThicknessMm?: number; hostWallId?: string; openingOffsetMm?: number; openingWidthMm?: number }[]; siteMm: number[]; warnings: string[] }>(inspection: T, instruction: string, program: string[] = [], enabled = false) {
  if (!enabled) return inspection;
  const qualityIssues = evaluateCadPlanQuality(inspection, `${instruction} ${program.join(" ")}`);
  return { ...inspection, qualityIssues, warnings: [...inspection.warnings, ...qualityIssues.map((issue) => issue.message)].slice(0, 60) };
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
      counts: drawing.inspection.counts, warnings: drawing.inspection.warnings, qualityChecksEvaluated: false, unverifiedChecks: drawing.inspection.unverifiedChecks ?? [],
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
    const selectedProgram = input.selectedConcept?.program ?? [];
    const selectedPilot = Boolean(input.selectedConcept);
    const previousInspection = previous.inspection ? withQualityChecks(previous.inspection, input.instruction, selectedProgram, selectedPilot) : null;
    let action = await proposeCadCommands(input, previousInspection, previous.preview);
    let result = await runCadAction(sandbox, input, { python: compileCadCommands(action), summary: action.summary, done: action.done });
    let inspected = withQualityChecks(result.inspection, input.instruction, selectedProgram, selectedPilot);
    let review: Awaited<ReturnType<typeof critiqueCadPlan>> = null;
    const finalReviewRequired = selectedPilot && (action.done || input.step === CAD_AGENT.maxSteps - 1);
    if (finalReviewRequired) {
      review = await critiqueCadPlan(input, inspected, result.preview).catch(() => null);
    }
    await sandbox.stop();
    const reviewReady = !finalReviewRequired || review?.verdict === "ready";
    const reviewCandidate = { ...action, done: action.done || (finalReviewRequired && review?.verdict === "ready") };
    return NextResponse.json({
      summary: action.summary, selfReview: action.selfReview, requiredElements: action.requiredElements, unresolvedItems: [...action.unresolvedItems, ...(!reviewReady ? ["Post-execution architectural review still requires revision or could not be completed"] : [])],
      modelDone: action.done, done: reviewReady && cadCompletionReady(reviewCandidate, inspected), step: input.step + 1,
      architectureReview: review ? { verdict: review.verdict, summary: review.summary, issues: review.issues, rubric: review.rubric } : finalReviewRequired ? { verdict: "revise", summary: "Post-execution review could not be completed", issues: [], rubric: [] } : null,
      previewSvg: result.preview, inspection: {
        counts: inspected.counts, warnings: inspected.warnings, qualityChecksEvaluated: selectedPilot, qualityIssues: inspected.qualityIssues, unverifiedChecks: inspected.unverifiedChecks ?? [], wallBaselineReady: inspected.wallBaselineReady ?? false, wallBaselineIds: inspected.wallBaselineIds ?? [], wallCurrentIds: inspected.wallCurrentIds ?? [], wallBaselineCount: inspected.wallBaselineCount ?? 0, wallCurrentCount: inspected.wallCurrentCount ?? 0, wallChanges: inspected.wallChanges ?? [],
        objects: inspected.objects.length, segments: inspected.segments,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (error instanceof CadGeometryBoundsError) console.error("[CAD_STEP_FAILED]", JSON.stringify({ kind: "geometry_outside_site", violations: error.violations }));
    else if (error instanceof CadCommandValidationError) console.error("[CAD_STEP_FAILED]", JSON.stringify({ kind: "model_output_rejected", ...error.diagnostic }));
    else console.error("[CAD_STEP_FAILED]", JSON.stringify({ kind: message.startsWith("FreeCAD action failed:") ? "freecad_execution_failed" : "request_failed", errorName: error instanceof Error ? error.name.slice(0, 60) : "unknown" }));
    if (sandbox) await sandbox.stop().catch(() => {});
    return NextResponse.json({ error: error instanceof CadGeometryBoundsError
      ? `FreeCAD action failed: ${error.message}`
      : message.startsWith("FreeCAD action failed:")
      ? `فشلت خطوة الرسم داخل FreeCAD: ${message.slice(23, 350)}`
      : error instanceof CadCommandValidationError && error.diagnostic.op === "furniture"
      ? `فشل فحص عنصر أثاث في استجابة CAD بعد محاولة تصحيح واحدة (${error.diagnostic.reasonCode ?? "invalid_furniture"}${error.diagnostic.commandIndex !== undefined ? `، الأمر ${error.diagnostic.commandIndex + 1}` : ""}). لم يتغير المشروع المحفوظ؛ راجع أبعاد العنصر وموقعه ثم أعد المحاولة.`
      : error instanceof CadCommandValidationError
      ? `فشل التحقق من استجابة CAD بعد محاولة تصحيح واحدة (${error.diagnostic.category}${error.diagnostic.commandIndex !== undefined ? `، الأمر ${error.diagnostic.commandIndex + 1}` : ""}). لم يتغير المشروع المحفوظ؛ أعد المحاولة.`
      : "تعذّر إكمال خطوة CAD. المشروع المحفوظ لم يتغير؛ حاول مرة أخرى." }, { status: 502 });
  }
}
