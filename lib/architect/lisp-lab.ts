import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { CONCEPT_BOARD_MODELS } from "./concept-board";

export const LISP_LAB_LIMITS = { brief: 2_000, source: 80_000, responseBytes: 200_000, timeoutMs: 270_000, maxTokens: 20_000, totalOutputTokens: 100_000 } as const;

export const LISP_GENERATION_STAGES = ["layout", "helpers", "shell", "interior"] as const;
export type LispGenerationStage = typeof LISP_GENERATION_STAGES[number];

export type LispPlan = {
  siteMm: [number, number];
  walls: Array<{ id: string; start: [number, number]; end: [number, number]; role: "outer" | "partition" }>;
  openings: Array<{ id: string; wallId: string; offsetMm: number; widthMm: number; kind: "DOOR" | "WINDOW" }>;
  rooms: Array<{ id: string; label: string; bounds: [number, number, number, number]; kind: string }>;
  stair: { id: string; bounds: [number, number, number, number] };
};

const SYSTEM_PROMPT = `Create a deterministic AutoLISP drawing in millimetres for QATTANPLAN. Work only on the assigned stage. All stages use the same locked JSON layout manifest; never change its coordinates, IDs, counts, or room labels. Use entmake only. Source must use reusable helpers, be concise, and return only the requested JSON or complete defun forms, without Markdown. Never use command/eval, file or network access, shell/system, COM/ActiveX, reactors, autoload/startup hooks, persistence or external dependencies. Do not claim code compliance or structural validation.`;

const STAGE_INSTRUCTIONS: Record<LispGenerationStage, string> = {
  layout: `Return ONLY compact JSON matching {"siteMm":[width,height],"walls":[{"id":"w1","start":[x,y],"end":[x,y],"role":"outer|partition"}],"openings":[{"id":"o1","wallId":"w1","offsetMm":500,"widthMm":900,"kind":"DOOR|WINDOW"}],"rooms":[{"id":"r1","label":"Bedroom 1","bounds":[x1,y1,x2,y2],"kind":"bedroom"}],"stair":{"id":"stair-main","bounds":[x1,y1,x2,y2]}}. Coordinates are mm, within the site; walls are axis aligned. Create a coherent layout satisfying the entire brief. No source code.`,
  helpers: `Return complete top-level defun forms only. Define compact reusable functions q:layer (name color), q:line (a b layer), q:rect (bounds layer), q:text (point height value layer), q:dim (a b point). Use entmake with DXF lists; no command function. Use exactly these layer name string literals in source: "WALLS", "DOORS", "WINDOWS", "STAIRS", "LABELS", "DIMENSIONS".`,
  shell: `Return complete top-level defun forms only: q:draw-site, q:draw-walls, q:draw-openings, q:draw-stair. Read geometry only from the supplied locked manifest. Use q:line/q:rect/q:layer helpers defined in earlier stage. Walls must leave actual gaps from opening offsets and widths measured along each host wall; draw door/window symbols on layers "DOORS" and "WINDOWS". Draw site/walls/stair on "WALLS"/"STAIRS". Stair should show a bounded schematic flight with treads.`,
  interior: `Return complete top-level defun forms only: q:draw-rooms, q:draw-dimensions, and c:QATTANPLAN. Use only the locked manifest and earlier helpers/functions. Draw room boundary lines/labels and overall dimensions; c:QATTANPLAN creates needed named layers, calls all drawing functions in order, prints a short completion message, then (princ). Use layer name literals "LABELS" and "DIMENSIONS"; ensure the command invokes q:layer for "WALLS", "DOORS", "WINDOWS", "STAIRS", "LABELS", and "DIMENSIONS". Include millimetre and clean-drawing warning as a short source comment. Do not redefine earlier functions.`,
};

/**
 * Small fail-closed source check. We never evaluate AutoLISP on the server;
 * this only rejects incomplete text and obvious file/network/shell/startup APIs.
 */
export function validateAutoLispSource(source: string): { valid: true; source: string } | { valid: false; reason: "empty" | "too_large" | "fenced" | "unsafe_symbol" | "missing_entrypoint" | "unbalanced" | "top_level_expression" } {
  const code = source.trim();
  if (!code) return { valid: false, reason: "empty" };
  if (code.length > LISP_LAB_LIMITS.source) return { valid: false, reason: "too_large" };
  if (/```|~~~/.test(code)) return { valid: false, reason: "fenced" };

  let depth = 0;
  let inString = false;
  let escaped = false;
  let inComment = false;
  let visible = "";
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (inComment) {
      if (ch === "\n" || ch === "\r") { inComment = false; visible += "\n"; }
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      visible += " ";
      continue;
    }
    if (ch === ";") { inComment = true; visible += " "; continue; }
    if (ch === '"') { inString = true; visible += " "; continue; }
    if (ch === "(") depth++;
    if (ch === ")" && --depth < 0) return { valid: false, reason: "unbalanced" };
    visible += ch;
  }
  if (inString || depth !== 0) return { valid: false, reason: "unbalanced" };

  const normalized = visible.toLowerCase();
  const topLevelForms: string[] = [];
  let formDepth = 0;
  let formStart = -1;
  for (let i = 0; i < visible.length; i++) {
    const ch = visible[i];
    if (ch === "(" && formDepth === 0) formStart = i;
    if (ch === "(" ) formDepth++;
    else if (ch === ")") {
      formDepth--;
      if (formDepth === 0 && formStart >= 0) { topLevelForms.push(visible.slice(formStart, i + 1)); formStart = -1; }
    } else if (formDepth === 0 && !/\s/.test(ch)) return { valid: false, reason: "top_level_expression" };
  }
  if (!topLevelForms.length || topLevelForms.some((form) => !/^\(\s*defun\s+/i.test(form))) return { valid: false, reason: "top_level_expression" };
  const forbidden = /\b(?:open|close|load|findfile|startapp|shell|system|command|command-s|vl-cmdf|eval|autoload|arxload|menuload|vl-load-com|vlax-[\w-]*|vl-file-[\w-]*|vl-http-[\w-]*|vl-socket-[\w-]*|getenv|setenv|getvar|setvar|ads_[\w-]*|s::startup|acaddoc\.lsp|acad\.lsp|vlr-[\w-]*|acet-[\w-]*)\b/;
  if (forbidden.test(normalized)) return { valid: false, reason: "unsafe_symbol" };
  if (!/\(\s*defun\s+c:qattanplan\b/.test(normalized) || !/\bentmake\b/.test(normalized)) return { valid: false, reason: "missing_entrypoint" };
  return { valid: true, source: code.endsWith("\n") ? code : `${code}\n` };
}
function sanitizedLisp(source: string): string {
  let result = "";
  let inString = false;
  let inComment = false;
  let escaped = false;
  for (const ch of source) {
    if (inComment) { if (ch === "\n" || ch === "\r") { inComment = false; result += ch; } else result += " "; continue; }
    if (inString) {
      result += ch === "\n" || ch === "\r" ? ch : " ";
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === ";") { inComment = true; result += " "; continue; }
    if (ch === '"') { inString = true; result += " "; continue; }
    result += ch;
  }
  return result;
}

function topLevelDefunForms(source: string): string[] {
  const visible = sanitizedLisp(source);
  const forms: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < visible.length; i++) {
    const ch = visible[i];
    if (ch === "(" && depth === 0) start = i;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) { forms.push(visible.slice(start, i + 1)); start = -1; }
    }
  }
  return forms.filter((form) => /^\(\s*defun\s+/i.test(form));
}

export function validateCompletedAutoLisp(source: string): { valid: true; source: string } | { valid: false; reason: "incomplete_stages" | "duplicate_function" | "missing_layer_or_entity" | "entrypoint_missing_calls" } {
  const base = validateAutoLispSource(source);
  if (!base.valid) return { valid: false, reason: "incomplete_stages" };
  const code = base.source;
  const forms = topLevelDefunForms(code);
  const names = forms.map((form) => form.match(/^\(\s*defun\s+([^\s()]+)/i)?.[1].toLowerCase() ?? "");
  if (new Set(names).size !== names.length) return { valid: false, reason: "duplicate_function" };
  const required = ["q:layer", "q:line", "q:rect", "q:text", "q:dim", "q:draw-site", "q:draw-walls", "q:draw-openings", "q:draw-stair", "q:draw-rooms", "q:draw-dimensions", "c:qattanplan"];
  if (required.some((name) => !names.includes(name))) return { valid: false, reason: "incomplete_stages" };
  const lower = code.toLowerCase().replace(/;[^\r\n]*/g, "");
  const layerNameGroups = [/(?:walls?)/, /(?:doors?)/, /(?:windows?)/, /(?:stairs?)/, /(?:labels?)/, /(?:dimensions?)/];
  if (!/\bentmake\b/.test(lower) || layerNameGroups.some((names) => !new RegExp(`"${names.source}"`).test(lower))) return { valid: false, reason: "missing_layer_or_entity" };
  const commandForm = forms.find((form) => /^\(\s*defun\s+c:qattanplan\b/i.test(form))?.toLowerCase() ?? "";
  if (["q:layer", "q:draw-site", "q:draw-walls", "q:draw-openings", "q:draw-stair", "q:draw-rooms", "q:draw-dimensions"].some((name) => !commandForm.includes(name))) return { valid: false, reason: "entrypoint_missing_calls" };
  return { valid: true, source: base.source };
}

export type LispAssemblyFailure = { valid: false; reason: "invalid_plan" | "invalid_fragment" | "incomplete_stages" | "duplicate_function" | "missing_functions" | "missing_layer_or_entity" | "entrypoint_missing_calls"; targetIndex: number; missingFunctions?: string[] };
export function assembleAutoLispStages(planValue: unknown, partsValue: unknown): { valid: true; source: string } | LispAssemblyFailure {
  if (!validateLispPlan(planValue)) return { valid: false, reason: "invalid_plan", targetIndex: 0 };
  if (!Array.isArray(partsValue) || partsValue.length !== 3 || partsValue.some((part) => typeof part !== "string")) return { valid: false, reason: "invalid_fragment", targetIndex: 0 };
  const parts = partsValue as string[];
  const expected = [
    ["q:layer", "q:line", "q:rect", "q:text", "q:dim"],
    ["q:draw-site", "q:draw-walls", "q:draw-openings", "q:draw-stair"],
    ["q:draw-rooms", "q:draw-dimensions", "c:qattanplan"],
  ];
  const seen = new Set<string>();
  for (let i = 0; i < parts.length; i++) {
    if (!validateLispFragment(parts[i])) return { valid: false, reason: "invalid_fragment", targetIndex: i };
    const names = topLevelDefunForms(parts[i]).map((form) => form.match(/^\(\s*defun\s+([^\s()]+)/i)?.[1].toLowerCase() ?? "");
    if (new Set(names).size !== names.length || names.some((name) => seen.has(name))) return { valid: false, reason: "duplicate_function", targetIndex: i };
    const missing = expected[i].filter((name) => !names.includes(name));
    if (missing.length) return { valid: false, reason: "missing_functions", targetIndex: i, missingFunctions: missing };
    names.forEach((name) => seen.add(name));
  }
  const result = validateCompletedAutoLisp(parts.join("\n\n"));
  if (result.valid) return result;
  const targetIndex = result.reason === "entrypoint_missing_calls" ? 2 : result.reason === "missing_layer_or_entity" ? 0 : 2;
  return { valid: false, reason: result.reason, targetIndex };
}

export function validateLispStageFragment(stage: Exclude<LispGenerationStage, "layout">, source: string): { valid: true } | { valid: false; reason: "invalid_fragment" | "missing_functions" | "missing_layer_names" | "entrypoint_missing_calls"; missingFunctions?: string[] } {
  if (!validateLispFragment(source)) return { valid: false, reason: "invalid_fragment" };
  const names = topLevelDefunForms(source).map((form) => form.match(/^\(\s*defun\s+([^\s()]+)/i)?.[1].toLowerCase() ?? "");
  const expected: Record<Exclude<LispGenerationStage, "layout">, string[]> = {
    helpers: ["q:layer", "q:line", "q:rect", "q:text", "q:dim"],
    shell: ["q:draw-site", "q:draw-walls", "q:draw-openings", "q:draw-stair"],
    interior: ["q:draw-rooms", "q:draw-dimensions", "c:qattanplan"],
  };
  const missingFunctions = expected[stage].filter((name) => !names.includes(name));
  if (missingFunctions.length) return { valid: false, reason: "missing_functions", missingFunctions };
  const lower = source.toLowerCase();
  if (stage === "helpers" && ["walls", "doors", "windows", "stairs", "labels", "dimensions"].some((layer) => !new RegExp(`"${layer}"`).test(lower))) return { valid: false, reason: "missing_layer_names" };
  if (stage === "interior") {
    const commandForm = topLevelDefunForms(source).find((form) => /^\(\s*defun\s+c:qattanplan\b/i.test(form))?.toLowerCase() ?? "";
    if (["q:layer", "q:draw-site", "q:draw-walls", "q:draw-openings", "q:draw-stair", "q:draw-rooms", "q:draw-dimensions"].some((name) => !commandForm.includes(name))) return { valid: false, reason: "entrypoint_missing_calls" };
  }
  return { valid: true };
}

export function validateLispPlan(value: unknown): LispPlan | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const plan = value as Record<string, unknown>;
  const pair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  const bounds = (v: unknown): v is [number, number, number, number] => Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === "number" && Number.isFinite(n));
  if (!pair(plan.siteMm) || !plan.siteMm.every((n) => n >= 2_000 && n <= 100_000)) return null;
  const [width, height] = plan.siteMm;
  if (!Array.isArray(plan.walls) || plan.walls.length < 4 || plan.walls.length > 80) return null;
  if (!Array.isArray(plan.openings) || plan.openings.length < 1 || plan.openings.length > 100) return null;
  if (!Array.isArray(plan.rooms) || plan.rooms.length < 2 || plan.rooms.length > 40) return null;
  const ids = new Set<string>();
  const walls = new Map<string, number>();
  for (const raw of plan.walls) {
    if (!raw || typeof raw !== "object") return null;
    const wall = raw as Record<string, unknown>;
    if (typeof wall.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(wall.id) || ids.has(wall.id) || !pair(wall.start) || !pair(wall.end) || !["outer", "partition"].includes(String(wall.role))) return null;
    const [[x1, y1], [x2, y2]] = [wall.start, wall.end] as [[number, number], [number, number]];
    if ([x1, x2].some((x) => x < 0 || x > width) || [y1, y2].some((y) => y < 0 || y > height) || (x1 !== x2 && y1 !== y2)) return null;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (length < 100) return null;
    ids.add(wall.id); walls.set(wall.id, length);
  }
  const openingIntervals = new Map<string, Array<[number, number]>>();
  for (const raw of plan.openings) {
    if (!raw || typeof raw !== "object") return null;
    const opening = raw as Record<string, unknown>;
    if (typeof opening.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(opening.id) || ids.has(opening.id) || typeof opening.wallId !== "string" || !walls.has(opening.wallId) || !["DOOR", "WINDOW"].includes(String(opening.kind)) || typeof opening.offsetMm !== "number" || !Number.isFinite(opening.offsetMm) || typeof opening.widthMm !== "number" || !Number.isFinite(opening.widthMm)) return null;
    if (opening.widthMm < 400 || opening.widthMm > 4_000 || opening.offsetMm < 50 || opening.offsetMm + opening.widthMm > walls.get(opening.wallId)! - 50) return null;
    const intervals = openingIntervals.get(opening.wallId) ?? [];
    if (intervals.some(([start, end]) => opening.offsetMm as number < end && (opening.offsetMm as number) + (opening.widthMm as number) > start)) return null;
    intervals.push([opening.offsetMm, opening.offsetMm + opening.widthMm]); openingIntervals.set(opening.wallId, intervals);
    ids.add(opening.id);
  }
  const roomRects: Array<[number, number, number, number]> = [];
  for (const raw of plan.rooms) {
    if (!raw || typeof raw !== "object") return null;
    const room = raw as Record<string, unknown>;
    if (typeof room.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(room.id) || ids.has(room.id) || typeof room.label !== "string" || room.label.length < 1 || room.label.length > 64 || typeof room.kind !== "string" || room.kind.length > 32 || !bounds(room.bounds)) return null;
    const [x1, y1, x2, y2] = room.bounds;
    if (x1 < 0 || y1 < 0 || x2 > width || y2 > height || x2 - x1 < 1_000 || y2 - y1 < 1_000 || x2 <= x1 || y2 <= y1) return null;
    if (roomRects.some(([ax1, ay1, ax2, ay2]) => x1 < ax2 && x2 > ax1 && y1 < ay2 && y2 > ay1)) return null;
    roomRects.push(room.bounds);
    ids.add(room.id);
  }
  if (!plan.stair || typeof plan.stair !== "object") return null;
  const stair = plan.stair as Record<string, unknown>;
  if (typeof stair.id !== "string" || !/^[a-zA-Z0-9_-]{1,48}$/.test(stair.id) || ids.has(stair.id) || !bounds(stair.bounds)) return null;
  const [sx1, sy1, sx2, sy2] = stair.bounds;
  if (sx1 < 0 || sy1 < 0 || sx2 > width || sy2 > height || sx2 - sx1 < 500 || sy2 - sy1 < 500 || sx2 <= sx1 || sy2 <= sy1) return null;
  if (roomRects.some(([x1, y1, x2, y2]) => sx1 < x2 && sx2 > x1 && sy1 < y2 && sy2 > y1)) return null;
  return plan as unknown as LispPlan;
}

function validateLispFragment(source: string): boolean {
  const code = source.trim();
  if (!code || code.length > 40_000 || /```|~~~/.test(code)) return false;
  const stripped = sanitizedLisp(code);
  let depth = 0;
  const forms: string[] = [];
  let start = -1;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === "(" && depth === 0) start = i;
    if (ch === "(") depth++;
    else if (ch === ")") {
      if (--depth < 0) return false;
      if (depth === 0 && start >= 0) { forms.push(stripped.slice(start, i + 1)); start = -1; }
    } else if (depth === 0 && !/\s/.test(ch)) return false;
  }
  if (depth !== 0 || !forms.length || forms.some((form) => !/^\(\s*defun\s+/i.test(form))) return false;
  const forbidden = /\b(?:open|close|load|findfile|startapp|shell|system|command|command-s|vl-cmdf|eval|autoload|arxload|menuload|vl-load-com|vlax-[\w-]*|vl-file-[\w-]*|vl-http-[\w-]*|vl-socket-[\w-]*|getenv|setenv|getvar|setvar|ads_[\w-]*|s::startup|acaddoc\.lsp|acad\.lsp|vlr-[\w-]*|acet-[\w-]*)\b/i;
  return !forbidden.test(stripped);
}

export function createLispStagePrompt(stage: LispGenerationStage, brief: string, plan?: LispPlan, priorSource = ""): string {
  const signatures = [...sanitizedLisp(priorSource).matchAll(/^[ \t]*\(\s*defun\s+([^\r\n)]*)/gim)].map((match) => `(defun ${match[1].trim()})`);
  const context = stage === "layout" ? `Brief:\n${brief}` : `Brief:\n${brief}\nLocked layout JSON (do not alter):\n${JSON.stringify(plan)}${signatures.length ? `\nEarlier function signatures (available, do not redefine):\n${[...new Set(signatures)].join("\n")}` : ""}`;
  return `${STAGE_INSTRUCTIONS[stage]}\n\n${context}`;
}

export async function streamAutoLispStage(args: {
  stage: LispGenerationStage;
  brief: string;
  plan?: LispPlan;
  priorSource?: string;
  onDelta: (text: string) => void;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}): Promise<{ output: string; plan?: LispPlan; usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null } }> {
  const { stage, brief, onDelta } = args;
  if (!LISP_GENERATION_STAGES.includes(stage) || !brief.trim() || brief.length > LISP_LAB_LIMITS.brief) throw new Error("invalid_stage_request");
  if (stage !== "layout" && !validateLispPlan(args.plan)) throw new Error("invalid_layout");
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("unavailable");
  let response: Response;
  try {
    response = await (args.fetchFn ?? fetch)(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://www.qattan-ai.com", "X-Title": "Qattan AutoLISP Pilot" },
      body: JSON.stringify({ model: CONCEPT_BOARD_MODELS.text, temperature: 0.2, max_tokens: LISP_LAB_LIMITS.maxTokens, reasoning: { effort: "medium" }, stream: true, stream_options: { include_usage: true }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: createLispStagePrompt(stage, brief, args.plan, args.priorSource) }] }),
      signal: args.signal ? AbortSignal.any([AbortSignal.timeout(LISP_LAB_LIMITS.timeoutMs), args.signal]) : AbortSignal.timeout(LISP_LAB_LIMITS.timeoutMs), cache: "no-store",
    });
  } catch (error) {
    const category = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request_failed";
    console.warn("[LISP_LAB_UPSTREAM_FAILED]", JSON.stringify({ category, stage }));
    throw new Error("upstream_failed");
  }
  if (!response.ok || !response.body) {
    console.warn("[LISP_LAB_UPSTREAM_FAILED]", JSON.stringify({ category: response.ok ? "missing_stream" : "http_error", status: response.status, stage }));
    throw new Error("upstream_failed");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let finishReason: string | null = null;
  let usage: Record<string, unknown> = {};
  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(data) as Record<string, unknown>; } catch { throw new Error("invalid_stream"); }
    if (payload.error) throw new Error("upstream_stream_error");
    if (payload.usage && typeof payload.usage === "object") usage = payload.usage as Record<string, unknown>;
    const choices = Array.isArray(payload.choices) ? payload.choices : [];
    const choice = choices[0] as Record<string, unknown> | undefined;
    if (typeof choice?.finish_reason === "string") finishReason = choice.finish_reason;
    const delta = choice?.delta && typeof choice.delta === "object" ? choice.delta as Record<string, unknown> : {};
    if (typeof delta.content === "string") {
      output += delta.content;
      if (output.length > 40_000) throw new Error("stage_too_large");
      onDelta(delta.content);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consumeLine(buffer.trim());
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  if (finishReason !== "stop") {
    const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const known = new Set(["length", "content_filter", "tool_calls", "error", "other"]);
    console.warn("[LISP_LAB_INCOMPLETE_RESPONSE]", JSON.stringify({ stage, finishReason: finishReason && known.has(finishReason) ? finishReason : "other", promptTokens: numberOrNull(usage.prompt_tokens), completionTokens: numberOrNull(usage.completion_tokens) }));
    throw new Error("incomplete_response");
  }
  let parsedPlan: LispPlan | undefined;
  if (stage === "layout") {
    try { parsedPlan = validateLispPlan(JSON.parse(output)) ?? undefined; } catch { parsedPlan = undefined; }
    if (!parsedPlan) throw new Error("invalid_layout");
  } else {
    const stageCheck = validateLispStageFragment(stage, output);
    if (!stageCheck.valid) throw new Error(stageCheck.reason);
  }
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return { output: stage === "layout" ? JSON.stringify(parsedPlan) : output.trim(), plan: parsedPlan, usage: { promptTokens: numberOrNull(usage.prompt_tokens), completionTokens: numberOrNull(usage.completion_tokens), costUsd: numberOrNull(usage.cost) } };
}
