import { extractChatText } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { CONCEPT_BOARD_MODELS } from "./concept-board";

export const LISP_LAB_LIMITS = { brief: 2_000, source: 80_000, responseBytes: 200_000, timeoutMs: 270_000, maxTokens: 20_000 } as const;

const SYSTEM_PROMPT = `Write one complete, self-contained AutoLISP file defining c:QATTANPLAN for a schematic 2D residential plan. Units are millimetres; state this in a short header comment. Use entmake. Keep source compact: define reusable helper functions for layers, lines, polylines, labels and dimensions, and call them with coordinate data instead of repeating entity-building code. Include the plot boundary, walls with real door/window gaps and symbols, labeled rooms, shared stair, and named layers for walls, doors, windows, stairs, furniture, labels and dimensions, plus overall dimensions. Design freely from the brief, no fixed template. Finish the entire command; use concise coordinates and labels. Warn that reruns may duplicate entities and a clean drawing is recommended. Return ONLY complete source, no Markdown. Never use command/eval, file or network access, shell/system, COM/ActiveX, reactors, autoload/startup hooks, persistence or external dependencies. Do not claim code compliance or structural validation.`;

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

export async function generateAutoLisp(brief: string, fetchFn: typeof fetch = fetch): Promise<{ source: string; model: string; usage: { promptTokens: number | null; completionTokens: number | null; costUsd: number | null } }> {
  const cleanBrief = brief.trim();
  if (!cleanBrief || cleanBrief.length > LISP_LAB_LIMITS.brief) throw new Error("invalid_brief");
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new Error("unavailable");
  const model = CONCEPT_BOARD_MODELS.text;
  let response: Response;
  try {
    response = await fetchFn(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://www.qattan-ai.com", "X-Title": "Qattan AutoLISP Pilot" },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: LISP_LAB_LIMITS.maxTokens, reasoning: { effort: "medium" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: cleanBrief }] }),
      signal: AbortSignal.timeout(LISP_LAB_LIMITS.timeoutMs), cache: "no-store",
    });
  } catch (error) {
    const category = error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request_failed";
    console.warn("[LISP_LAB_UPSTREAM_FAILED]", JSON.stringify({ category }));
    throw new Error("upstream_failed");
  }
  if (!response.ok) {
    console.warn("[LISP_LAB_UPSTREAM_FAILED]", JSON.stringify({ category: "http_error", status: response.status }));
    throw new Error("upstream_failed");
  }
  const raw = await response.text();
  if (raw.length > LISP_LAB_LIMITS.responseBytes) throw new Error("invalid_response");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("invalid_response"); }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
  if (choice?.finish_reason !== "stop") {
    const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
    const safeCount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
    const knownReasons = new Set(["length", "content_filter", "tool_calls", "error", "other"]);
    const rawReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : "other";
    console.warn("[LISP_LAB_INCOMPLETE_RESPONSE]", JSON.stringify({
      finishReason: knownReasons.has(rawReason) ? rawReason : "other",
      promptTokens: safeCount(usage.prompt_tokens),
      completionTokens: safeCount(usage.completion_tokens),
    }));
    throw new Error("incomplete_response");
  }
  const source = extractChatText(payload);
  if (!source) throw new Error("invalid_response");
  const checked = validateAutoLispSource(source);
  if (!checked.valid) throw new Error(`rejected_${checked.reason}`);
  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as Record<string, unknown> : {};
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
  return { source: checked.source, model, usage: { promptTokens: numberOrNull(usage.prompt_tokens), completionTokens: numberOrNull(usage.completion_tokens), costUsd: numberOrNull(usage.cost) } };
}
