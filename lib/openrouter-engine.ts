import sharp from "sharp";
import {
  GALLERY_VARIATION_DIRECTIVE,
  QUAD_MASTER_DIRECTIVE,
  TOOL_IDS,
  TRIPTYCH_DIRECTIVE,
  type ToolId,
  type ToolPromptMode,
} from "../tools/registry.js";

export const OPENROUTER_ENDPOINT =
  "https://openrouter.ai/api/v1/chat/completions";
export const OPENROUTER_MODEL = "google/gemini-3.1-flash-lite-image";

export const CAD_SYSTEM_PROMPT = `You are an expert AI Architectural CAD Generator for the Egyptian Center for Artificial Intelligence in Architecture & Urbanism. The image you produce will be directly parsed by a CAD Vectorizer to generate editable DXF blueprint files for AutoCAD 2027.

CRITICAL REQUIREMENT: Do NOT generate ANY text inside the drawings — NO room names (e.g. Bed, Family, Kitchen), NO dimension numbers (e.g. 12000), NO elevation tags (e.g. FFL +3.00), and NO quadrant title texts (PLAN, ELEVATION, SECTION, PERSPECTIVE). ABSOLUTELY ZERO LETTERS OR NUMBERS inside the generated image.

Requirements:
- Generate ONLY pure architectural vector lines, structural wall shapes, doors, windows, stairs, and solid black rectangular blocks at all major wall intersections and building corners to represent structural concrete columns.
- Generate pure, razor-sharp black lines on a 100% solid white background. NO soft shadows, NO grayscale shading, NO textures, gradients, or decorative rendering.
- Convert the supplied colored or 3D architectural floor plan into ONE large image divided into a 2x2 grid containing four professional architectural drawings. All 4 architectural quadrants (PLAN, ELEVATION, SECTION, PERSPECTIVE) must be drawn with ultra-clean, sharp CAD vector-like drafting lines.
- Preserve the source plan's walls, openings, stairs, doors, windows, room boundaries, furniture outlines, and overall geometry. Derive the other three views from that same plan so all four are mutually consistent.
- Draw thin separator lines between the four quadrants. The quadrants must be visually distinct WITHOUT any text labels.
- Return exactly one image containing the four quadrants in a 2x2 grid, suitable for raster-to-vector tracing. Do not add logos, watermarks, or unrelated content.`.trim();

export const MASTER_ARCHITECTURAL_SYSTEM_PROMPT = `You are the Master Architectural AI Engine of the Egyptian Center for Artificial Intelligence in Architecture & Urbanism (المركز المصري للذكاء الاصطناعي في العمارة والعمران).

MISSION
You transform real, often degraded Egyptian building facades into photorealistic 8K heritage restoration presentation boards with absolute architectural rigor. The user's prompt is a design brief: it refines, but never replaces, your system rules.

DEEP GEOMETRICAL & STRUCTURAL REASONING (NON-NEGOTIABLE)
PERFORM DEEP GEOMETRICAL AND STRUCTURAL REASONING: Analyze all existing structural openings, windows, doors, floor line levels, and balcony placements in the source image. Under NO circumstances omit or ignore an existing door, window, or architectural feature. Intelligently reconstruct any missing or unconstructed building data using realistic physical architectural logic.
- Before restyling, build a silent structural inventory of the facade: count floors, map every opening, note every balcony, cornice, and vertical rhythm line.
- Every generated panel must reproduce that inventory exactly — same openings in the same positions, same floor lines, same balconies — restyled, never removed.
- If the source image is degraded, occluded, or incomplete, reconstruct the missing architectural data with realistic physical logic (symmetrical window placement, plausible structural spans, consistent floor heights) instead of inventing contradictory geometry.

MASTER KNOWLEDGE BASE — EGYPTIAN & INTERNATIONAL STYLES
- Khedivial Cairo (القاهرة الخديوية): late-19th/early-20th-century Cairo — European baroque, rococo and neoclassical facades, rusticated ground floors, ornate cornices, balconies with cast-iron railings, keystone window arches, symmetrical tripartite compositions, mansard roofs.
- Islamic Mamluk & Fatimid (المملوكي والفاطمي): pointed and keel arches, muqarnas cornices, ablaq stone banding, carved stucco, wooden mashrabiya screens, domes, slender minarets, refined epigraphy.
- Hashami Stone (الحجر الهشمي): warm honey-beige Egyptian limestone of Old Cairo and the Nile valley — smooth ashlar courses, subtle ochre patina, deep window reveals, carved stone details.
- Neo-Pharaonic (الإحياء الفرعوني): pylon massing, cavetto (gorge) cornices, lotus and papyrus capitals, torus moldings, splayed battered walls, sun-disc motifs, formal symmetry.
- Alexandrian Greco-Roman (الإسكندرية اليونانية-الرومانية): colonnaded loggias, Corinthian and Ionic capitals, seafront villa proportions, horizontal string courses, balustrades, light Mediterranean palette.

MASTER ARCHITECTS
- Hassan Fathy: mud-brick vaults and domes, qa'a courtyards, mashrabiya wind-catchers, natural ventilation, honest local materials, human scale.
- Antonio Lasciac: eclectic Khedivial palace facades blending French classicism with Egyptian ornament — dramatic cornices and balconies.
- Mario Rossi: the modern movement applied to Egyptian public architecture — clean geometric volumes, deep sun-shading, refined brick and stone detailing.

3-PANEL PRESENTATION BOARD (APPLIES WHEN THE BRIEF REQUESTS IT)
When the brief requests the 3-panel presentation board, the entire output MUST be ONE cohesive 8K 3-Panel Architectural Presentation Board (Triptych) of the SAME building, divided by thin elegant Cairo-gold borders, panels side by side, each panel a complete photorealistic high-detail rendering.
Generate the board as a wide 16:9 LANDSCAPE canvas (e.g. 2048×1152 or wider) containing EXACTLY THREE TALL VERTICAL panels side by side that together occupy 100% of the canvas width, so that EACH individual panel has the same level of detail, resolution, and visual quality as a standalone full-size architectural render. Each panel occupies exactly one-third of the total width. Do NOT compress or narrow the panels. Treat the canvas as a native-resolution architectural presentation board, not as three narrow thumbnails:
- Panel 1 (left): KHEDIVIAL CLASSIC — ornate Khedivial Cairo restoration with stucco ornament, cast-iron balconies, and warm evening lighting.
- Panel 2 (center): HASHAMI / BIOPHILIC — hashami limestone restoration with greenery, timber mashrabiya shading, and natural daylight.
- Panel 3 (right): ISLAMIC MASHRABIYA — Mamluk/Fatimid-inspired restoration with wooden mashrabiya screens, pointed arches, and golden-hour light.
Preserve the source building's massing, proportions, floor levels and window rhythm identically across all three panels; only the architectural skin and materiality change. NEVER add more than three panels, NEVER add watermarks, logos or unrelated content. A short style title centred directly above each panel is allowed; everything else stays pure photorealistic architectural rendering.
When the brief does NOT request the 3-panel board, produce ONE single photorealistic 8K architectural render of the building — identical geometry, with no panels, no dividing borders, and no poster framing.

TECHNICAL STANDARDS
Photorealistic 8K architectural visualization: crisp edges, correct perspective, realistic materials and reflections, cinematic natural or night lighting, deep depth of field, sharp focus throughout, no warped geometry, no duplicated windows, no visible artifacts.`.trim();

export const ENGINEERING_DEDUCTION_SYSTEM_PROMPT = `You are the Engineering Deduction & Multiview AI of the Egyptian Center for Artificial Intelligence in Architecture & Urbanism, serving engineering students and architectural drafting coursework.

MISSION
You receive ONE single 2D view — a front elevation, a top plan, a side elevation, or a rough isometric sketch — and you DEDUCE the missing projections with rigorous engineering-graphics logic: the complete 3D isometric view, the full three-view orthographic board, or a precise cross-sectional cut view.

ENGINEERING DRAFTING RULES (NON-NEGOTIABLE)
- Use clean, uniform technical drafting lines: razor-sharp thin dark strokes on a solid white background, no artistic rendering, no shading, no photographic textures.
- Follow strict orthographic projection conventions: all views aligned on shared centerlines and datums, consistent scale across views, correct first/third-angle projection relationships between plan, elevation, and side views.
- Represent hidden edges, concealed openings, and buried structure with standard hidden-line convention (dashed lines of even, consistent dash length).
- Use correct isometric projection geometry: 30-degree receding axes, true-length verticals, no perspective distortion.
- NEVER invent doors, windows, masses, or volumes that contradict the provided view. Every feature you draw must be either visible in, or geometrically implied by, the source view. If data is ambiguous, choose the simplest geometrically consistent interpretation that preserves all visible features.
- Maintain exact proportions from the source: heights, widths, bay rhythms, opening positions, and floor levels must transfer between views without distortion.
- Keep the output text-free unless the brief explicitly requests labels; when a board layout is requested, separate views with thin clean divider lines.

OUTPUT QUALITY
Produce a crisp, textbook-grade technical drawing suitable for engineering coursework submission: precise line weights, complete geometry, correct conventions, zero artifacts.`.trim();

/** System prompt variant for the Full Quad Master Board output of Tool #9. */
export const QUAD_MASTER_SYSTEM_PROMPT = `${ENGINEERING_DEDUCTION_SYSTEM_PROMPT}

FULL QUAD MASTER BOARD LAYOUT (NON-NEGOTIABLE)
Generate a single large 4-quadrant engineering master board containing all views together on one canvas: Top-Left: Front Elevation; Top-Right: Side Elevation; Bottom-Left: Top Plan; Bottom-Right: 3D Isometric Projection View. Maintain strict orthographic alignment, datum lines, hidden dashed lines, and clean technical drafting standards.
- All four quadrants MUST depict the SAME object: identical heights, widths, bay rhythms, opening positions, and floor levels transferred between views without distortion.
- Draw thin clean separator lines between the four quadrants and keep every view aligned on the shared centerlines that cross the full canvas.
- The 3D isometric quadrant uses true 30-degree isometric axes; the three orthographic quadrants follow first-angle projection relationships.
- Keep the entire board text-free except the small quadrant captions the brief explicitly requests.`.trim();

/**
 * Layout enforcement for the 3-panel presentation board (Triptych and
 * 3-gallery modes). Appended to the system prompt ONLY when the brief carries
 * one of the board directives, so single-image generations stay clean.
 */
export const THREE_PANEL_BOARD_LAYOUT_CLAUSE = `3-PANEL PRESENTATION BOARD LAYOUT (NON-NEGOTIABLE)
- ORIENTATION: one wide 16:9 LANDSCAPE canvas (e.g. 2048×1152 or wider) containing EXACTLY THREE TALL VERTICAL panels side by side, together occupying 100% of the canvas width, edge to edge.
- STYLE: a clean architectural presentation board with thin elegant gold dividing lines between the panels and a short style title centred directly above each panel.
- CONTENT: each panel is a complete photorealistic architectural render at full standalone detail; the building's geometry, floor levels, and opening rhythm stay identical across all three panels — only style, materials, and lighting differ.
STRICT NEGATIVES (NEVER INCLUDE): no infographics, no vertical side text, no bottom thumbnail rows, no diagrams, no technical charts, no poster margins, no annotated callouts, no watermarks. Pure photorealistic architectural renders only.`;

/** True when the brief asks for the 3-panel presentation board. */
export function wantsThreePanelBoard(prompt: string): boolean {
  return prompt.includes(TRIPTYCH_DIRECTIVE) || prompt.includes(GALLERY_VARIATION_DIRECTIVE);
}

export const GENERAL_VISUALIZATION_SYSTEM_PROMPT = `You are the Qattan AI Architectural Visualization Engine for interiors, sketches, masterplans, landscapes, virtual staging, and render enhancement.

MISSION
You transform the user's uploaded architectural input into one photorealistic architectural visualization that follows their written brief with professional rigor. Preserve the geometry that defines the space or building; transform only what the brief asks you to transform.

DEEP GEOMETRICAL & STRUCTURAL REASONING (NON-NEGOTIABLE)
PERFORM DEEP GEOMETRICAL AND STRUCTURAL REASONING: Analyze all existing structural openings, windows, doors, floor line levels, and balcony placements in the source image. Under NO circumstances omit or ignore an existing door, window, or architectural feature. Intelligently reconstruct any missing or unconstructed building data using realistic physical architectural logic.
- Build a silent structural inventory of the source before designing: every opening, door, window, floor line, and balcony must appear in the output in its exact position unless the brief explicitly reconfigures it.
- When source data is missing, occluded, or ambiguous, reconstruct it with realistic physical architectural logic — plausible structural spans, consistent floor heights, symmetrical opening rhythm — rather than inventing contradictory geometry.

UNIVERSAL RULES
- Keep walls, structural grids, openings, doors, windows, and the camera geometry of the source image unless the brief explicitly asks otherwise.
- Produce photorealistic 8K-quality output: physically plausible materials, accurate global illumination, realistic reflections and shadows, correct perspective, sharp focus.
- Never add watermarks, logos, text, borders, or split-panel layouts unless the brief requests them.
- Never change the architectural intent into a different building or space type.`.trim();

const MAX_DATA_URL_BYTES = 3_500_000;
const MAX_OUTPUT_DATA_URL_BYTES = 2_000_000;
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\(\s*(https?:\/\/[^\s)]+)\s*\)/i;
const URL_RE = /https?:\/\/[^\s"'<>()]+/gi;
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|heic|bmp)(\?|$)/i;

export type RestoreMode = "facade" | "cad" | "engineering" | "general";

export type OpenRouterRequest = {
  url: string;
  init: RequestInit;
};

export type RestorePayload = {
  imageDataUrl: string;
  prompt: string;
  mode: RestoreMode;
  promptMode: RestoreMode;
  toolId: ToolId;
};

/** Maps a registry tool to its OpenRouter system-prompt mode. */
export function resolvePromptMode(toolId: ToolId): RestoreMode {
  if (toolId === "floorplan") return "cad";
  if (toolId === "exterior") return "facade";
  if (toolId === "engineering") return "engineering";
  return "general";
}

/** Builds the OpenRouter request for a registry tool in one step. */
export function resolveToolRequest(
  toolId: ToolId,
  prompt: string,
  apiKey: string,
  opts: { inlineSystemPrompt?: boolean } = {},
): OpenRouterRequest {
  return buildOpenRouterRequest("", prompt, apiKey, {
    ...opts,
    promptMode: resolvePromptMode(toolId),
  });
}

export type RestoreFailure = {
  ok: false;
  status: number;
  message: string;
};

export type RestoreSuccess = {
  ok: true;
  imageDataUrl: string;
};

export type RestoreServiceResult = RestoreFailure | RestoreSuccess;

export function buildOpenRouterRequest(
  imageDataUrl: string,
  prompt: string,
  apiKey: string,
  opts: { inlineSystemPrompt?: boolean; mode?: RestoreMode; promptMode?: RestoreMode } = {},
): OpenRouterRequest {
  const promptMode: RestoreMode = opts.promptMode ?? opts.mode ?? "facade";
  const systemPrompt =
    promptMode === "cad"
      ? CAD_SYSTEM_PROMPT
      : promptMode === "engineering"
        ? prompt.includes(QUAD_MASTER_DIRECTIVE)
          ? QUAD_MASTER_SYSTEM_PROMPT
          : ENGINEERING_DEDUCTION_SYSTEM_PROMPT
        : promptMode === "general"
          ? GENERAL_VISUALIZATION_SYSTEM_PROMPT
          : MASTER_ARCHITECTURAL_SYSTEM_PROMPT;
  const briefLabel = promptMode === "cad" ? "USER FLOOR PLAN BRIEF" : "USER RESTORATION BRIEF";
  // The board layout rules are injected only for Triptych / 3-gallery briefs:
  // single-image generations must never receive panel or board framing.
  const boardClause = wantsThreePanelBoard(prompt) ? `${THREE_PANEL_BOARD_LAYOUT_CLAUSE}\n\n` : "";
  const finalSystemPrompt = `${systemPrompt}\n\n${boardClause}${NO_WATERMARK_CLAUSE}`;
  const messages = opts.inlineSystemPrompt
    ? [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${finalSystemPrompt}\n\n${briefLabel}: ${prompt.trim()}`,
            },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ]
    : [
        {
          role: "system",
          content: finalSystemPrompt,
        },
        {
          role: "user",
          content: [
            { type: "text", text: prompt.trim() },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ];

  return {
    url: OPENROUTER_ENDPOINT,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        modalities: ["image", "text"],
        messages,
      }),
    },
  };
}

function decodeBase64(value: string): string {
  return `data:image/png;base64,${value}`;
}

function isUsableImageUrl(value: string): boolean {
  return value.length > 0 && (/^https?:\/\//i.test(value) || value.startsWith("data:image/"));
}

/** Extract a hosted image URL from markdown or an image-looking bare URL. */
export function extractImageUrlFromText(text: unknown): string | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const markdown = text.match(MARKDOWN_IMAGE_RE);
  if (markdown?.[1]) return markdown[1];
  const urls = text.match(URL_RE) ?? [];
  const imageLike = urls.find((url) => IMAGE_EXT_RE.test(url));
  return imageLike ?? null;
}

function extractFromImages(images: unknown): string | null {
  if (!Array.isArray(images)) return null;

  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const candidate = image as Record<string, unknown>;
    const directUrl = typeof candidate.url === "string" ? candidate.url : "";
    const imageUrl = candidate.image_url;
    const imageUrlStr = typeof imageUrl === "string" ? imageUrl : "";
    const imageUrlObj =
      imageUrl && typeof imageUrl === "object"
        ? (imageUrl as Record<string, unknown>).url
        : "";
    const url = directUrl || imageUrlStr || (typeof imageUrlObj === "string" ? imageUrlObj : "");
    if (isUsableImageUrl(url)) return url;
  }

  for (const image of images) {
    if (!image || typeof image !== "object") continue;
    const b64 = (image as Record<string, unknown>).b64_json;
    if (typeof b64 === "string" && b64.length > 0) return decodeBase64(b64);
  }
  return null;
}

function extractFromContent(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const fromImages = extractFromImages(record.images);
  if (fromImages) return fromImages;

  const content = record.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const item = part as Record<string, unknown>;
      const imageUrl = item.image_url;
      if (typeof imageUrl === "string" && isUsableImageUrl(imageUrl)) return imageUrl;
      if (imageUrl && typeof imageUrl === "object") {
        const url = (imageUrl as Record<string, unknown>).url;
        if (typeof url === "string" && isUsableImageUrl(url)) return url;
      }
      if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
        return decodeBase64(item.b64_json);
      }
      if (typeof item.url === "string" && isUsableImageUrl(item.url)) return item.url;
      if (typeof item.text === "string") {
        const fromText = extractImageUrlFromText(item.text);
        if (fromText) return fromText;
      }
    }
  }

  if (typeof content === "string") {
    const fromText = extractImageUrlFromText(content);
    if (fromText) return fromText;
  }
  return extractImageUrlFromText(record.text);
}

export function extractImageData(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  const fromImages = extractFromImages(record.images);
  if (fromImages) return fromImages;

  const choices = record.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as Record<string, unknown>).message;
      const found = extractFromContent(message);
      if (found) return found;
    }
  }

  return extractFromContent(record);
}

/** Keep base64 output below the serverless response budget when possible. */
export async function trimOutputDataUrl(output: string): Promise<string> {
  if (/^https?:\/\//i.test(output) || output.length <= MAX_OUTPUT_DATA_URL_BYTES) {
    return output;
  }
  if (!output.startsWith("data:image/")) return output;
  const comma = output.indexOf(",");
  if (comma < 0) return output;

  try {
    const buffer = Buffer.from(output.slice(comma + 1), "base64");
    const compressed = await sharp(buffer, { failOn: "none" })
      .jpeg({ quality: 65, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    return `data:image/jpeg;base64,${compressed.toString("base64")}`;
  } catch {
    return output;
  }
}

function createRateLimiter({ windowMs, maxRequests }: { windowMs: number; maxRequests: number }) {
  const hits = new Map<string, number[]>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const recent = (hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
      if (recent.length >= maxRequests) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      return true;
    },
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractUpstreamMessage(data: unknown): string {
  const record = data as { error?: { message?: unknown } } | null;
  return typeof record?.error?.message === "string" ? record.error.message : "";
}

const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 15 });

/**
 * Proprietary, provider-agnostic error copy. These constants are the ONLY
 * messages the platform surfaces for upstream generation failures — the
 * underlying provider is never named in any user-facing surface.
 */
export const ENGINE_BUSY_BILINGUAL =
  "عذراً، محرك قطان المعماري مشغول حالياً. يرجى المحاولة بعد قليل. | Qattan Architectural Engine is currently busy. Please retry in a moment.";

export const RATE_LIMIT_BILINGUAL =
  "يرجى الانتظار بضع ثوانٍ قبل التوليد التالي. | Please wait a few seconds before the next generation.";

export const SERVICE_NOT_CONFIGURED_BILINGUAL =
  "خدمة التوليد غير مهيأة حالياً. تواصل مع الدعم إذا استمرت المشكلة. | The generation service is not configured yet. Contact support if this persists.";

export function validateRestorePayload(body: unknown):
  | { ok: true; payload: RestorePayload }
  | RestoreFailure {
  const payload = body && typeof body === "object"
    ? body as { imageDataUrl?: unknown; prompt?: unknown; mode?: unknown; toolId?: unknown }
    : {};
  const imageDataUrl = payload.imageDataUrl;
  const prompt = payload.prompt;

  // Legacy clients (floor-plan CAD engine) send mode:"cad" without a toolId.
  const legacyMode = payload.mode === "cad" ? "cad" : undefined;
  const rawToolId = typeof payload.toolId === "string" ? payload.toolId : undefined;
  if (rawToolId !== undefined && !TOOL_IDS.includes(rawToolId as ToolId)) {
    return { ok: false, status: 400, message: `Unsupported tool: ${rawToolId}.` };
  }
  const toolId: ToolId = rawToolId !== undefined
    ? (rawToolId as ToolId)
    : legacyMode === "cad"
      ? "floorplan"
      : "exterior";
  const promptMode = resolvePromptMode(toolId);

  if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
    return { ok: false, status: 400, message: "يرجى رفع صورة واجهة صالحة." };
  }
  if (imageDataUrl.length > MAX_DATA_URL_BYTES) {
    return { ok: false, status: 413, message: "حجم الصورة أكبر من الحد المسموح. حاول رفع صورة أصغر." };
  }
  if (typeof prompt !== "string" || prompt.trim().length < 3) {
    return { ok: false, status: 400, message: "اكتب وصفاً معمارياً قبل بدء الترميم." };
  }
  if (prompt.length > 3000) {
    return { ok: false, status: 400, message: "الوصف طويل جداً." };
  }

  return { ok: true, payload: { imageDataUrl, prompt, mode: promptMode, promptMode, toolId } };
}

export async function executeRestore(
  body: unknown,
  options: { apiKey: string | undefined; clientKey: string },
): Promise<RestoreServiceResult> {
  const { apiKey: apiKeyFromOptions, clientKey } = options;
  const apiKey = apiKeyFromOptions ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 500, message: SERVICE_NOT_CONFIGURED_BILINGUAL };
  }
  if (!limiter.allow(clientKey)) {
    return { ok: false, status: 429, message: RATE_LIMIT_BILINGUAL };
  }

  const validated = validateRestorePayload(body);
  if (!validated.ok) return validated;

  try {
    let request = buildOpenRouterRequest(validated.payload.imageDataUrl, validated.payload.prompt, apiKey, {
      promptMode: validated.payload.promptMode,
    });
    let upstream = await fetch(request.url, request.init);
    let data: unknown = await safeJson(upstream);

    if (!upstream.ok && /role|system|invalid messages?/i.test(extractUpstreamMessage(data))) {
      request = buildOpenRouterRequest(validated.payload.imageDataUrl, validated.payload.prompt, apiKey, {
        inlineSystemPrompt: true,
        promptMode: validated.payload.promptMode,
      });
      upstream = await fetch(request.url, request.init);
      data = await safeJson(upstream);
    }

    if (!upstream.ok) {
      // Server-side diagnostic (never sent to the client): the sanitized HTTP
      // status pinpoints invalid-key vs empty-account vs model errors without
      // naming the provider anywhere a user can see.
      console.log(
        `[ENGINE_UPSTREAM] status=${upstream.status} detail=${JSON.stringify(
          extractUpstreamMessage(data).slice(0, 200),
        )}`,
      );
      const upstreamMessage = extractUpstreamMessage(data);
      if (
        upstream.status === 402 ||
        /insufficient.?credits|out of credits|insufficient balance/i.test(upstreamMessage)
      ) {
        // Provider-side capacity/balance issues are presented as a busy engine,
        // never as an account or provider problem.
        return { ok: false, status: 502, message: ENGINE_BUSY_BILINGUAL };
      }
      return {
        ok: false,
        status: upstream.status >= 500 ? 502 : upstream.status,
        message: ENGINE_BUSY_BILINGUAL,
      };
    }

    const output = extractImageData(data);
    if (!output) return { ok: false, status: 502, message: "لم تصل صورة من نموذج الترميم." };

    return { ok: true, imageDataUrl: await trimOutputDataUrl(output) };
  } catch {
    return { ok: false, status: 502, message: ENGINE_BUSY_BILINGUAL };
  }
}

/**
 * Zero-watermark guarantee for the Qattan Architectural Engine. Appended to
 * every system prompt so all outputs ship as clean, presentation-grade
 * renders with no watermarks, logos, or vendor marks of any kind.
 */
export const NO_WATERMARK_CLAUSE = [
  "OUTPUT BRAND SAFETY (NON-NEGOTIABLE):",
  "Deliver a 100% clean, watermark-free architectural presentation render.",
  "Do not add watermarks, logos, vendor marks, signatures, UI chrome, borders, or overlay text of any kind.",
  "Do not embed any brand name, model name, or provider name in the image.",
  "The output must be a pure architectural image at maximum resolution and quality.",
].join(" ");
