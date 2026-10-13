import sharp from "sharp";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";

export const CONCEPT_BOARD_MODELS = {
  image: "google/gemini-3.1-flash-lite-image",
} as const;
export const OPENROUTER_IMAGES_ENDPOINT = "https://openrouter.ai/api/v1/images";

export const CONCEPT_BOARD_LIMITS = {
  brief: 1_500,
  history: 8,
  historyItem: 500,
  response: 100_000,
  boardResponse: 12_000_000,
  boardDataUrl: 2_000_000,
  // Leave time for response validation and image normalization within the
  // route's Hobby-compatible 60s function budget.
  timeoutMs: 45_000,
} as const;

const STRATEGIES = ["central-spine", "courtyard", "split-wing", "perimeter-loop", "dual-core"] as const;
export type LayoutStrategy = (typeof STRATEGIES)[number];
export type ConceptZone = { name: string; location: string; areaShare: number };
export type ArchitecturalConcept = {
  id: "A" | "B" | "C";
  title: string;
  strategy: LayoutStrategy;
  siteWidthM: number;
  siteDepthM: number;
  idea: string;
  circulation: string;
  program: string[];
  zones: ConceptZone[];
};
export type ConceptDialogue =
  | { type: "clarify"; reply: string; question: string }
  | { type: "concepts"; reply: string; concepts: [ArchitecturalConcept, ArchitecturalConcept, ArchitecturalConcept] };
export type ConceptChatTurn = { role: "user" | "assistant"; content: string };

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function boundedText(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

export function isConceptBoardAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  const model = resolveArchitectTextModel(env);
  return env.QATTAN_BLENDER_LAB_ENABLED === "1" && Boolean(env.OPENROUTER_API_KEY?.trim()) && Boolean(model && /^anthropic\/claude-sonnet/i.test(model));
}

export function parseConceptDialogue(value: unknown): ConceptDialogue | null {
  if (!record(value) || !boundedText(value.reply, 2, 600)) return null;
  if (value.type === "clarify") {
    return boundedText(value.question, 5, 300)
      ? { type: "clarify", reply: value.reply.trim(), question: value.question.trim() }
      : null;
  }
  if (value.type !== "concepts" || !Array.isArray(value.concepts) || value.concepts.length !== 3) return null;
  const concepts: ArchitecturalConcept[] = [];
  const ids = ["A", "B", "C"] as const;
  for (const [index, raw] of value.concepts.entries()) {
    if (!record(raw) || raw.id !== ids[index] || !boundedText(raw.title, 2, 70) || !STRATEGIES.includes(raw.strategy as LayoutStrategy) || typeof raw.siteWidthM !== "number" || !Number.isFinite(raw.siteWidthM) || raw.siteWidthM < 3 || raw.siteWidthM > 100 || typeof raw.siteDepthM !== "number" || !Number.isFinite(raw.siteDepthM) || raw.siteDepthM < 3 || raw.siteDepthM > 100 || !boundedText(raw.idea, 30, 500) || !boundedText(raw.circulation, 20, 300)) return null;
    if (!Array.isArray(raw.program) || raw.program.length < 1 || raw.program.length > 16 || !raw.program.every((entry) => boundedText(entry, 1, 60))) return null;
    if (!Array.isArray(raw.zones) || raw.zones.length < 2 || raw.zones.length > 12) return null;
    const zones: ConceptZone[] = [];
    for (const zone of raw.zones) {
      if (!record(zone) || !boundedText(zone.name, 1, 60) || !boundedText(zone.location, 2, 80) || typeof zone.areaShare !== "number" || !Number.isFinite(zone.areaShare) || zone.areaShare <= 0 || zone.areaShare > 1) return null;
      zones.push({ name: zone.name.trim(), location: zone.location.trim(), areaShare: zone.areaShare });
    }
    concepts.push({
      id: ids[index], title: raw.title.trim(), strategy: raw.strategy as LayoutStrategy, siteWidthM: raw.siteWidthM, siteDepthM: raw.siteDepthM,
      idea: raw.idea.trim(), circulation: raw.circulation.trim(),
      program: (raw.program as string[]).map((item) => item.trim()), zones,
    });
  }
  const strategies = new Set(concepts.map((concept) => concept.strategy));
  const programs = concepts.map((concept) => concept.program.map((item) => item.toLowerCase().replace(/\s+/g, " ")).sort().join("|"));
  const siteDimensions = new Set(concepts.map((concept) => `${concept.siteWidthM}x${concept.siteDepthM}`));
  if (strategies.size !== 3 || new Set(programs).size !== 1 || siteDimensions.size !== 1) return null;
  return { type: "concepts", reply: value.reply.trim(), concepts: concepts as [ArchitecturalConcept, ArchitecturalConcept, ArchitecturalConcept] };
}

function parseSingleConcept(value: unknown): ArchitecturalConcept | null {
  if (!record(value) || (value.id !== "A" && value.id !== "B" && value.id !== "C") || !boundedText(value.title, 2, 70) || !STRATEGIES.includes(value.strategy as LayoutStrategy) || typeof value.siteWidthM !== "number" || !Number.isFinite(value.siteWidthM) || value.siteWidthM < 3 || value.siteWidthM > 100 || typeof value.siteDepthM !== "number" || !Number.isFinite(value.siteDepthM) || value.siteDepthM < 3 || value.siteDepthM > 100 || !boundedText(value.idea, 30, 500) || !boundedText(value.circulation, 20, 300)) return null;
  if (!Array.isArray(value.program) || value.program.length < 1 || value.program.length > 16 || !value.program.every((entry) => boundedText(entry, 1, 60))) return null;
  if (!Array.isArray(value.zones) || value.zones.length < 2 || value.zones.length > 12 || !value.zones.every((zone) => record(zone) && boundedText(zone.name, 1, 60) && boundedText(zone.location, 2, 80) && typeof zone.areaShare === "number" && Number.isFinite(zone.areaShare) && zone.areaShare > 0 && zone.areaShare <= 1)) return null;
  return { id: value.id, title: value.title.trim(), strategy: value.strategy as LayoutStrategy, siteWidthM: value.siteWidthM, siteDepthM: value.siteDepthM, idea: value.idea.trim(), circulation: value.circulation.trim(), program: (value.program as string[]).map((item) => item.trim()), zones: (value.zones as Record<string, unknown>[]).map((zone) => ({ name: (zone.name as string).trim(), location: (zone.location as string).trim(), areaShare: zone.areaShare as number })) };
}

export function parseSelectedConcept(value: unknown): ArchitecturalConcept | null {
  return parseSingleConcept(value);
}

export function parseConceptDialogueInput(value: unknown): { brief: string; history: ConceptChatTurn[] } | null {
  if (!record(value) || typeof value.brief !== "string" || !value.brief.trim() || value.brief.length > CONCEPT_BOARD_LIMITS.brief) return null;
  const historyRaw = value.history === undefined ? [] : value.history;
  if (!Array.isArray(historyRaw) || historyRaw.length > CONCEPT_BOARD_LIMITS.history) return null;
  const history: ConceptChatTurn[] = [];
  for (const item of historyRaw) {
    if (!record(item) || (item.role !== "user" && item.role !== "assistant") || !boundedText(item.content, 1, CONCEPT_BOARD_LIMITS.historyItem)) return null;
    history.push({ role: item.role, content: item.content.trim() });
  }
  return { brief: value.brief.trim(), history };
}

function providerCost(payload: unknown): number | null {
  if (!record(payload) || !record(payload.usage)) return null;
  const cost = payload.usage.cost ?? payload.usage.total_cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost >= 0 && cost <= 10 ? cost : null;
}

const SONNET_SYSTEM = `You are the architectural concept interviewer for a private design pilot. Help the user turn an initial brief into three distinct spatial concepts for one floor plan. Ask a question only when a missing choice would materially change the plan; otherwise state a concise assumption and proceed. Keep any stated required room program exactly the same in concepts A, B, and C, and keep site dimensions identical across all concepts. When enough is known, return only JSON in this shape: {"type":"concepts","reply":"short summary and assumptions","concepts":[{"id":"A","title":"...","strategy":"central-spine|courtyard|split-wing|perimeter-loop|dual-core","siteWidthM":20,"siteDepthM":20,"idea":"...","circulation":"...","program":["..."],"zones":[{"name":"...","location":"...","areaShare":0.3}]}]}. Use dimensions from the brief; when they are absent, choose sensible dimensions and state the assumption in reply. Use each strategy exactly once and produce materially different arrangements/circulation. Program is the shared required program, not a wish list. Zone shares are approximate and sum to roughly 1. Never promise code or structural compliance. If one key requirement is truly missing, return {"type":"clarify","reply":"...","question":"one concise question"}. Do not ask repeated questions already answered in RECENT DIALOGUE. Keep all strings concise and return valid JSON only.`;

export async function generateConceptDialogue(
  input: { brief: string; history: ConceptChatTurn[] },
  fetchFn: typeof fetch = fetch,
): Promise<{ dialogue: ConceptDialogue; costUsd: number | null }> {
  const model = resolveArchitectTextModel();
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !/^anthropic\/claude-sonnet/i.test(model) || !apiKey) throw new Error("Concept interviewer is not configured for Sonnet");
  const request = {
    model, temperature: 0.25, max_tokens: 5_000,
    messages: [
      { role: "system", content: SONNET_SYSTEM },
      { role: "user", content: `BRIEF:\n${input.brief}\nRECENT DIALOGUE:\n${JSON.stringify(input.history)}` },
    ],
  };
  let response: Response;
  try {
    response = await fetchFn(OPENROUTER_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(45_000) });
  } catch { throw new Error("The concept interviewer request timed out or could not connect"); }
  if (!response.ok) throw new Error(`The concept interviewer returned an upstream error (${response.status})`);
  const raw = await response.text();
  if (raw.length > CONCEPT_BOARD_LIMITS.response) throw new Error("The concept interviewer response exceeded its size limit");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new Error("The concept interviewer response was not valid JSON"); }
  const text = extractChatText(payload);
  const parsed = text ? parseConceptDialogue(extractJsonPayload(text)) : null;
  if (!parsed) throw new Error("The concept interviewer did not return three valid distinct concepts");
  return { dialogue: parsed, costUsd: providerCost(payload) };
}

export function buildConceptBoardPrompt(concepts: ArchitecturalConcept[]): string {
  const validated = parseConceptDialogue({ type: "concepts", reply: "Valid concepts", concepts });
  if (!validated || validated.type !== "concepts") throw new Error("Three valid concepts are required to make the board");
  const cards = validated.concepts.map((concept) => `${concept.id} — ${concept.title}\nSite: ${concept.siteWidthM}m × ${concept.siteDepthM}m\nStrategy: ${concept.strategy}\nIdea: ${concept.idea}\nCirculation: ${concept.circulation}\nProgram: ${concept.program.join(", ")}\nZones: ${concept.zones.map((zone) => `${zone.name} ${zone.location} ~${Math.round(zone.areaShare * 100)}%`).join("; ")}`).join("\n\n");
  return `Create exactly ONE landscape architectural concept board image with THREE equal vertical panels side-by-side, clean thin separators, no margins. Each panel is a distinct top-down furnished 2D floor-plan concept, clear enough to compare room adjacency and circulation. All three panels must show the SAME required program, site proportions and approximate scale, but use their specified different spatial strategy. Render clean professional architectural diagram graphics, legible walls/openings/furniture, restrained distinct accent colors, white/light background. Do not write any letters, numbers, captions, logos or watermarks in the image; the app overlays A/B/C labels. No perspective or facade views. This is a concept comparison, not a dimensioned or code-compliant plan.\n\nCONCEPTS:\n${cards}`;
}

export async function generateConceptBoard(
  concepts: ArchitecturalConcept[],
  fetchFn: typeof fetch = fetch,
): Promise<{ imageDataUrl: string; costUsd: number | null }> {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("Image generation is not configured");
  const prompt = buildConceptBoardPrompt(concepts);
  let response: Response;
  try {
    // This is intentionally the only upstream image call: no retries or fallback model.
    response = await fetchFn(OPENROUTER_IMAGES_ENDPOINT, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: CONCEPT_BOARD_MODELS.image, prompt, n: 1, resolution: "1K", aspect_ratio: "16:9", provider: { allow_fallbacks: false } }),
      signal: AbortSignal.timeout(CONCEPT_BOARD_LIMITS.timeoutMs),
    });
  } catch { throw new Error("The single concept-board image request timed out or could not connect"); }
  if (!response.ok) throw new Error(`The single concept-board image request failed (${response.status}); no automatic retry was made`);
  const raw = await response.text();
  if (raw.length > CONCEPT_BOARD_LIMITS.boardResponse) throw new Error("The generated board response exceeded its size limit");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { throw new Error("The image service returned an invalid response"); }
  if (!record(payload) || !Array.isArray(payload.data) || payload.data.length !== 1 || !record(payload.data[0]) || typeof payload.data[0].b64_json !== "string" || payload.data[0].b64_json.length > 10_000_000) throw new Error("The single image request did not return exactly one embedded board image");
  const mediaType = typeof payload.data[0].media_type === "string" ? payload.data[0].media_type : "image/png";
  if (!/^image\/(png|jpeg|webp)$/i.test(mediaType)) throw new Error("The image service returned an unsupported board format");
  const extracted = `data:${mediaType};base64,${payload.data[0].b64_json}`;
  let imageDataUrl: string;
  try {
    const comma = extracted.indexOf(",");
    if (comma < 0 || !/^data:image\/(png|jpeg|webp);base64$/i.test(extracted.slice(0, comma))) throw new Error("unsupported image format");
    const source = Buffer.from(extracted.slice(comma + 1), "base64");
    const image = await sharp(source, { failOn: "error", limitInputPixels: 40_000_000 }).resize({ width: 1536, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    if (image.length > CONCEPT_BOARD_LIMITS.boardDataUrl * 0.72) throw new Error("board image exceeds size limit");
    imageDataUrl = `data:image/jpeg;base64,${image.toString("base64")}`;
  } catch { throw new Error("The generated board image could not be safely normalized"); }
  return { imageDataUrl, costUsd: providerCost(payload) };
}

export async function getSelectedPanelDataUrl(boardDataUrl: string, selectedId: "A" | "B" | "C"): Promise<string | null> {
  if (typeof boardDataUrl !== "string" || boardDataUrl.length > CONCEPT_BOARD_LIMITS.boardDataUrl) return null;
  const match = boardDataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  try {
    const source = Buffer.from(match[2], "base64");
    const image = sharp(source, { failOn: "error", limitInputPixels: 40_000_000 });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || metadata.width < 180 || metadata.height < 180) return null;
    const index = selectedId.charCodeAt(0) - 65;
    const left = Math.floor(metadata.width * index / 3);
    const right = Math.floor(metadata.width * (index + 1) / 3);
    const panel = await image.extract({ left, top: 0, width: right - left, height: metadata.height }).resize({ width: 512, height: 768, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 65, mozjpeg: true }).toBuffer();
    return `data:image/jpeg;base64,${panel.toString("base64")}`;
  } catch { return null; }
}
