import { NextResponse } from "next/server";
import { authorizeArchitectPilot, isArchitectPilotUser } from "../../../../lib/admin.js";
import {
  AUTH_REQUIRED_BILINGUAL,
  CREDITS_EXHAUSTED_BILINGUAL,
  deductGenerationCredit,
  getSupabaseAdminClient,
  provisionProfileCredits,
  readProfileCredits,
  refreshDailyCredits,
  refundGenerationCredit,
  verifySupabaseUser,
} from "../../../../lib/credits.js";
import { RATE_LIMIT_MESSAGE_BILINGUAL, rateLimit } from "../../../../lib/request-guards.js";
import { isAllowedOrigin } from "../../../../lib/origin.js";
import { ENGINE_BUSY_BILINGUAL } from "../../../../lib/openrouter-engine.js";
import {
  ARCHITECT_INTERPRETER,
  ARCHITECT_MESSAGE_CREDIT_COST,
  ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
  executeInterpretation,
  isArchitectInterpreterAvailable,
  type ChatTurn,
} from "../../../../lib/architect-interpreter.js";
import {
  applyBriefPatch,
  parseWorkspaceBrief,
  toLayoutBrief,
} from "../../../../lib/architect/brief-patch.js";
import { generateLayout } from "../../../../lib/architect/generate.js";
import {
  applyRoomActions,
  buildRoomPlan,
  defaultRoomProgram,
  parseRoomProgram,
} from "../../../../lib/architect/room-plan.js";
import { compileDesignProposal, designMatchesSite } from "../../../../lib/architect/building-proposal.js";
import { buildBuildingModelObj } from "../../../../lib/architect/building-model-obj.js";
import { DEFAULT_WALL_MESH_PRESET, parseWallMeshPreset } from "../../../../lib/architect/wall-mesh.js";

/**
 * Isolated server route that interprets one workspace chat message into a
 * validated BriefPatch, a clarification, or an honest unsupported answer.
 *
 * It follows the exact guard chain of /api/restore (origin → per-IP rate
 * limit → Supabase auth → credit deduct → compensating refund on failure)
 * and shares nothing with the image pipeline: the model ID comes from
 * OPENROUTER_ARCHITECT_TEXT_MODEL (never OPENROUTER_MODEL), and patch
 * outcomes are re-applied through applyBriefPatch here before the client
 * ever sees them.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

/** Honest notice when a model-proposed patch fails regeneration server-side. */
const PATCH_INFEASIBLE_BILINGUAL =
  "That change is not feasible on the current site, so the plan was left unchanged. | هذا التعديل غير ممكن على الموقع الحالي، لذا لم يتغير المخطط.";
const CONCEPT_INFEASIBLE_BILINGUAL =
  "The proposed plan did not pass geometry, access or clash checks, so it was not applied. | المخطط المقترح لم يجتز فحص الرسم أو الوصول أو اصطدام العناصر، لذلك لم يُطبّق.";

function getClientKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0].trim() || "unknown";
}

/** GET: read-only availability + cost probe so the UI can show an honest
 *  unavailable state BEFORE the user types. Never consumes credits. */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin || !(await authorizeArchitectPilot(request, admin)).authorized) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const available = isArchitectInterpreterAvailable();
  return NextResponse.json({ available, cost: ARCHITECT_MESSAGE_CREDIT_COST }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  // 1) CSRF origin gate (same allowlist as /api/restore).
  if (!isAllowedOrigin(request)) {
    console.log(
      `[ARCHITECT_403_REASON] ${JSON.stringify({ reason: "origin_rejected", origin: request.headers.get("origin") })}`,
    );
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  // 2) Per-IP rate limit, namespaced so chat never steals the image bucket.
  const limited = rateLimit(`architect-interpret:${getClientKey(request)}`);
  if (!limited.allowed) {
    return NextResponse.json(
      { error: RATE_LIMIT_MESSAGE_BILINGUAL },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  // 3) Authenticate — no unauthenticated interpretation path exists.
  const userId = await verifySupabaseUser(request);
  if (!userId) {
    const authReason = request.headers.get("authorization")
      ? "auth_verification_failed"
      : "missing_bearer_token";
    console.log(`[ARCHITECT_403_REASON] ${JSON.stringify({ reason: authReason, status: 401 })}`);
    return NextResponse.json({ error: AUTH_REQUIRED_BILINGUAL }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin || !(await isArchitectPilotUser(admin, userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 4) Validate the payload BEFORE any credit moves.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request format. | صيغة الطلب غير صالحة." }, { status: 400 });
  }
  const payload = (body ?? {}) as { message?: unknown; brief?: unknown; roomProgram?: unknown; conceptProposal?: unknown; wallMeshPreset?: unknown; history?: unknown };

  if (
    typeof payload.message !== "string" ||
    payload.message.trim().length === 0 ||
    payload.message.length > ARCHITECT_INTERPRETER.MAX_MESSAGE_CHARS
  ) {
    return NextResponse.json(
      {
        error: `Message must be 1-${ARCHITECT_INTERPRETER.MAX_MESSAGE_CHARS} characters. | يجب أن يكون الرسالة بين 1 و${ARCHITECT_INTERPRETER.MAX_MESSAGE_CHARS} حرفًا.`,
      },
      { status: 400 },
    );
  }
  const briefCheck = parseWorkspaceBrief(payload.brief);
  if (!briefCheck.ok || !briefCheck.brief) {
    return NextResponse.json({ error: "Invalid brief. | موجز غير صالح." }, { status: 400 });
  }
  const roomProgram = payload.roomProgram === undefined
    ? defaultRoomProgram()
    : parseRoomProgram(payload.roomProgram);
  if (!roomProgram) {
    return NextResponse.json({ error: "Invalid room program. | برنامج الغرف غير صالح." }, { status: 400 });
  }
  const wallMeshPreset = payload.wallMeshPreset === undefined
    ? DEFAULT_WALL_MESH_PRESET
    : parseWallMeshPreset(payload.wallMeshPreset);
  if (!wallMeshPreset) {
    return NextResponse.json({ error: "Invalid model dimensions. | أبعاد النموذج غير صالحة." }, { status: 400 });
  }
  const currentConcept = payload.conceptProposal === undefined
    ? null
    : compileDesignProposal(payload.conceptProposal);
  if (currentConcept && !currentConcept.ok) {
    return NextResponse.json({ error: "Invalid concept plan. | المخطط الحر غير صالح." }, { status: 400 });
  }
  if (currentConcept?.ok && !designMatchesSite(currentConcept.proposal, briefCheck.brief.siteWidth, briefCheck.brief.siteDepth)) {
    return NextResponse.json({ error: "Concept site differs from brief. | حدود المخطط تختلف عن أبعاد الأرض." }, { status: 400 });
  }
  const currentLayout = generateLayout(toLayoutBrief(briefCheck.brief));
  if (!currentLayout.ok || currentLayout.options.some((option) =>
    !buildRoomPlan(option.geometry, roomProgram, option.coreSide).ok
  )) {
    return NextResponse.json({ error: "Room program does not fit the current site. | برنامج الغرف لا يلائم الموقع الحالي." }, { status: 400 });
  }
  if (payload.history !== undefined && !Array.isArray(payload.history)) {
    return NextResponse.json({ error: "Invalid history. | سجل غير صالح." }, { status: 400 });
  }

  // 5) Text-model availability — checked BEFORE the deduction, so an
  //    unconfigured server can never charge for a call it will not make.
  if (!isArchitectInterpreterAvailable()) {
    console.log("[ARCHITECT_TEXT_MODEL_UNAVAILABLE]");
    return NextResponse.json(
      {
        error: ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
        code: "TEXT_MODEL_UNAVAILABLE",
        available: false,
        cost: ARCHITECT_MESSAGE_CREDIT_COST,
      },
      { status: 503 },
    );
  }

  // 6) Refresh (Cairo-midnight rule), provision-on-first-use — same policy
  //    as /api/restore: never lock a paying user out behind a null row.
  let creditsAfterRefresh = await refreshDailyCredits(admin, userId);
  if (creditsAfterRefresh === null) {
    console.log(`[ARCHITECT_REFRESH_MISSING] provisioning on first use: ${JSON.stringify({ userId })}`);
    creditsAfterRefresh = await provisionProfileCredits(admin, userId);
  }
  if (creditsAfterRefresh === null || creditsAfterRefresh <= 0) {
    return NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 });
  }

  // 7) Pre-deduct exactly one credit (ARCHITECT_MESSAGE_CREDIT_COST = 1).
  const deduction = await deductGenerationCredit(userId);
  if (!deduction.ok) {
    console.log(`[ARCHITECT_DEDUCT_FAILED] ${JSON.stringify({ userId, reason: deduction.reason })}`);
    return deduction.reason === "insufficient"
      ? NextResponse.json({ error: CREDITS_EXHAUSTED_BILINGUAL }, { status: 429 })
      : NextResponse.json({ error: ENGINE_BUSY_BILINGUAL }, { status: 503 });
  }
  let creditsRemaining =
    typeof deduction.remaining === "number" ? deduction.remaining : null;
  if (creditsRemaining === null) {
    creditsRemaining = await readProfileCredits(admin, userId);
  }
  if (creditsRemaining === null) {
    creditsRemaining = Math.max((creditsAfterRefresh ?? 1) - 1, 0);
  }

  // 8) Interpret with the dedicated text model.
  const message = (payload.message as string).trim();
  const history = Array.isArray(payload.history) ? (payload.history as ChatTurn[]) : undefined;
  const result = await executeInterpretation({
    message,
    brief: briefCheck.brief,
    roomProgram,
    conceptProposal: currentConcept?.ok ? currentConcept.proposal : undefined,
    history,
  });

  const refund = async (): Promise<number | null> => {
    const refundResult = await refundGenerationCredit(userId);
    let balance: number | null =
      typeof refundResult.remaining === "number" ? refundResult.remaining : creditsRemaining;
    if (balance === null) balance = await readProfileCredits(admin, userId);
    console.log(
      `[ARCHITECT_CREDIT_REFUNDED] ${JSON.stringify({ userId, ok: refundResult.ok, remaining: refundResult.remaining ?? null })}`,
    );
    return balance;
  };

  if (!result.ok) {
    const balance = await refund();
    console.log(`[ARCHITECT_INTERPRET_FAILED] ${JSON.stringify({ userId, status: result.status })}`);
    return NextResponse.json({ error: result.message, creditsRemaining: balance }, { status: result.status });
  }

  if (currentConcept && (result.outcome.type === "patch" || result.outcome.type === "room_actions")) {
    const balance = await refund();
    return NextResponse.json(
      { error: PATCH_INFEASIBLE_BILINGUAL, code: "CONCEPT_MODE_ACTION_INVALID", creditsRemaining: balance },
      { status: 422 },
    );
  }

  // 9) Server-side re-application gate: even a schema-valid patch must
  //    regenerate a valid layout here, or the client never sees it.
  if (result.outcome.type === "patch") {
    const applied = applyBriefPatch(briefCheck.brief, result.outcome.patch);
    if (!applied.ok || applied.result.options.some((option) =>
      !buildRoomPlan(option.geometry, roomProgram, option.coreSide).ok
    )) {
      const balance = await refund();
      console.log(
        `[ARCHITECT_PATCH_INFEASIBLE] ${JSON.stringify({ userId, reason: applied.ok ? "room_program" : applied.errors.map((error) => error.code) })}`,
      );
      return NextResponse.json(
        { error: PATCH_INFEASIBLE_BILINGUAL, code: "PATCH_INFEASIBLE", creditsRemaining: balance },
        { status: 422 },
      );
    }
  }
  if (result.outcome.type === "room_actions") {
    const applied = applyRoomActions(roomProgram, result.outcome.actions, currentLayout.options);
    if (!applied.ok) {
      const balance = await refund();
      return NextResponse.json(
        { error: PATCH_INFEASIBLE_BILINGUAL, code: "ROOM_ACTIONS_INFEASIBLE", creditsRemaining: balance },
        { status: 422 },
      );
    }
  }
  if (result.outcome.type === "concept") {
    const compiled = compileDesignProposal(result.outcome.proposal);
    const dropsBuilding = compiled.ok && currentConcept?.ok
      && currentConcept.kind === "building" && compiled.kind === "floor";
    const model = compiled.ok && compiled.kind === "building" && compiled.proposal.structure
      ? buildBuildingModelObj(compiled, wallMeshPreset) : null;
    const clashes = model && !model.ok ? model.errors.filter((error) => error.startsWith("BEAM_CROSSES_OPENING:")) : [];
    if (!compiled.ok || dropsBuilding || clashes.length > 0 || !designMatchesSite(compiled.proposal, briefCheck.brief.siteWidth, briefCheck.brief.siteDepth)) {
      const balance = await refund();
      console.log(`[ARCHITECT_CONCEPT_INFEASIBLE] ${JSON.stringify({ userId, reason: !compiled.ok ? compiled.errors.slice(0, 8) : dropsBuilding ? "building_floors_dropped" : clashes.length ? clashes.slice(0, 8) : "site_shape_or_bounds" })}`);
      return NextResponse.json(
        { error: CONCEPT_INFEASIBLE_BILINGUAL, code: "CONCEPT_INFEASIBLE", creditsRemaining: balance },
        { status: 422 },
      );
    }
  }

  console.log(
    `[ARCHITECT_INTERPRET_OK] ${JSON.stringify({ userId, type: result.outcome.type, creditsRemaining })}`,
  );
  return NextResponse.json({
    ok: true,
    outcome: result.outcome,
    creditsRemaining,
    cost: ARCHITECT_MESSAGE_CREDIT_COST,
  });
}
