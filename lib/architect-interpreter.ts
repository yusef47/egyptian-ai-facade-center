/**
 * Server-side interpretation of a workspace chat message into a typed
 * BriefPatch, a clarification request, or an honest unsupported response.
 *
 * The model may propose bounded space polygons and optional structural
 * coordination nodes. It never authors final ProjectGeometry, wall references,
 * SVG, DXF, structural approval or executable code.
 * Every response is schema-checked and recompiled on the server before it
 * can reach the client.
 *
 * The text model is configured SEPARATELY from the image model
 * (OPENROUTER_MODEL in openrouter-engine.ts). This module refuses to run
 * with either image model ID, so a misconfigured env var degrades to an
 * honest "unavailable" state instead of silently burning image credits on
 * a text call.
 */

import {
  FALLBACK_OPENROUTER_MODEL,
  OPENROUTER_ENDPOINT,
  OPENROUTER_MODEL,
} from "./openrouter-engine";
import {
  BRIEF_PATCH_BOUNDS,
  parseBriefPatch,
  type BriefPatch,
  type WorkspaceBrief,
} from "./architect/brief-patch";
import {
  defaultRoomProgram,
  parseRoomActions,
  type RoomAction,
  type RoomProgram,
} from "./architect/room-plan";
import { parseConceptProposal } from "./architect/concept-proposal";
import { parseBuildingProposal, type DesignProposal } from "./architect/building-proposal";

/** Env var holding the dedicated chat model ID (e.g. "google/gemini-2.5-flash"). */
export const ARCHITECT_TEXT_MODEL_ENV_NAME = "OPENROUTER_ARCHITECT_TEXT_MODEL";

/** Bilingual notice when the text model is not configured on the server. */
export const ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL =
  "The architect assistant is not configured on this server. | المساعد المعماري غير مُفعّل على هذا الخادم.";

/** Bilingual notice for upstream failures and invalid model output. */
export const ARCHITECT_ASSISTANT_BUSY_BILINGUAL =
  "The architect assistant is temporarily unavailable. Please try again in a moment. | المساعد المعماري غير متاح مؤقتًا. حاول مرة أخرى بعد لحظات.";

/** Cost of sending one chat message, in daily credits. */
export const ARCHITECT_MESSAGE_CREDIT_COST = 1;

/** Bounds on everything the model may receive or return. */
export const ARCHITECT_INTERPRETER = {
  /** Longest chat message accepted from the user. */
  MAX_MESSAGE_CHARS: 1_500,
  /** Bounded chat context: most recent turns sent to the model. */
  MAX_HISTORY_TURNS: 6,
  /** Each history turn is truncated to this many characters. */
  MAX_HISTORY_TURN_CHARS: 300,
  /** Longest reply the model may produce; longer output is schema-invalid. */
  MAX_REPLY_CHARS: 600,
  /** Hard cap on the raw response body read from upstream. */
  MAX_RESPONSE_CHARS: 48_000,
  /** Abort budget for the upstream call. */
  TIMEOUT_MS: 45_000,
  /** OpenRouter generation limits. */
  MAX_TOKENS: 6_000,
  TEMPERATURE: 0.1,
} as const;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type InterpretInput = {
  message: string;
  brief: WorkspaceBrief;
  roomProgram?: RoomProgram;
  conceptProposal?: DesignProposal;
  history?: ChatTurn[];
};

export type InterpretationOutcome =
  | { type: "patch"; patch: BriefPatch; reply: string }
  | { type: "room_actions"; actions: RoomAction[]; reply: string }
  | { type: "concept"; proposal: DesignProposal; reply: string }
  | { type: "clarify"; reply: string }
  | { type: "unsupported"; reply: string };

export type InterpretationResult =
  | { ok: true; outcome: InterpretationOutcome }
  | { ok: false; status: number; message: string };

/**
 * Resolves the dedicated text model, or null when the server has no usable
 * text model configured. Image model IDs are explicitly refused.
 */
export function resolveArchitectTextModel(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const configured = env[ARCHITECT_TEXT_MODEL_ENV_NAME]?.trim();
  if (!configured) return null;
  if (configured === OPENROUTER_MODEL || configured === FALLBACK_OPENROUTER_MODEL) {
    console.log("[ARCHITECT_TEXT_MODEL_REJECTED] image model configured as text model");
    return null;
  }
  return configured;
}

/** Both settings are required before a chat request can consume a credit. */
export function isArchitectInterpreterAvailable(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return resolveArchitectTextModel(env) !== null && Boolean(env.OPENROUTER_API_KEY?.trim());
}

/** The ONLY instructions the text model ever receives about its task. */
export const ARCHITECT_INTERPRETER_SYSTEM_PROMPT = `You are the text interpreter for the Qattan AI Architect Workspace (المركز المصري للذكاء الاصطناعي في العمارة والعمران).

You translate ONE user chat message about a CONCEPT site layout into a strict JSON decision. You may propose space polygons for an original single-floor or multi-floor plan (up to five levels), and an optional structural COORDINATION grid for a building. You never produce final wall geometry, SVG, DXF, structural analysis, code compliance, or an engineering approval. A deterministic compiler creates walls and checks the proposal.

Editable site fields are:
- siteWidth: number, meters, ${BRIEF_PATCH_BOUNDS.siteWidth.min}..${BRIEF_PATCH_BOUNDS.siteWidth.max}
- siteDepth: number, meters, ${BRIEF_PATCH_BOUNDS.siteDepth.min}..${BRIEF_PATCH_BOUNDS.siteDepth.max}
- unitBSharePercent: number, percent of combined unit area for Unit B, ${BRIEF_PATCH_BOUNDS.unitBSharePercent.min}..${BRIEF_PATCH_BOUNDS.unitBSharePercent.max}
- coreSide: "east" or "west"

You may also edit the room program with 1 to 4 room actions per reply:
- add: {"op":"add","unit":"unit-a","kind":"bedroom","preferredArea":16}
- remove: {"op":"remove","unit":"unit-b","roomId":"bedroom-2"}
- set: {"op":"set","unit":"unit-a","roomId":"kitchen-1","preferredArea":18}
- move: {"op":"move","unit":"unit-a","roomId":"living-1","toIndex":4}
The unit is "unit-a" or "unit-b". Kinds are living, bedroom, kitchen, bathroom, office, storage. Use the exact existing roomId from CURRENT ROOM PROGRAM for remove/set. Preferred area is a preference, not a guaranteed clear/net area. If the user does not specify the unit and it cannot be inferred, clarify.
Room order follows the corridor from south to north in Unit A, and west to east in Unit B. Move reorders this sequence; do not call it an exterior facade preference unless the current geometry supports that claim.

For a new layout that should differ from the two-unit template, or for an edit to CURRENT CONCEPT PROPOSAL, return type "concept" with a COMPLETE revised proposal:
{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"living","name":"Living","kind":"living","points":[{"x":0,"y":0},{"x":8,"y":0},{"x":8,"y":10},{"x":0,"y":10}]},{"id":"bedroom","name":"Bedroom","kind":"bedroom","points":[{"x":8,"y":0},{"x":12,"y":0},{"x":12,"y":10},{"x":8,"y":10}]}],"doors":[{"from":"living","to":"outside","width":1,"at":0.5},{"from":"living","to":"bedroom","width":0.9,"at":0.5}],"windows":[{"space":"living","edgeIndex":0,"width":1.5,"at":0.5}]}
For a FIRST concept use the full rectangular CURRENT BRIEF siteWidth × siteDepth site, with origin (0,0). When CURRENT CONCEPT PROPOSAL exists, preserve that exact site and revise its cells. Each cell needs a unique lowercase ASCII id, a short name and a semantic kind: living, bedroom, kitchen, bathroom, corridor, stair, core, office, storage, balcony, service or other. Cells can be rectangles or simple concave polygons and need not fill the site. Polygons must be simple, nonoverlapping, inside the site, and share exact edges where a door connects them. Every cell needs a door path to "outside"; public rooms and bedrooms must not require passage through another bedroom, bathroom or store. En-suite bathrooms and stores may be accessed from a bedroom. Doors require from, to, width (0.6..3 meters), and at (0..1 along a suitable wall). Optionally include windows on exterior cell edges: space is the cell id, edgeIndex is the zero-based index of its polygon edge from point i to point (i+1) modulo point count, width is 0.4..6 meters, and at is 0..1 along an exterior wall fragment. Never place a window on an edge shared with another cell or over a door. Include every room the user explicitly asks for; clarify when the brief lacks essential information. Propose spatial arrangements that respond to the user's actual brief, not a stored floor-plan template. Keep coordinate counts modest. Preferred ideas are proposals, never claims of building-code or structural compliance.

For 2 to 5 floors, return type "concept" with a COMPLETE building proposal. It has kind "building", version 1, coreCellId and floors in ascending elevation order. Every floor has a unique id, short name, elevation in meters, and a complete version-2 plan with site, cells, doors and optional windows. Include exactly one floor at elevation 0. Negative elevations may represent basements. Each floor's full rectangular site must match CURRENT BRIEF. All floors must contain the same stair or core cell id and identical core polygon footprint (start vertex and winding may differ); other layouts may vary freely. On the ground floor, every space needs a door path to outside. On other floors, every space needs a door path to the shared core; do not invent a direct outside door just to make an upper floor accessible. A common core alone is only a shaft placeholder. Floor elevations are authored concept values, not verified story heights. Keep floor cells compact enough to fit the JSON response. When CURRENT CONCEPT PROPOSAL is a building, revise its floors and preserve untouched ones. Do not claim structural adequacy or code compliance.
If asked to sketch a straight stair, the building MAY include "stairs":[{"id":"s1","lowerFloorId":"ground","upperFloorId":"first","start":{"x":1.5,"y":1.1},"end":{"x":1.5,"y":6.3},"width":1.2,"risers":19,"landingLength":0.8}]. Each flight joins adjacent floors, has distinct id, 4..40 risers and equal-length level landings at both ends. Keep the full stair footprint and door approaches inside the common core without overlaps. A stair is only a geometric concept: do not assert traversability, safe headroom, egress, structural support or code compliance. Preserve CURRENT CONCEPT PROPOSAL stairs on unrelated edits.
If the user asks for a column/beam arrangement on a building, the building proposal MAY include a "structure" field. It is an authored coordination sketch, never a safe structural design: {"version":1,"status":"coordination-only","columns":[{"id":"c1","position":{"x":4,"y":2},"width":0.3,"depth":0.3},{"id":"c2","position":{"x":10,"y":2},"width":0.3,"depth":0.3}],"beams":[{"id":"b1","floorId":"first","fromColumnId":"c1","toColumnId":"c2","width":0.25,"depth":0.45}]}. Use 2..64 unique column ids and up to 128 unique beam ids. Sections are explicit illustrative assumptions within 0.1..3 meters, NOT adequate sizes. The same authored columns continue vertically; beams reference existing columns and real floor ids. Place every column and beam footprint inside authored floor spaces, avoid the vertical core opening and overlaps, and include beams on every upper floor. Preserve CURRENT CONCEPT PROPOSAL structure on unrelated edits. If the user asks for load calculations, foundation sizing, reinforcement, seismic/wind verification, Egyptian code compliance, or construction approval, explain that these still need engineering inputs and checks; do not claim they were performed.
Building proposal shape example: {"kind":"building","version":1,"coreCellId":"core","floors":[{"id":"ground","name":"Ground","elevation":0,"plan":{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"core","name":"Stair core","kind":"core","points":[{"x":0,"y":0},{"x":3,"y":0},{"x":3,"y":8},{"x":0,"y":8}]},{"id":"living","name":"Living","kind":"living","points":[{"x":3,"y":0},{"x":12,"y":0},{"x":12,"y":8},{"x":3,"y":8}]}],"doors":[{"from":"core","to":"outside","width":1,"at":0.5},{"from":"core","to":"living","width":0.9,"at":0.5}],"windows":[]}},{"id":"first","name":"First","elevation":3.2,"plan":{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"core","name":"Stair core","kind":"core","points":[{"x":0,"y":0},{"x":3,"y":0},{"x":3,"y":8},{"x":0,"y":8}]},{"id":"bedroom","name":"Bedroom","kind":"bedroom","points":[{"x":3,"y":0},{"x":12,"y":0},{"x":12,"y":8},{"x":3,"y":8}]}],"doors":[{"from":"core","to":"bedroom","width":0.9,"at":0.5}],"windows":[]}}]}

Everything else is OUT OF SCOPE and must get type "unsupported": more than five floors, approved stair design and lifts, setbacks or buildable envelope, structural safety or calculations, reinforcement, footings, materials, MEP, façade design, landscape, parking counts, and any Egyptian building-code or permit approval. Be honest and brief about why it is out of scope; never pretend the plan changed.

Reply in the same language the user writes in (Arabic in, Arabic out).

Output EXACTLY ONE JSON object and nothing else (no markdown fences, no commentary):
{"type":"patch","patch":{"version":1,"siteWidth":15},"reply":"short confirmation of what changed"}
{"type":"room_actions","actions":[{"op":"add","unit":"unit-a","kind":"bedroom"}],"reply":"short confirmation of the requested program change"}
{"type":"concept","proposal":{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"living","name":"Living","kind":"living","points":[{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":6},{"x":0,"y":6}]}],"doors":[{"from":"living","to":"outside","width":1,"at":0.5}],"windows":[]},"reply":"short note that a concept was proposed"}
{"type":"concept","proposal":{"kind":"building","version":1,"coreCellId":"core","floors":[{"id":"ground","name":"Ground","elevation":0,"plan":{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"core","name":"Stair core","kind":"core","points":[{"x":0,"y":0},{"x":3,"y":0},{"x":3,"y":8},{"x":0,"y":8}]}],"doors":[{"from":"core","to":"outside","width":1,"at":0.5}],"windows":[]}},{"id":"first","name":"First","elevation":3.2,"plan":{"version":2,"site":[{"x":0,"y":0},{"x":12,"y":0},{"x":12,"y":20},{"x":0,"y":20}],"cells":[{"id":"core","name":"Stair core","kind":"core","points":[{"x":0,"y":0},{"x":3,"y":0},{"x":3,"y":8},{"x":0,"y":8}]}],"doors":[],"windows":[]}}]},"reply":"short note that a building concept was proposed"}
{"type":"clarify","reply":"one short question when the request is ambiguous or misses a value"}
{"type":"unsupported","reply":"short honest explanation that this is outside the concept slice"}

Rules:
- Every "patch" MUST contain "version": 1 inside the patch object. It is a required schema field, not an editable design field.
- Apart from "version", a "patch" changes ONLY the fields the user actually asked to change; include the other editable fields nowhere.
- Numeric values are real JSON numbers, never strings.
- A single message may change several fields at once.
- A room_actions message changes only the requested room program; it never changes site fields.
- A concept message carries a complete proposal; include no patch or room actions. When CURRENT CONCEPT PROPOSAL exists, revise it as requested and keep unaffected cells whenever practical.
- Never claim an action succeeded until the engine accepts it. Say that you are proposing the change.
- "clarify" never includes a patch and never changes the plan.
- The current brief in the context is the source of truth for what exists today.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Extracts the model's reply from an OpenRouter chat-completions payload.
 * Only choices[0].message.content is ever read.
 */
export function extractChatText(response: unknown): string | null {
  if (!isRecord(response)) return null;
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (!isRecord(first)) return null;
  const message = first.message;
  if (!isRecord(message)) return null;
  const content = message.content;
  return typeof content === "string" && content.length > 0 ? content : null;
}

/** Tolerates a raw JSON object or one fenced ```json block; nothing else. */
export function extractJsonPayload(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fenced-block handling
  }
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Strictly validates untrusted model output into a typed outcome.
 *
 * Rules: size cap, exact type discriminator, allowlisted top-level keys,
 * non-empty bounded reply, patch validated through parseBriefPatch, and no
 * patch key permitted on clarify/unsupported outcomes. Anything invalid
 * returns null — the caller must never apply it.
 */
export function parseArchitectInterpretation(raw: unknown): InterpretationOutcome | null {
  if (typeof raw !== "string") return null;
  if (raw.length > ARCHITECT_INTERPRETER.MAX_RESPONSE_CHARS) return null;

  const payload = extractJsonPayload(raw);
  if (!isRecord(payload)) return null;

  const allowedKeys = new Set(["type", "patch", "actions", "proposal", "reply"]);
  if (Object.keys(payload).some((key) => !allowedKeys.has(key))) return null;

  const { type, patch, actions, proposal, reply } = payload;
  if (typeof reply !== "string") return null;
  const trimmedReply = reply.trim();
  if (
    trimmedReply.length === 0 ||
    trimmedReply.length > ARCHITECT_INTERPRETER.MAX_REPLY_CHARS
  ) {
    return null;
  }

  if (type === "patch") {
    if ("actions" in payload || "proposal" in payload) return null;
    const parsedPatch = parseBriefPatch(patch);
    if (!parsedPatch.ok) return null;
    return { type: "patch", patch: parsedPatch.patch, reply: trimmedReply };
  }
  if (type === "room_actions") {
    if ("patch" in payload || "proposal" in payload) return null;
    const parsedActions = parseRoomActions(actions);
    return parsedActions ? { type: "room_actions", actions: parsedActions, reply: trimmedReply } : null;
  }
  if (type === "concept") {
    if ("patch" in payload || "actions" in payload) return null;
    const parsedProposal = parseBuildingProposal(proposal) ?? parseConceptProposal(proposal);
    return parsedProposal ? { type: "concept", proposal: parsedProposal, reply: trimmedReply } : null;
  }
  if (type === "clarify" || type === "unsupported") {
    if ("patch" in payload || "actions" in payload || "proposal" in payload) return null;
    return { type, reply: trimmedReply };
  }
  return null;
}

/** Bounds the chat context sent to the model. */
export function boundHistory(history: ChatTurn[] | undefined): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (turn) =>
        isRecord(turn) &&
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string",
    )
    .slice(-ARCHITECT_INTERPRETER.MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role,
      content: turn.content.slice(0, ARCHITECT_INTERPRETER.MAX_HISTORY_TURN_CHARS),
    }));
}

/**
 * Builds the upstream OpenRouter request. The API key stays in the header —
 * it is never part of the body, and the body carries no server secrets.
 */
export function buildInterpretRequest(
  input: InterpretInput,
  options: { model: string; apiKey: string },
): { url: string; init: RequestInit } {
  const contextLines = [
    "CURRENT BRIEF (JSON):",
    JSON.stringify(input.brief),
    "CURRENT ROOM PROGRAM (JSON):",
    JSON.stringify(input.roomProgram ?? defaultRoomProgram()),
    "CURRENT CONCEPT PROPOSAL (JSON or null):",
    JSON.stringify(input.conceptProposal ?? null),
    "RECENT CHAT (oldest first):",
    JSON.stringify(boundHistory(input.history)),
    "USER MESSAGE:",
    input.message.trim().slice(0, ARCHITECT_INTERPRETER.MAX_MESSAGE_CHARS),
  ];

  return {
    url: OPENROUTER_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: ARCHITECT_INTERPRETER.TEMPERATURE,
        max_tokens: ARCHITECT_INTERPRETER.MAX_TOKENS,
        messages: [
          { role: "system", content: ARCHITECT_INTERPRETER_SYSTEM_PROMPT },
          { role: "user", content: contextLines.join("\n") },
        ],
      }),
    },
  };
}

export type ExecuteInterpretationOptions = {
  apiKey?: string;
  model?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

/**
 * Calls the text model and parses its reply. Never throws: upstream
 * failures, timeouts, oversized bodies, and schema-invalid output all
 * resolve to { ok: false } with a bilingual message the route can surface
 * (and refund against).
 */
export async function executeInterpretation(
  input: InterpretInput,
  options: ExecuteInterpretationOptions = {},
): Promise<InterpretationResult> {
  const model = options.model ?? resolveArchitectTextModel();
  if (!model) {
    return {
      ok: false,
      status: 503,
      message: ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
    };
  }
  const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY)?.trim();
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      message: ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
    };
  }

  const request = buildInterpretRequest(input, { model, apiKey });
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? ARCHITECT_INTERPRETER.TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchFn(request.url, {
      ...request.init,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    console.log(
      `[ARCHITECT_INTERPRET_FETCH_FAILED] ${error instanceof Error ? error.message : "unknown"}`,
    );
    return { ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL };
  }

  if (!response.ok) {
    console.log(`[ARCHITECT_INTERPRET_UPSTREAM] status=${response.status}`);
    return { ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL };
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    return { ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL };
  }
  if (bodyText.length > ARCHITECT_INTERPRETER.MAX_RESPONSE_CHARS * 4) {
    console.log("[ARCHITECT_INTERPRET_UPSTREAM] response body over cap");
    return { ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL };
  }

  const chatText = extractChatText(safeJsonParse(bodyText));
  const outcome = chatText === null ? null : parseArchitectInterpretation(chatText);
  if (!outcome) {
    console.log("[ARCHITECT_INTERPRET_INVALID_OUTPUT] schema violation in model reply");
    return { ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL };
  }
  return { ok: true, outcome };
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
