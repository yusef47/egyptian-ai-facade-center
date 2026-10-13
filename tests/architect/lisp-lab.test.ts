import { beforeEach, describe, expect, it, vi } from "vitest";
import { assembleAutoLispStages, createLispStagePrompt, LISP_LAB_LIMITS, streamAutoLispStage, validateAutoLispSource, validateLispPlan } from "../../lib/architect/lisp-lab";

const validLisp = `; millimetres
(defun c:QATTANPLAN (/)
  (entmake (list '(0 . "LINE") '(8 . "WALL") '(10 0.0 0.0) '(11 1000.0 0.0)))
  (princ)
)`;

const validPlan = { siteMm: [20_000, 20_000], walls: [
  { id: "w1", start: [0, 0], end: [20_000, 0], role: "outer" },
  { id: "w2", start: [20_000, 0], end: [20_000, 20_000], role: "outer" },
  { id: "w3", start: [20_000, 20_000], end: [0, 20_000], role: "outer" },
  { id: "w4", start: [0, 20_000], end: [0, 0], role: "outer" },
], openings: [{ id: "d1", wallId: "w1", offsetMm: 500, widthMm: 900, kind: "DOOR" }], rooms: [
  { id: "r1", label: "Room A", bounds: [500, 500, 9_000, 9_000], kind: "living" },
  { id: "r2", label: "Room B", bounds: [10_000, 500, 19_500, 9_000], kind: "bedroom" },
], stair: { id: "st1", bounds: [9_000, 9_000, 11_000, 13_000] } };

function sseResponse(chunks: string[]): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }), { status: 200 });
}

describe("AutoLISP pilot contract", () => {
  beforeEach(() => { vi.stubEnv("OPENROUTER_API_KEY", "test-key"); });

  it("accepts a complete entry command and rejects unsafe/incomplete source", () => {
    expect(validateAutoLispSource(validLisp)).toMatchObject({ valid: true });
    expect(validateAutoLispSource("(defun c:QATTANPLAN () (entmake nil)")).toEqual({ valid: false, reason: "unbalanced" });
    expect(validateAutoLispSource("(defun c:QATTANPLAN () (startapp \"sh\"))")).toEqual({ valid: false, reason: "unsafe_symbol" });
    expect(validateAutoLispSource("(defun c:QATTANPLAN () (entmake nil) (s::startup))")).toEqual({ valid: false, reason: "unsafe_symbol" });
    expect(validateAutoLispSource(`(entmake nil)\n${validLisp}`)).toEqual({ valid: false, reason: "top_level_expression" });
    expect(validateAutoLispSource("```lisp\n${validLisp}\n```")).toEqual({ valid: false, reason: "fenced" });
    expect(validateAutoLispSource("(defun c:OTHER () (entmake nil))")).toEqual({ valid: false, reason: "missing_entrypoint" });
  });

  it("sets bounded per-stage and assembled-source budgets", () => {
    expect(LISP_LAB_LIMITS.timeoutMs).toBe(270_000);
    expect(LISP_LAB_LIMITS.maxTokens).toBe(20_000);
    expect(LISP_LAB_LIMITS.source).toBe(80_000);
    expect(LISP_LAB_LIMITS.responseBytes).toBe(200_000);
  });

  it("validates a shared layout manifest and rejects out-of-host openings", () => {
    expect(validateLispPlan(validPlan)).not.toBeNull();
    const invalid = structuredClone(validPlan);
    invalid.openings[0].offsetMm = 19_500;
    expect(validateLispPlan(invalid)).toBeNull();
    const overlapping = structuredClone(validPlan);
    overlapping.openings.push({ id: "d2", wallId: "w1", offsetMm: 700, widthMm: 800, kind: "WINDOW" });
    expect(validateLispPlan(overlapping)).toBeNull();
    const overlapRooms = structuredClone(validPlan);
    overlapRooms.rooms[1].bounds = [8_000, 500, 19_500, 9_000];
    expect(validateLispPlan(overlapRooms)).toBeNull();
  });

  it("carries the same locked manifest and earlier functions into later prompts", () => {
    const helperCode = "(defun q:layer () (princ))";
    const prompt = createLispStagePrompt("shell", "two apartments", validPlan as never, helperCode);
    expect(prompt).toContain(JSON.stringify(validPlan));
    expect(prompt).toContain("(defun q:layer ()");
    expect(prompt).not.toContain("(princ)");
    expect(prompt).toContain("Locked layout JSON (do not alter)");
  });

  it("assembles only three distinct stage modules with required entry calls", () => {
    const parts = [
      `(defun q:layer () (list "walls" "doors" "windows" "stairs" "furniture" "labels" "dimensions"))\n(defun q:line () (entmake nil))\n(defun q:rect () (princ))\n(defun q:text () (princ))\n(defun q:dim () (princ))`,
      `(defun q:draw-site () (q:line))\n(defun q:draw-walls () (q:line))\n(defun q:draw-openings () (q:line))\n(defun q:draw-stair () (q:rect))`,
      `(defun q:draw-rooms () (q:text))\n(defun q:draw-dimensions () (q:dim))\n(defun c:QATTANPLAN () (q:layer) (q:draw-site) (q:draw-walls) (q:draw-openings) (q:draw-stair) (q:draw-rooms) (q:draw-dimensions) (entmake nil))`,
    ];
    expect(assembleAutoLispStages(validPlan, parts)).toMatchObject({ valid: true, source: expect.stringContaining("c:QATTANPLAN") });
    expect(assembleAutoLispStages(validPlan, [parts[0], parts[1], `${parts[2]}\n${parts[0]}`])).toMatchObject({ valid: false, reason: "duplicate_function" });
    expect(assembleAutoLispStages(validPlan, parts.slice(0, 2))).toMatchObject({ valid: false, reason: "incomplete_stages" });
  });

  it("streams stage deltas, retains one manifest, and requires stop before accepting the stage", async () => {
    const source = "(defun q:layer (name color) (princ))\n(defun q:line (a b layer) (princ))";
    const frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: source.slice(0, 28) }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: source.slice(28) }, finish_reason: "stop" }] })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 600, completion_tokens: 100, cost: 0.01 } })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const deltas: string[] = [];
    const fetchFn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "anthropic/claude-sonnet-5.5", max_tokens: 20_000, stream: true, stream_options: { include_usage: true }, reasoning: { effort: "medium" } });
      return sseResponse(frames);
    });
    await expect(streamAutoLispStage({ stage: "helpers", brief: "plan", plan: validPlan as never, onDelta: (text) => deltas.push(text), fetchFn: fetchFn as unknown as typeof fetch })).resolves.toMatchObject({ output: source, usage: { promptTokens: 600, completionTokens: 100, costUsd: 0.01 } });
    expect(deltas.join("")).toBe(source);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("rejects a streamed length finish reason and does not accept partial code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchFn = vi.fn(async () => sseResponse([`data: ${JSON.stringify({ choices: [{ delta: { content: "(defun q:partial ()" }, finish_reason: "length" }], usage: { completion_tokens: 20_000 } })}\n\n`]));
    await expect(streamAutoLispStage({ stage: "helpers", brief: "plan", plan: validPlan as never, onDelta: () => undefined, fetchFn: fetchFn as unknown as typeof fetch })).rejects.toThrow("incomplete_response");
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[LISP_LAB_INCOMPLETE_RESPONSE]", expect.stringContaining('"finishReason":"length"'));
    warn.mockRestore();
  });

  it("surfaces provider stream errors without treating DONE as success", async () => {
    const fetchFn = vi.fn(async () => sseResponse([`data: ${JSON.stringify({ error: { message: "private provider details" } })}\n\n`, "data: [DONE]\n\n"]));
    await expect(streamAutoLispStage({ stage: "helpers", brief: "plan", plan: validPlan as never, onDelta: () => undefined, fetchFn: fetchFn as unknown as typeof fetch })).rejects.toThrow("upstream_stream_error");
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
