import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateAutoLisp, validateAutoLispSource } from "../../lib/architect/lisp-lab";

const validLisp = `; millimetres
(defun c:QATTANPLAN (/)
  (entmake (list '(0 . "LINE") '(8 . "WALL") '(10 0.0 0.0) '(11 1000.0 0.0)))
  (princ)
)`;

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

  it("makes one bounded Sonnet call and reports provider usage without retry", async () => {
    const fetchFn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("anthropic/claude-sonnet-5.5");
      expect(body.reasoning).toEqual({ effort: "medium" });
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: validLisp } }], usage: { prompt_tokens: 900, completion_tokens: 500, cost: 0.0123 } }), { status: 200 });
    });
    await expect(generateAutoLisp("20 m plan", fetchFn as unknown as typeof fetch)).resolves.toMatchObject({
      model: "anthropic/claude-sonnet-5.5", source: expect.stringContaining("defun c:QATTANPLAN"),
      usage: { promptTokens: 900, completionTokens: 500, costUsd: 0.0123 },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("fails closed on unsafe model output without logging or retrying it", async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: `(defun c:QATTANPLAN () (open "secret" "w"))` } }] }), { status: 200 }));
    await expect(generateAutoLisp("plan", fetchFn as unknown as typeof fetch)).rejects.toThrow("rejected_unsafe_symbol");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
