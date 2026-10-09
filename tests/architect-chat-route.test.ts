import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/admin.js", () => ({
  authorizeArchitectPilot: vi.fn(),
  isArchitectPilotUser: vi.fn(),
}));

vi.mock("../lib/credits.js", () => ({
  AUTH_REQUIRED_BILINGUAL: "AUTH_REQUIRED",
  CREDITS_EXHAUSTED_BILINGUAL: "CREDITS_EXHAUSTED",
  deductGenerationCredit: vi.fn(),
  getSupabaseAdminClient: vi.fn(),
  provisionProfileCredits: vi.fn(),
  readProfileCredits: vi.fn(),
  refreshDailyCredits: vi.fn(),
  refundGenerationCredit: vi.fn(),
  verifySupabaseUser: vi.fn(),
}));

// Keep the real engine module (the route reads ENGINE_BUSY_BILINGUAL from it)
// but spy on the image pipeline to prove the chat route never touches it.
vi.mock("../lib/openrouter-engine.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/openrouter-engine")>();
  return { ...actual, executeRestore: vi.fn() };
});

import { GET, POST } from "../app/api/architect/interpret/route";
import { authorizeArchitectPilot, isArchitectPilotUser } from "../lib/admin.js";
import * as credits from "../lib/credits.js";
import { executeRestore, OPENROUTER_MODEL } from "../lib/openrouter-engine.js";
import { ARCHITECT_TEXT_MODEL_ENV_NAME } from "../lib/architect-interpreter";
import { resetRequestGuards } from "../lib/request-guards";
import { sampleBuildingProposal } from "./architect/building-fixture";
import { sampleBuildingStructure } from "./architect/structure-fixture";

const adminClient = { from: vi.fn() } as unknown as ReturnType<
  NonNullable<(typeof credits)["getSupabaseAdminClient"]>
>;

const VALID_BRIEF = {
  siteWidth: 12,
  siteDepth: 20,
  unitBSharePercent: 50,
  coreSide: "east",
};

const VALID_CONCEPT = {
  version: 2,
  site: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 20 }],
  cells: [
    { id: "living", name: "Living", kind: "living", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 10 }] },
    { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 8, y: 10 }] },
  ],
  doors: [
    { from: "living", to: "outside", width: 1, at: 0.5 },
    { from: "living", to: "bedroom", width: 0.9, at: 0.5 },
  ],
  windows: [{ space: "bedroom", edgeIndex: 1, width: 1.5, at: 0.5 }],
};

function chatResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    { status: 200 },
  );
}

function postRequest(body: unknown, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost/api/architect/interpret", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Authorization: "Bearer token",
    },
    body: JSON.stringify(body),
  });
}

const VALID_PAYLOAD = {
  message: "Make the site 15 m wide and move the core west",
  brief: VALID_BRIEF,
  history: [
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
  ],
};

beforeEach(() => {
  resetRequestGuards();
  vi.stubEnv(ARCHITECT_TEXT_MODEL_ENV_NAME, "google/gemini-2.5-flash");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-test-key");
  vi.mocked(credits.verifySupabaseUser).mockResolvedValue("user-1");
  vi.mocked(credits.getSupabaseAdminClient).mockReturnValue(adminClient);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "user-1" });
  vi.mocked(isArchitectPilotUser).mockResolvedValue(true);
  vi.mocked(credits.refreshDailyCredits).mockResolvedValue(10);
  vi.mocked(credits.provisionProfileCredits).mockResolvedValue(10);
  vi.mocked(credits.readProfileCredits).mockResolvedValue(9);
  vi.mocked(credits.deductGenerationCredit).mockResolvedValue({ ok: true, remaining: 9 });
  vi.mocked(credits.refundGenerationCredit).mockResolvedValue({ ok: true, remaining: 10 });
  vi.mocked(executeRestore).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/architect/interpret", () => {
  it("does not reveal the assistant to a non-admin", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    const response = await GET(new Request("http://localhost/api/architect/interpret"));
    expect(response.status).toBe(404);
  });

  it("reports the text-model availability and message cost", async () => {
    const response = await GET(new Request("http://localhost/api/architect/interpret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ available: true, cost: 1 });
  });

  it("reports unavailable when the text model is not configured", async () => {
    vi.stubEnv(ARCHITECT_TEXT_MODEL_ENV_NAME, "");
    const response = await GET(new Request("http://localhost/api/architect/interpret"));
    expect(await response.json()).toEqual({ available: false, cost: 1 });
  });

  it("reports unavailable when the API key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", " ");
    const response = await GET(new Request("http://localhost/api/architect/interpret"));
    expect(await response.json()).toEqual({ available: false, cost: 1 });
  });
});

describe("POST /api/architect/interpret guards", () => {
  it("returns 404 and spends no credit for a non-admin", async () => {
    vi.mocked(isArchitectPilotUser).mockResolvedValue(false);
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(404);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("rejects a foreign origin with 403 before anything else", async () => {
    const response = await POST(postRequest(VALID_PAYLOAD, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(credits.verifySupabaseUser).not.toHaveBeenCalled();
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated callers with 401 and charges nothing", async () => {
    vi.mocked(credits.verifySupabaseUser).mockResolvedValue(null);
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(401);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("rejects an empty or oversized message with 400 before any deduction", async () => {
    const empty = await POST(postRequest({ ...VALID_PAYLOAD, message: "   " }));
    expect(empty.status).toBe(400);
    const huge = await POST(postRequest({ ...VALID_PAYLOAD, message: "x".repeat(1_600) }));
    expect(huge.status).toBe(400);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("rejects an infeasible brief payload with 400", async () => {
    const response = await POST(
      postRequest({ ...VALID_PAYLOAD, brief: { ...VALID_BRIEF, siteWidth: 3 } }),
    );
    expect(response.status).toBe(400);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("returns an honest unavailable state (503) without deducting when the model is missing", async () => {
    vi.stubEnv(ARCHITECT_TEXT_MODEL_ENV_NAME, "");
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(503);
    const body = (await response.json()) as { code?: string; available?: boolean; error: string };
    expect(body.code).toBe("TEXT_MODEL_UNAVAILABLE");
    expect(body.available).toBe(false);
    expect(body.error).toMatch(/not configured/i);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("does not deduct or call the model when the API key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", " ");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(503);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rate-limits the chat route after 15 requests per minute", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () =>
        chatResponse(JSON.stringify({ type: "clarify", reply: "How deep?" })),
      ),
    );
    const statuses: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      statuses.push((await POST(postRequest(VALID_PAYLOAD))).status);
    }
    expect(statuses.slice(0, 15).every((status) => status === 200)).toBe(true);
    expect(statuses[15]).toBe(429);
  });
});

describe("POST /api/architect/interpret outcomes", () => {
  it("accepts a new free concept only after server compilation, then carries it as edit context", async () => {
    const upstream = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => chatResponse(JSON.stringify({
      type: "concept", proposal: VALID_CONCEPT, reply: "Proposed a new plan.",
    })));
    vi.stubGlobal("fetch", upstream);
    const first = await POST(postRequest({ ...VALID_PAYLOAD, message: "Design a different plan" }));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { outcome: { type: string; proposal: unknown } };
    expect(firstBody.outcome.type).toBe("concept");
    expect(firstBody.outcome.proposal).toEqual(VALID_CONCEPT);
    expect(credits.refundGenerationCredit).not.toHaveBeenCalled();

    const second = await POST(postRequest({ ...VALID_PAYLOAD, message: "Move the bedroom", conceptProposal: VALID_CONCEPT }));
    expect(second.status).toBe(200);
    const sent = upstream.mock.calls.at(-1)?.[1]?.body;
    expect(String(sent)).toContain("CURRENT CONCEPT PROPOSAL");
    expect(String(sent)).toContain("bedroom");
  });

  it("accepts a multi-floor building with aligned vertical access and sends it back as edit context", async () => {
    const building = sampleBuildingProposal();
    const upstream = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => chatResponse(JSON.stringify({
      type: "concept", proposal: building, reply: "Proposed two floors.",
    })));
    vi.stubGlobal("fetch", upstream);
    const first = await POST(postRequest({ ...VALID_PAYLOAD, message: "Design two floors" }));
    expect(first.status).toBe(200);
    const firstBody = await first.json() as { outcome: { proposal: unknown } };
    expect(firstBody.outcome.proposal).toEqual(building);
    const next = await POST(postRequest({ ...VALID_PAYLOAD, message: "Review the first floor", conceptProposal: building }));
    expect(next.status).toBe(200);
    const sent = JSON.parse(String(upstream.mock.calls.at(-1)?.[1]?.body)) as { messages: Array<{ content: string }> };
    expect(sent.messages.at(-1)?.content).toContain('"coreCellId":"core"');
  });

  it("refunds a multi-floor proposal with a broken vertical core", async () => {
    const building = sampleBuildingProposal();
    building.floors[1]!.plan.cells[0]!.points[1]!.x = 2;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: building, reply: "Proposed two floors.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("CONCEPT_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("refunds a proposed structural beam that crosses a lower-floor window", async () => {
    const building = { ...sampleBuildingProposal(), structure: sampleBuildingStructure() };
    building.floors[0]!.plan.windows![0]!.edgeIndex = 0;
    building.structure.columns[0]!.position.y = 1.5;
    building.structure.columns[1]!.position.y = 1.5;
    building.structure.beams[0]!.width = 3;
    building.structure.beams[0]!.depth = 1;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: building, reply: "Structure proposed.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("CONCEPT_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("does not silently replace an edited building with one floor", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: VALID_CONCEPT, reply: "Edited the plan.",
    }))));
    const response = await POST(postRequest({ ...VALID_PAYLOAD, conceptProposal: sampleBuildingProposal() }));
    expect(response.status).toBe(422);
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("rejects infeasible free geometry with a credit refund", async () => {
    const overlapping = structuredClone(VALID_CONCEPT);
    overlapping.cells[1]!.points = [{ x: 6, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 6, y: 10 }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: overlapping, reply: "Proposed a plan.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("CONCEPT_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("refunds a concept whose proposed window is on a shared wall", async () => {
    const invalid = { ...VALID_CONCEPT, windows: [{ space: "bedroom", edgeIndex: 3, width: 1.5, at: 0.5 }] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: invalid, reply: "Window added.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("CONCEPT_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("rejects a cut-away site despite matching width and depth", async () => {
    const cutAway = {
      ...VALID_CONCEPT,
      site: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 6, y: 20 }, { x: 6, y: 10 }, { x: 0, y: 10 }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "concept", proposal: cutAway, reply: "Proposed a plan.",
    }))));
    const generated = await POST(postRequest(VALID_PAYLOAD));
    expect(generated.status).toBe(422);
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);

    const submitted = await POST(postRequest({ ...VALID_PAYLOAD, conceptProposal: cutAway }));
    expect(submitted.status).toBe(400);
    expect(credits.deductGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed current concept before charging", async () => {
    const response = await POST(postRequest({ ...VALID_PAYLOAD, conceptProposal: { version: 1 } }));
    expect(response.status).toBe(400);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("rejects invalid mesh settings before charging", async () => {
    const response = await POST(postRequest({ ...VALID_PAYLOAD, wallMeshPreset: { slabThickness: -2 } }));
    expect(response.status).toBe(400);
    expect(credits.deductGenerationCredit).not.toHaveBeenCalled();
  });

  it("accepts a room action only after the server regenerates the room plan", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "room_actions",
      actions: [{ op: "set", unit: "unit-a", roomId: "living-1", preferredArea: 40 }],
      reply: "Proposed more living area.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(200);
    const body = await response.json() as { outcome: { type: string } };
    expect(body.outcome.type).toBe("room_actions");
    expect(credits.deductGenerationCredit).toHaveBeenCalledTimes(1);
    expect(credits.refundGenerationCredit).not.toHaveBeenCalled();
  });

  it("refunds an infeasible room addition and leaves the program untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "room_actions",
      actions: [{ op: "add", unit: "unit-a", kind: "bedroom" }],
      reply: "Proposed another bedroom.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("ROOM_ACTIONS_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("applies a multi-field patch: deducts once, never refunds, returns the patch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      chatResponse(
        JSON.stringify({
          type: "patch",
          patch: { version: 1, siteWidth: 15, coreSide: "west" },
          reply: "Widened to 15 m and moved the core west.",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      outcome: { type: string; patch?: { siteWidth?: number; coreSide?: string }; reply: string };
      creditsRemaining: number;
    };
    expect(body.ok).toBe(true);
    expect(body.outcome.type).toBe("patch");
    expect(body.outcome.patch).toEqual({ version: 1, siteWidth: 15, coreSide: "west" });
    expect(body.creditsRemaining).toBe(9);

    expect(credits.deductGenerationCredit).toHaveBeenCalledTimes(1);
    expect(credits.refundGenerationCredit).not.toHaveBeenCalled();

    // Isolation: the chat route drives the dedicated text model, never the
    // image model, and never the image pipeline.
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const bodyJson = JSON.parse(String(init.body)) as { model: string };
    expect(bodyJson.model).toBe("google/gemini-2.5-flash");
    expect(bodyJson.model).not.toBe(OPENROUTER_MODEL);
    expect(executeRestore).not.toHaveBeenCalled();
  });

  it("returns clarify and unsupported outcomes without a patch and charges the message", async () => {
    for (const type of ["clarify", "unsupported"] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          chatResponse(JSON.stringify({ type, reply: type === "clarify" ? "How deep?" : "Rooms are out of scope." })),
        ),
      );
      const response = await POST(postRequest(VALID_PAYLOAD));
      expect(response.status).toBe(200);
      const body = (await response.json()) as { outcome: { type: string; patch?: unknown } };
      expect(body.outcome.type).toBe(type);
      expect(body.outcome.patch).toBeUndefined();
    }
    expect(credits.refundGenerationCredit).not.toHaveBeenCalled();
  });

  it("refunds when the upstream model call fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("upstream boom", { status: 500 })));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(credits.deductGenerationCredit).toHaveBeenCalledTimes(1);
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
    const body = (await response.json()) as { creditsRemaining?: number };
    expect(body.creditsRemaining).toBe(10);
  });

  it("refunds when the model reply violates the schema (never applied)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(chatResponse("Sure! I drew you new walls at x=4.2, y=9.1")),
    );
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(502);
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
    expect(executeRestore).not.toHaveBeenCalled();
  });

  it("refunds a schema-valid patch that fails regeneration server-side", async () => {
    // siteWidth 3 is inside contract bounds but cannot hold core + unit.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        chatResponse(
          JSON.stringify({
            type: "patch",
            patch: { version: 1, siteWidth: 3 },
            reply: "Narrowed to 3 m.",
          }),
        ),
      ),
    );
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code?: string; error: string };
    expect(body.code).toBe("PATCH_INFEASIBLE");
    expect(body.error).toMatch(/not feasible on the current site/);
    expect(body.error).toMatch(/غير ممكن على الموقع الحالي/);
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("refunds a site edit that makes the existing room program infeasible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(chatResponse(JSON.stringify({
      type: "patch",
      patch: { version: 1, siteDepth: 17 },
      reply: "Proposed a shallower site.",
    }))));
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(422);
    expect((await response.json() as { code: string }).code).toBe("PATCH_INFEASIBLE");
    expect(credits.refundGenerationCredit).toHaveBeenCalledTimes(1);
  });

  it("does not simulate a model reply when the model is unavailable", async () => {
    vi.stubEnv(ARCHITECT_TEXT_MODEL_ENV_NAME, "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(postRequest(VALID_PAYLOAD));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    const body = (await response.json()) as { outcome?: unknown };
    expect(body.outcome).toBeUndefined();
  });
});
