/**
 * Tool #9 — Engineering Multiview & 3D: analysis engine (server-side only).
 *
 * This engine does NOT generate an image. It asks the multimodal model to READ
 * the uploaded orthographic drawing and return the part's 3D solid geometry as
 * strict JSON, which lib/engineering-geometry.ts validates and compiles into a
 * CSG plan. The Three.js CAD engine in the browser then draws the precise
 * orthographic projections and the 30-degree isometric projection from that
 * real geometry — so the output is mathematically exact instead of guessed by
 * an image model.
 *
 * Failure copy is proprietary and bilingual: the provider is never named in
 * anything a user (or a served response) can see.
 */

import {
  ENGINE_BUSY_BILINGUAL,
  OPENROUTER_ENDPOINT,
  OPENROUTER_MODEL,
  SERVICE_NOT_CONFIGURED_BILINGUAL,
} from "./openrouter-engine.js";
import {
  normalizeEngineeringGeometry,
  type EngineeringGeometry,
} from "./engineering-geometry.js";

/**
 * Text-output model used for the structured analysis. Same vendor generation as
 * the rendering model but without image modality, so the response is pure JSON.
 */
export const ENGINEERING_ANALYSIS_MODEL = "google/gemini-3.1-flash-lite";

/**
 * Friendly, provider-free failure notice. Per the tool spec this is shown when
 * the drawing cannot be read — the credit is refunded server-side.
 */
export const ENGINEERING_ANALYSIS_FAILURE_BILINGUAL =
  "تعذّر تحليل هذا الرسم الهندسي. يرجى رفع صورة أوضح بأبعاد ظاهرة. | Could not analyze this drawing. Please upload a clearer image with visible dimensions.";

export type EngineeringAnalysisResult =
  | { ok: true; geometry: EngineeringGeometry }
  | { ok: false; status: number; message: string };

export type EngineeringAnalysisRequest = {
  url: string;
  init: RequestInit;
};

/**
 * Analysis contract. The model is a *reader*, not a draftsman: it must return
 * the machined part as a base block plus subtracting operations, using the
 * coordinate convention the CAD compiler expects.
 */
export const ENGINEERING_ANALYSIS_SYSTEM_PROMPT = `You are a mechanical engineering drawing ANALYZER. You do NOT draw anything and you do NOT describe the drawing in prose: you read an orthographic projection drawing of ONE machined part and return that part's 3D solid geometry as STRICT JSON so a CAD kernel can rebuild it exactly.

INPUT
The image is a technical drawing: typically a FRONT ELEVATION together with a SIDE VIEW, sometimes a TOP PLAN, a section, or a rough isometric sketch. It may contain dimension annotations, hidden (dashed) lines, centre lines, and sheet titles.

RULES
- Identify the part's base rectangular BLOCK (its bounding box): width (X), height (Y), depth (Z). Use the drawing's own units and proportions; when only a scale drawing is given, keep the true proportions.
- The block ALWAYS starts as a solid rectangular box. Every other feature is an OPERATION that removes material from it.
- Model EVERY cut you can see or deduce: top notches, slots and U-cuts (notch_top), bottom tunnels and clearance channels (tunnel_bottom), slots open on a side face (slot_side), through holes (through_hole), stepped shoulders (step), chamfered corners (chamfer), inclined or sloped faces (incline).
- Read the DASHED hidden lines (the "- - -" stroke convention) as REAL internal geometry cutting through the object: a horizontal dashed line is an internal ceiling or a front-to-back through-tunnel, a dashed vertical/horizontal pair is an open notch, and a dashed rectangle is a void buried inside the body. Anything drawn dashed on the given views must appear as a through cut in your operations. Never ignore a dashed line and never invent a feature that is not visible or geometrically implied.
- A tunnel, channel or slot drawn through the part must be modelled as a THROUGH cut: omit "depth" (or set it equal to the block depth).
- Feature parity is mandatory: a void visible in one view must appear in the corresponding operations, so the flat projections and the isometric agree.
- COORDINATES are measured inside the block from its LEFT-BOTTOM-BACK corner: x in [0, width] left to right, y in [0, height] bottom to top, z in [0, depth] back to front. Give the LEFT/BOTTOM/BACK corner of the material each operation removes (for through_hole give the hole CENTRE).
- Return ONLY the JSON object: no markdown, no code fences, no commentary, no text before or after it.

OUTPUT JSON SCHEMA
{
  "label": "short description of the part, e.g. H-profile bracket with bottom tunnel",
  "block": { "width": number, "height": number, "depth": number },
  "operations": [
    { "type": "notch_top",      "x": number, "width": number, "height": number, "depth": number|null, "z": number|null },
    { "type": "tunnel_bottom",  "x": number, "width": number, "height": number },
    { "type": "slot_side",      "axis": "left"|"right"|"front"|"back", "x": number|null, "y": number, "width": number, "height": number, "depth": number },
    { "type": "through_hole",   "axis": "x"|"y"|"z", "x": number, "y": number, "z": number, "diameter": number },
    { "type": "step",           "x": number, "y": number, "width": number, "height": number },
    { "type": "chamfer",        "axis": "left"|"right", "width": number },
    { "type": "incline",        "axis": "left"|"right"|"x", "atX": number, "fromY": number, "toY": number, "endX": number|null }
  ],
  "dimensions": [
    { "label": "64", "position": "bottom", "view": "front" }
  ]
}

OPERATION SEMANTICS
- notch_top: material removed downwards from the TOP face. x = left edge, width = span along X, height = how deep it cuts down (its bottom edge is height below the top face), depth omitted = through front-to-back.
- tunnel_bottom: material removed upwards from the BOTTOM face (an arch/tunnel opening on the bottom front face). x = left edge, width = span along X, height = how high the cut rises from the bottom face. Through front-to-back unless depth is given.
- slot_side: slot open on a side face. axis "left"/"right" (default left) cuts inward along X by depth, spanning y..y+height vertically, through front-to-back. axis "front"/"back" cuts inward along Z by depth, spanning x..x+width horizontally and y..y+height vertically.
- through_hole: a drilled hole passing right through the part along the given axis (default "z" front-to-back). x, y, z are the hole CENTRE coordinates and diameter is its diameter.
- step: a rectangular shoulder removed from the TOP face — x = left edge of the step, width = its span, y = the level the step drops to. Everything above y in that span is removed.
- chamfer: a 45-degree corner cut. axis "left" removes the top-left corner, "right" the top-right corner; width = the size of the chamfer along both axes.
- incline: an inclined/sloped face. The plane runs from the point (atX, fromY) to the point (endX, toY); endX defaults to the far block edge (x = width for axis "left", x = 0 for axis "right"). Everything ABOVE that plane is removed. fromY is the high side, toY the low side.

WORKED EXAMPLES (study the mapping from drawing to operations)
Example 1 — inclined face + top notch + bottom tunnel (the classic exercise). A block whose front elevation shows a sloping roof on the right, a rectangular notch cut down into the top face and a rectangular tunnel through the bottom, with the hidden lines confirming both cut through front-to-back:
{
  "label": "wedge with top notch and bottom tunnel",
  "block": { "width": 64, "height": 50, "depth": 40 },
  "operations": [
    { "type": "incline", "axis": "x", "fromY": 50, "toY": 0, "atX": 34, "endX": 0 },
    { "type": "notch_top", "x": 34, "width": 10, "height": 20, "depth": 40 },
    { "type": "tunnel_bottom", "x": 0, "width": 16, "height": 20, "depth": 40 }
  ]
}
Note how each dashed feature in the side view became its own through cut, and how the sloping roof became an incline from (34, 50) to (0, 0).

Example 2 — H-profile / dual U-slot: the same span cut down from the top AND up from the bottom, so the side view reads like the letter H:
{
  "label": "H-profile bracket",
  "block": { "width": 50, "height": 50, "depth": 40 },
  "operations": [
    { "type": "notch_top", "x": 15, "width": 20, "height": 20, "depth": 40 },
    { "type": "tunnel_bottom", "x": 15, "width": 20, "height": 20, "depth": 40 }
  ]
}
Never collapse an H-profile into a single notch: BOTH halves are separate operations.

Example 3 — stepped shoulder + chamfered corner + drilled hole:
{
  "label": "stepped block with chamfer and drilled hole",
  "block": { "width": 60, "height": 40, "depth": 30 },
  "operations": [
    { "type": "step", "x": 30, "y": 25, "width": 30, "height": 15 },
    { "type": "chamfer", "axis": "left", "width": 6 },
    { "type": "through_hole", "axis": "z", "x": 15, "y": 20, "z": 15, "diameter": 8 }
  ]
}

These examples fix the SHAPE of the answer and the coordinate convention. Never copy their numbers: always measure the drawing in front of you.

DIMENSIONS
Extract every dimension annotation you can genuinely read: label is the text/number on the drawing, position is a rough placement ("bottom", "left", "right-top", "top"), view is one of "front", "side", "top", "isometric".

QUALITY BAR
Be exact about the features the drawing shows — especially the H-profile combination of a top notch together with a bottom tunnel, which must both appear as separate operations. Never answer with an unmodified plain block when the drawing shows cut features.`;

/** Builds the text-only analysis request (vision input, JSON text output). */
export function buildEngineeringAnalysisRequest(
  imageDataUrl: string,
  brief: string,
  apiKey: string,
  opts: { model?: string; jsonMode?: boolean } = {},
): EngineeringAnalysisRequest {
  const model = opts.model ?? ENGINEERING_ANALYSIS_MODEL;
  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    messages: [
      { role: "system", content: ENGINEERING_ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${brief.trim()}\n\nAnalyze the attached engineering drawing and return ONLY the JSON geometry object.`,
          },
          { type: "image_url", image_url: { url: imageDataUrl } },
        ],
      },
    ],
  };
  if (opts.jsonMode) body.response_format = { type: "json_object" };

  return {
    url: OPENROUTER_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  };
}

/** Extracts the first balanced JSON object from a model response. */
function extractBalancedJson(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

function tryParse(candidate: string): unknown {
  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return null;
  }
}

/**
 * Parses the analyzer's answer into a raw geometry object. Tolerates fenced
 * code blocks and surrounding prose (both are common even in JSON mode).
 */
export function extractEngineeringGeometryPayload(text: unknown): unknown {
  if (typeof text !== "string" || text.trim().length === 0) return null;
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [
    fenced?.[1]?.trim() ?? "",
    trimmed,
    extractBalancedJson(trimmed) ?? "",
  ].filter((candidate) => candidate.length > 0);

  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

/** Concatenated text of a chat-completion message (string or parts array). */
export function extractMessageText(response: unknown): string {
  if (!response || typeof response !== "object") return "";
  const choices = (response as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const parts: string[] = [];
  for (const choice of choices) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as { message?: unknown }).message;
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (typeof content === "string") {
      parts.push(content);
      continue;
    }
    if (Array.isArray(content)) {
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") parts.push(text);
      }
    }
  }
  return parts.join("\n");
}

function extractUpstreamMessage(data: unknown): string {
  const record = data as { error?: { message?: unknown } } | null;
  return typeof record?.error?.message === "string" ? record.error.message : "";
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Reads the drawing and returns the validated part geometry.
 *
 * Two attempts at most: the text-output analysis model in JSON mode first, then
 * the image model without a response-format constraint (covers a model that is
 * unavailable on the account or a provider that rejects `response_format`).
 */
export async function analyzeEngineeringGeometry(
  imageDataUrl: string,
  brief: string,
  apiKey: string | undefined,
): Promise<EngineeringAnalysisResult> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!key) {
    return { ok: false, status: 500, message: SERVICE_NOT_CONFIGURED_BILINGUAL };
  }

  const attempts: { model: string; jsonMode: boolean }[] = [
    { model: ENGINEERING_ANALYSIS_MODEL, jsonMode: true },
    { model: OPENROUTER_MODEL, jsonMode: false },
  ];

  try {
    for (const attempt of attempts) {
      const request = buildEngineeringAnalysisRequest(imageDataUrl, brief, key, attempt);
      const upstream = await fetch(request.url, request.init);
      const data = await safeJson(upstream);

      if (!upstream.ok) {
        // Server-side diagnostic only: never surfaced to the client.
        console.log(
          `[ENGINEERING_UPSTREAM] status=${upstream.status} attempt=${attempt.model} detail=${JSON.stringify(
            extractUpstreamMessage(data).slice(0, 200),
          )}`,
        );
        continue;
      }

      const payload = extractEngineeringGeometryPayload(extractMessageText(data));
      const geometry = normalizeEngineeringGeometry(payload);
      if (geometry) {
        console.log(
          `[ENGINEERING_ANALYZED] ${JSON.stringify({
            model: attempt.model,
            block: geometry.block,
            operations: geometry.operations.length,
          })}`,
        );
        return { ok: true, geometry };
      }
      console.log(`[ENGINEERING_UNPARSABLE] attempt=${attempt.model}`);
    }
  } catch {
    return { ok: false, status: 502, message: ENGINE_BUSY_BILINGUAL };
  }

  return { ok: false, status: 422, message: ENGINEERING_ANALYSIS_FAILURE_BILINGUAL };
}
