import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ARCHITECT_ASSISTANT_BUSY_BILINGUAL,
  ARCHITECT_INTERPRETER,
  ARCHITECT_INVALID_OUTPUT_BILINGUAL,
  ARCHITECT_INTERPRETER_SYSTEM_PROMPT,
  ARCHITECT_TEXT_MODEL_ENV_NAME,
  ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
  boundHistory,
  buildInterpretRequest,
  executeInterpretation,
  extractChatText,
  isArchitectInterpreterAvailable,
  parseArchitectInterpretation,
  resolveArchitectTextModel,
  type ChatTurn,
  type InterpretInput,
} from "../lib/architect-interpreter";
import { OPENROUTER_MODEL } from "../lib/openrouter-engine";
import { BRIEF_PATCH_VERSION } from "../lib/architect/brief-patch";
import { compileConceptProposal } from "../lib/architect/concept-proposal";
import { compileDesignProposal } from "../lib/architect/building-proposal";
import { sampleBuildingProposal } from "./architect/building-fixture";
import { sampleBuildingStructure } from "./architect/structure-fixture";
import { readFileSync } from "node:fs";

const BRIEF = {
  siteWidth: 12,
  siteDepth: 20,
  unitBSharePercent: 50,
  coreSide: "east",
} as const;

const INPUT: InterpretInput = { message: "Make it 15 m wide", brief: BRIEF };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function chatResponse(content: unknown): Response {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    { status: 200 },
  );
}

describe("resolveArchitectTextModel", () => {
  it("returns the configured dedicated text model", () => {
    expect(resolveArchitectTextModel({ [ARCHITECT_TEXT_MODEL_ENV_NAME]: " google/gemini-2.5-flash " })).toBe(
      "google/gemini-2.5-flash",
    );
  });

  it("returns null when unset, empty, or pointing at the image model", () => {
    expect(resolveArchitectTextModel({})).toBeNull();
    expect(resolveArchitectTextModel({ [ARCHITECT_TEXT_MODEL_ENV_NAME]: "   " })).toBeNull();
    // Never reuse the image model as the text model.
    expect(resolveArchitectTextModel({ [ARCHITECT_TEXT_MODEL_ENV_NAME]: OPENROUTER_MODEL })).toBeNull();
    expect(resolveArchitectTextModel({ [ARCHITECT_TEXT_MODEL_ENV_NAME]: "google/gemini-2.5-flash-image" })).toBeNull();
  });
});

describe("isArchitectInterpreterAvailable", () => {
  it("requires both a usable text model and a nonempty API key", () => {
    const configured = {
      [ARCHITECT_TEXT_MODEL_ENV_NAME]: "google/gemini-2.5-flash",
      OPENROUTER_API_KEY: " sk-test ",
    };
    expect(isArchitectInterpreterAvailable(configured)).toBe(true);
    expect(isArchitectInterpreterAvailable({ ...configured, OPENROUTER_API_KEY: " " })).toBe(false);
    expect(isArchitectInterpreterAvailable({ OPENROUTER_API_KEY: "sk-test" })).toBe(false);
    expect(isArchitectInterpreterAvailable({ ...configured, [ARCHITECT_TEXT_MODEL_ENV_NAME]: OPENROUTER_MODEL })).toBe(false);
  });
});

describe("system prompt", () => {
  it("covers exactly the supported fields with their bounds", () => {
    for (const field of ["siteWidth", "siteDepth", "unitBSharePercent", "coreSide"]) {
      expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toContain(field);
    }
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toContain("20..80");
  });

  it("gives the model a patch example accepted by the real parser", () => {
    const example = ARCHITECT_INTERPRETER_SYSTEM_PROMPT.match(/^\{"type":"patch".*\}$/m)?.[0];
    expect(example).toBeDefined();
    expect(parseArchitectInterpretation(example)).toEqual({
      type: "patch",
      patch: { version: BRIEF_PATCH_VERSION, siteWidth: 15 },
      reply: "short confirmation of what changed",
    });
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toContain('Every "patch" MUST contain "version": 1');
  });

  it("supports proposed space polygons while naming requests still outside scope", () => {
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/space polygons/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/multi-floor plan/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/more than five floors/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/setbacks/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/structural design/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/Egyptian building-code/i);
  });

  it("keeps structural coordination distinct from engineering approval", () => {
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/never produce final wall geometry, SVG, DXF, structural analysis, code compliance/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toContain('"status":"coordination-only"');
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).toMatch(/foundation sizing, reinforcement, seismic\/wind verification/i);
    expect(ARCHITECT_INTERPRETER_SYSTEM_PROMPT).not.toMatch(/OPENROUTER|Bearer|api.?key/i);
  });
});

describe("parseArchitectInterpretation", () => {
  it("accepts a real reset and rejects a clarification that pretends to reset", () => {
    expect(parseArchitectInterpretation('{"type":"reset","reply":"بدأنا من جديد"}')).toEqual({ type: "reset", reply: "بدأنا من جديد" });
    expect(parseArchitectInterpretation('{"type":"reset","patch":{"version":1,"siteWidth":10},"reply":"done"}')).toBeNull();
  });

  it("expands a new three-floor project on the patched site", () => {
    const saved = JSON.parse(readFileSync("examples/architect-two-floor-demo.json", "utf8"));
    const typicalFloor = saved.conceptProposal.floors[0].plan;
    const outcome = parseArchitectInterpretation(JSON.stringify({
      type: "project", patch: { version: 1, siteWidth: 12, siteDepth: 20 },
      floorCount: 3, coreCellId: saved.conceptProposal.coreCellId, typicalFloor,
      reply: "Proposed three floors.",
    }));
    expect(outcome?.type).toBe("project");
    if (outcome?.type === "project") {
      expect(compileDesignProposal(outcome.proposal).ok).toBe(true);
    }
  });
  it("accepts a free concept proposal only through the bounded schema", () => {
    const example = ARCHITECT_INTERPRETER_SYSTEM_PROMPT.match(/^\{"type":"concept".*\}$/m)?.[0];
    expect(example).toBeDefined();
    const parsed = parseArchitectInterpretation(example!);
    expect(parsed?.type).toBe("concept");
    if (parsed?.type === "concept") expect(compileConceptProposal(parsed.proposal).ok).toBe(true);
    expect(parseArchitectInterpretation(JSON.stringify({
      type: "concept", reply: "done", proposal: { version: 1, site: [], cells: [], doors: [] },
    }))).toBeNull();
    expect(parseArchitectInterpretation(JSON.stringify({
      type: "concept", reply: "done", proposal: parsed?.type === "concept" ? parsed.proposal : {},
      patch: { version: 1, siteWidth: 15 },
    }))).toBeNull();
  });
  it("accepts the multi-floor example through the same concept outcome", () => {
    const examples = ARCHITECT_INTERPRETER_SYSTEM_PROMPT.match(/^\{"type":"concept".*\}$/gm) ?? [];
    expect(examples).toHaveLength(2);
    const outcome = parseArchitectInterpretation(examples[1]!);
    expect(outcome?.type).toBe("concept");
    if (outcome?.type === "concept") expect(compileDesignProposal(outcome.proposal).ok).toBe(true);
  });
  it("retains a valid coordination grid in a building concept and rejects an unsafe status", () => {
    const proposal = { ...sampleBuildingProposal(), structure: sampleBuildingStructure() };
    const result = parseArchitectInterpretation(JSON.stringify({ type: "concept", reply: "Sketch updated.", proposal }));
    expect(result?.type).toBe("concept");
    if (result?.type === "concept") {
      expect(compileDesignProposal(result.proposal).ok).toBe(true);
    }
    expect(parseArchitectInterpretation(JSON.stringify({
      type: "concept", reply: "Approved.", proposal: { ...proposal, structure: { ...proposal.structure, status: "approved" } },
    }))).toBeNull();
  });
  it("accepts bounded room-program actions and rejects coordinate smuggling", () => {
    const outcome = parseArchitectInterpretation(JSON.stringify({
      type: "room_actions",
      actions: [{ op: "set", unit: "unit-a", roomId: "kitchen-1", preferredArea: 18 }],
      reply: "Proposed a larger kitchen.",
    }));
    expect(outcome?.type).toBe("room_actions");
    expect(parseArchitectInterpretation(JSON.stringify({
      type: "room_actions",
      actions: [{ op: "add", unit: "unit-a", kind: "bedroom", x: 2 }],
      reply: "Added.",
    }))).toBeNull();
  });
  it("accepts a valid multi-field patch", () => {
    const outcome = parseArchitectInterpretation(
      JSON.stringify({
        type: "patch",
        patch: { version: BRIEF_PATCH_VERSION, siteWidth: 15, coreSide: "west" },
        reply: "Width set to 15 m, core moved west.",
      }),
    );
    expect(outcome).toEqual({
      type: "patch",
      patch: { version: 1, siteWidth: 15, coreSide: "west" },
      reply: "Width set to 15 m, core moved west.",
    });
  });

  it("accepts a fenced JSON reply and clarify/unsupported outcomes", () => {
    expect(
      parseArchitectInterpretation('```json\n{"type":"clarify","reply":"How deep should the site be?"}\n```'),
    ).toEqual({ type: "clarify", reply: "How deep should the site be?" });
    expect(
      parseArchitectInterpretation(JSON.stringify({ type: "unsupported", reply: "Rooms are outside this slice." })),
    ).toEqual({ type: "unsupported", reply: "Rooms are outside this slice." });
  });

  it("rejects schema violations of every kind", () => {
    // Not JSON at all.
    expect(parseArchitectInterpretation("Sure, I widened it!")).toBeNull();
    // Unknown discriminator.
    expect(parseArchitectInterpretation(JSON.stringify({ type: "edit", reply: "x" }))).toBeNull();
    // Unknown top-level key.
    expect(
      parseArchitectInterpretation(JSON.stringify({ type: "clarify", reply: "x", geometry: {} })),
    ).toBeNull();
    // Patch with unknown field or bad bounds.
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "patch", patch: { version: 1, rooms: 4 }, reply: "x" }),
      ),
    ).toBeNull();
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "patch", patch: { version: 1, siteWidth: 900 }, reply: "x" }),
      ),
    ).toBeNull();
    // Numeric string instead of a real number.
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "patch", patch: { version: 1, siteWidth: "14" }, reply: "x" }),
      ),
    ).toBeNull();
    // Missing or wrong version.
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "patch", patch: { siteWidth: 14 }, reply: "x" }),
      ),
    ).toBeNull();
    // A patch smuggled onto a clarify outcome must never parse.
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "clarify", patch: { version: 1, siteWidth: 14 }, reply: "x" }),
      ),
    ).toBeNull();
    // Empty and oversized replies.
    expect(parseArchitectInterpretation(JSON.stringify({ type: "clarify", reply: "   " }))).toBeNull();
    expect(
      parseArchitectInterpretation(
        JSON.stringify({ type: "clarify", reply: "r".repeat(ARCHITECT_INTERPRETER.MAX_REPLY_CHARS + 1) }),
      ),
    ).toBeNull();
    // Oversized raw response.
    expect(
      parseArchitectInterpretation(
        "x".repeat(ARCHITECT_INTERPRETER.MAX_RESPONSE_CHARS + 1),
      ),
    ).toBeNull();
  });
});

describe("extractChatText and boundHistory", () => {
  it("reads only choices[0].message.content and rejects other shapes", () => {
    expect(extractChatText({ choices: [{ message: { content: "hi" } }] })).toBe("hi");
    expect(extractChatText({ choices: [] })).toBeNull();
    expect(extractChatText({ choices: [{ message: { content: 42 } }] })).toBeNull();
    expect(extractChatText(null)).toBeNull();
    expect(extractChatText("text")).toBeNull();
  });

  it("bounds history turns and per-turn length, dropping malformed entries", () => {
    const history: ChatTurn[] = [
      ...Array.from({ length: 10 }, (_, index) => ({ role: "user" as const, content: `turn ${index}` })),
      { role: "tool" as never, content: "bad" },
      { role: "assistant", content: "x".repeat(1_000) },
    ];
    const bounded = boundHistory(history);
    expect(bounded.length).toBeLessThanOrEqual(ARCHITECT_INTERPRETER.MAX_HISTORY_TURNS);
    expect(bounded.every((turn) => turn.content.length <= ARCHITECT_INTERPRETER.MAX_HISTORY_TURN_CHARS)).toBe(true);
    expect(bounded.some((turn) => (turn.role as string) === "tool")).toBe(false);
    expect(boundHistory(undefined)).toEqual([]);
  });
});

describe("buildInterpretRequest", () => {
  it("uses the dedicated text model and keeps the API key out of the body", () => {
    const request = buildInterpretRequest(INPUT, { model: "google/gemini-2.5-flash", apiKey: "sk-secret" });
    const body = JSON.parse(String(request.init.body)) as { model: string; messages: unknown[] };
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(JSON.stringify(body)).not.toContain("sk-secret");
    const headers = request.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-secret");
    // Current brief is the model's source of truth.
    expect(JSON.stringify(body.messages)).toContain("siteWidth");
  });

  it("bounds the message and the carried history", () => {
    const request = buildInterpretRequest(
      {
        message: "m".repeat(10_000),
        brief: BRIEF,
        history: Array.from({ length: 40 }, (_, index) => ({
          role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
          content: `c${index} `.repeat(200),
        })),
      },
      { model: "text-model", apiKey: "key" },
    );
    const body = JSON.parse(String(request.init.body)) as { messages: { role: string; content: string }[] };
    const userContent = body.messages[1]?.content ?? "";
    expect(userContent.length).toBeLessThan(30_000);
    // Only the most recent turns survive; older ones are dropped.
    expect(userContent).toContain("c39");
    expect(userContent).not.toContain("c33");
  });
});

describe("executeInterpretation", () => {
  it("reports unavailable when no text model is configured", async () => {
    vi.stubEnv(ARCHITECT_TEXT_MODEL_ENV_NAME, "");
    const result = await executeInterpretation(INPUT, { fetchFn: vi.fn() as unknown as typeof fetch });
    expect(result).toEqual({
      ok: false,
      status: 503,
      message: ARCHITECT_TEXT_MODEL_UNAVAILABLE_BILINGUAL,
    });
  });

  it("returns a parsed patch outcome for a valid upstream reply", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      chatResponse(
        JSON.stringify({
          type: "patch",
          patch: { version: 1, siteDepth: 24, unitBSharePercent: 60 },
          reply: "Depth and share updated.",
        }),
      ),
    ) as unknown as typeof fetch;
    const result = await executeInterpretation(INPUT, { model: "text-model", apiKey: "k", fetchFn });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outcome).toEqual({
        type: "patch",
        patch: { version: 1, siteDepth: 24, unitBSharePercent: 60 },
        reply: "Depth and share updated.",
      });
    }
  });

  it("never returns an invalid model response as an outcome", async () => {
    const cases = [
      "not json at all",
      JSON.stringify({ type: "patch", patch: { version: 1, rooms: 3 }, reply: "ok" }),
      JSON.stringify({ type: "clarify", reply: "x", extra: true }),
    ];
    for (const content of cases) {
      const result = await executeInterpretation(INPUT, {
        model: "text-model",
        apiKey: "k",
        fetchFn: vi.fn().mockResolvedValue(chatResponse(content)) as unknown as typeof fetch,
      });
      expect(result).toEqual({ ok: false, status: 502, message: ARCHITECT_INVALID_OUTPUT_BILINGUAL });
    }
  });

  it("maps upstream failures, non-OK statuses, and fetch throws to a refundable failure", async () => {
    const upstream = await executeInterpretation(INPUT, {
      model: "text-model",
      apiKey: "k",
      fetchFn: vi.fn().mockResolvedValue(new Response("busy", { status: 503 })) as unknown as typeof fetch,
    });
    expect(upstream.ok).toBe(false);

    const thrown = await executeInterpretation(INPUT, {
      model: "text-model",
      apiKey: "k",
      fetchFn: vi.fn().mockRejectedValue(new Error("timeout")) as unknown as typeof fetch,
    });
    expect(thrown.ok).toBe(false);
    if (!thrown.ok) expect(thrown.status).toBeGreaterThanOrEqual(500);
  });

  it("rejects an oversized upstream body", async () => {
    const huge = JSON.stringify({
      choices: [{ message: { content: "z".repeat(ARCHITECT_INTERPRETER.MAX_RESPONSE_CHARS * 4) } }],
    });
    const result = await executeInterpretation(INPUT, {
      model: "text-model",
      apiKey: "k",
      fetchFn: vi.fn().mockResolvedValue(new Response(huge, { status: 200 })) as unknown as typeof fetch,
    });
    expect(result).toEqual({ ok: false, status: 502, message: ARCHITECT_ASSISTANT_BUSY_BILINGUAL });
  });
});
