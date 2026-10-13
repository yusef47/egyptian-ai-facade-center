import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("../../lib/architect/concept-board", () => ({ isConceptBoardAvailable: vi.fn(() => true) }));
vi.mock("../../lib/architect/lisp-lab", () => ({
  LISP_LAB_LIMITS: { brief: 2000, source: 80000 },
  LISP_GENERATION_STAGES: ["layout", "helpers", "shell", "interior"],
  assembleAutoLispStages: vi.fn(() => ({ valid: true, source: "(defun c:QATTANPLAN ())\n" })),
  streamAutoLispStage: vi.fn(),
  validateLispPlan: vi.fn((value) => value ?? null),
  validateCompletedAutoLisp: vi.fn((source) => ({ valid: true, source: `${source.trim()}\n` })),
}));

import { maxDuration, POST } from "../../app/api/architect/lisp-lab/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { assembleAutoLispStages, streamAutoLispStage } from "../../lib/architect/lisp-lab";
import { resetRequestGuards } from "../../lib/request-guards";

const makeRequest = (brief = "plan", origin = "http://localhost:3000") => new Request("http://localhost/api/architect/lisp-lab", {
  method: "POST", headers: { Origin: origin, Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ brief }),
});

beforeEach(() => {
  vi.clearAllMocks(); resetRequestGuards();
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
  vi.mocked(streamAutoLispStage).mockImplementation(async ({ stage, onDelta }) => {
    const output = stage === "layout" ? JSON.stringify({ siteMm: [20_000, 20_000], walls: [], openings: [], rooms: [], stair: {} }) : "(defun q:test () (princ))";
    onDelta(output);
    return { output, plan: stage === "layout" ? { siteMm: [20_000, 20_000], walls: [], openings: [], rooms: [], stair: {} } as never : undefined, usage: { promptTokens: 20, completionTokens: 50, costUsd: 0.001 } };
  });
});

describe("AutoLISP route", () => {
  it("allows browser-orchestrated stages within the Hobby fluid runtime", () => {
    expect(maxDuration).toBe(300);
  });

  it("uses admin and same-origin gates before generating", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(makeRequest())).status).toBe(404);
    expect(streamAutoLispStage).not.toHaveBeenCalled();
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
    expect((await POST(makeRequest("plan", "https://evil.example"))).status).toBe(403);
    expect(streamAutoLispStage).not.toHaveBeenCalled();
  });

  it("streams staged deltas and completion metadata after gates", async () => {
    const request = new Request("http://localhost/api/architect/lisp-lab", { method: "POST", headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ brief: "20 m two-apartment plan", stage: "helpers" , plan: { siteMm: [20_000, 20_000], walls: [], openings: [], rooms: [], stair: {} } }) });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const streamText = await response.text();
    expect(streamText).toContain("event: delta");
    expect(streamText).toContain("event: complete");
    expect(streamAutoLispStage).toHaveBeenCalledTimes(1);
  });

  it("supports ordered browser continuation with the locked plan and prior code", async () => {
    const plan = { siteMm: [20_000, 20_000], walls: [], openings: [], rooms: [], stair: {} };
    const stages = ["layout", "helpers", "shell", "interior"] as const;
    let priorSource = "";
    for (const stage of stages) {
      const request = new Request("http://localhost/api/architect/lisp-lab", { method: "POST", headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ brief: "20 m plan", stage, plan: stage === "layout" ? undefined : plan, priorSource }) });
      const response = await POST(request);
      expect(response.status).toBe(200);
      expect((await response.text())).toContain("event: complete");
      if (stage !== "layout") priorSource += `${stage}-module\n`;
    }
    const calls = vi.mocked(streamAutoLispStage).mock.calls;
    expect(calls.map(([args]) => args.stage)).toEqual(stages);
    expect(calls[2][0]).toMatchObject({ plan, priorSource: "helpers-module\n" });
    expect(calls[3][0].priorSource).toBe("helpers-module\nshell-module\n");
  });

  it("rejects oversized briefs before model generation", async () => {
    expect((await POST(makeRequest("x".repeat(2001)))).status).toBe(400);
    expect(streamAutoLispStage).not.toHaveBeenCalled();
  });

  it("validates the assembled file in the finalize stage without a model call", async () => {
    const request = new Request("http://localhost/api/architect/lisp-lab", { method: "POST", headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ brief: "plan", stage: "finalize", plan: { siteMm: [20_000, 20_000] }, parts: ["(defun q:layer () (princ))"] }) });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ verified: false, executed: false, source: expect.stringContaining("c:QATTANPLAN") });
    expect(assembleAutoLispStages).toHaveBeenCalledOnce();
    expect(streamAutoLispStage).not.toHaveBeenCalled();
  });
});
