import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_ENGINEERING_BLOCK,
  ENGINEERING_VIEW_LABELS,
  MAX_OPERATIONS,
  buildEngineeringSolidPlan,
  defaultEngineeringDimensions,
  normalizeEngineeringGeometry,
  type EngineeringCut,
  type EngineeringGeometry,
} from "../lib/engineering-geometry";
import {
  ENGINEERING_ANALYSIS_FAILURE_BILINGUAL,
  ENGINEERING_ANALYSIS_MODEL,
  ENGINEERING_ANALYSIS_SYSTEM_PROMPT,
  ENGINEERING_EXTRACTION_FAILURE_BILINGUAL,
  analyzeEngineeringGeometry,
  balancedJsonCandidates,
  buildEngineeringAnalysisRequest,
  extractEngineeringGeometryPayload,
  extractMessageText,
} from "../lib/engineering-engine";
import { ENGINE_BUSY_BILINGUAL, OPENROUTER_MODEL } from "../lib/openrouter-engine";

/** The exact payload shape named in the launch brief. */
const BRIEF_EXAMPLE = {
  block: { width: 64, height: 50, depth: 40 },
  operations: [
    { type: "cut_top_notch", x: 34, width: 10, height: 20, depth: 40 },
    { type: "cut_bottom_tunnel", x: 24, width: 16, height: 20, depth: 40 },
    { type: "incline", axis: "left", fromY: 50, toY: 20, atX: 34 },
  ],
  dimensions: [{ label: "64", position: "bottom", view: "front" }],
};

const H_PROFILE: EngineeringGeometry = {
  block: { width: 64, height: 50, depth: 40 },
  operations: [
    { type: "notch_top", x: 24, width: 16, height: 20 },
    { type: "tunnel_bottom", x: 24, width: 16, height: 20 },
  ],
  dimensions: [],
};

/** Pulls standalone `{ … }` JSON blocks out of the prompt text. */
function promptJsonBlocks(text: string): unknown[] {
  const blocks: unknown[] = [];
  let start = -1;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (start < 0 && line === "{") start = index;
    else if (start >= 0 && line === "}") {
      const candidate = text.split("\n").slice(start, index + 1).join("\n");
      start = -1;
      try {
        blocks.push(JSON.parse(candidate) as unknown);
      } catch {
        /* Not a standalone JSON block (the annotated schema, for instance). */
      }
    }
  }
  return blocks;
}

function cutFor(geometry: EngineeringGeometry, index: number): EngineeringCut {
  const cut = buildEngineeringSolidPlan(geometry).cuts[index];
  expect(cut).toBeDefined();
  return cut as EngineeringCut;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Tool #9 — geometry normalisation (the AI's JSON contract)", () => {
  it("parses the launch-brief payload, aliases included", () => {
    const geometry = normalizeEngineeringGeometry(BRIEF_EXAMPLE);
    expect(geometry).not.toBeNull();
    expect(geometry?.block).toEqual({ width: 64, height: 50, depth: 40 });
    expect(geometry?.operations.map((op) => op.type)).toEqual([
      "notch_top",
      "tunnel_bottom",
      "incline",
    ]);
    expect(geometry?.dimensions[0]).toEqual({
      label: "64",
      position: "bottom",
      view: "front",
    });
  });

  it("rejects payloads with no usable bounding block", () => {
    expect(normalizeEngineeringGeometry(null)).toBeNull();
    expect(normalizeEngineeringGeometry("nope")).toBeNull();
    expect(normalizeEngineeringGeometry({ operations: [] })).toBeNull();
  });

  it("tolerates numeric strings, alternative keys and unknown operations", () => {
    const geometry = normalizeEngineeringGeometry({
      block: { w: "80", h: "60", d: "30" },
      operations: [
        { type: "TOP NOTCH", x: "10", width: "20", height: "15" },
        { type: "bottom-channel", x: 10, width: 20, height: 12 },
        { type: "laser_cut", x: 1 },
        { type: { nested: true } },
      ],
    });
    expect(geometry?.block).toEqual({ width: 80, height: 60, depth: 30 });
    expect(geometry?.operations.map((op) => op.type)).toEqual(["notch_top", "tunnel_bottom"]);
    expect(geometry?.operations[0].x).toBe(10);
    expect(geometry?.operations[0].width).toBe(20);
  });

  it("substitutes the safe fallback extents when block dimensions are missing or null", () => {
    const geometry = normalizeEngineeringGeometry({
      block: { width: null, height: null, depth: null },
      operations: [{ type: "notch_top", x: 10, width: 8, height: 6 }],
    });
    expect(geometry?.block).toEqual(DEFAULT_ENGINEERING_BLOCK);
    // ...and it says so, instead of passing defaults off as measured values.
    expect(geometry?.estimated).toBe(true);
    expect(geometry?.operations).toHaveLength(1);
  });

  it("falls back to the default extents when only operations were returned", () => {
    const geometry = normalizeEngineeringGeometry({
      operations: [{ type: "tunnel_bottom", x: 0, width: 10, height: 8 }],
    });
    expect(geometry?.block).toEqual(DEFAULT_ENGINEERING_BLOCK);
    expect(geometry?.estimated).toBe(true);
  });

  it("still refuses a payload with no geometry signal at all", () => {
    expect(normalizeEngineeringGeometry({})).toBeNull();
    expect(normalizeEngineeringGeometry({ notes: "could not read" })).toBeNull();
    expect(normalizeEngineeringGeometry({ operations: [] })).toBeNull();
  });

  it("does not mark a drawing with real dimensions as estimated", () => {
    const geometry = normalizeEngineeringGeometry(BRIEF_EXAMPLE);
    expect(geometry?.estimated).toBeUndefined();
  });

  it("caps the operation list so CSG stays bounded", () => {
    const geometry = normalizeEngineeringGeometry({
      block: { width: 10, height: 10, depth: 10 },
      operations: Array.from({ length: MAX_OPERATIONS + 6 }, () => ({
        type: "notch_top",
        x: 0,
        width: 1,
        height: 1,
      })),
    });
    expect(geometry?.operations).toHaveLength(MAX_OPERATIONS);
  });

  it("derives block extents when the analyzer only supplies one dimension", () => {
    const geometry = normalizeEngineeringGeometry({ block: { width: 40 }, operations: [] });
    expect(geometry?.block.width).toBe(40);
    expect(geometry?.block.height).toBeGreaterThan(0);
    expect(geometry?.block.depth).toBeGreaterThan(0);
  });

  it("provides overall dimensions when none were extracted from the drawing", () => {
    expect(defaultEngineeringDimensions({ width: 64, height: 50, depth: 40 })).toEqual([
      { label: "64", position: "bottom", view: "front" },
      { label: "50", position: "left", view: "front" },
      { label: "40", position: "bottom", view: "top" },
    ]);
  });

  it("labels all four board panels bilingually", () => {
    expect(ENGINEERING_VIEW_LABELS.front.en).toBe("FRONT ELEVATION");
    expect(ENGINEERING_VIEW_LABELS.side.en).toBe("SIDE VIEW");
    expect(ENGINEERING_VIEW_LABELS.top.en).toBe("TOP PLAN");
    expect(ENGINEERING_VIEW_LABELS.isometric.en).toBe("ISOMETRIC PROJECTION");
    for (const label of Object.values(ENGINEERING_VIEW_LABELS)) {
      expect(label.ar).toMatch(/[\u0600-\u06FF]/);
    }
  });
});

describe("Tool #9 — CSG solid compilation", () => {
  it("starts from the plain block when the drawing shows no cuts", () => {
    const plan = buildEngineeringSolidPlan({
      block: { width: 64, height: 50, depth: 40 },
      operations: [],
      dimensions: [],
    });
    expect(plan.cuts).toHaveLength(0);
    expect(plan.block).toEqual({ width: 64, height: 50, depth: 40 });
  });

  it("cuts the top notch down from the top face and lets it over-run the top", () => {
    const cut = cutFor(H_PROFILE, 0);
    expect(cut.kind).toBe("box");
    if (cut.kind !== "box") return;
    // Removed material must reach above the block's top face (+25) so CSG has
    // no coplanar faces to fight with.
    expect(cut.center[1] + cut.size[1] / 2).toBeGreaterThan(25);
    // ...and its bottom edge sits 20 below the top face (y = 50 - 20 = 30 -> Y = 5).
    expect(cut.center[1] - cut.size[1] / 2).toBeCloseTo(5, 5);
    // A through cut spans the whole depth (40) plus over-run.
    expect(cut.size[2]).toBeGreaterThan(40);
  });

  it("cuts the bottom tunnel up from the bottom face, through the full depth", () => {
    const cut = cutFor(H_PROFILE, 1);
    expect(cut.kind).toBe("box");
    if (cut.kind !== "box") return;
    expect(cut.center[1] - cut.size[1] / 2).toBeLessThan(-25);
    expect(cut.center[1] + cut.size[1] / 2).toBeCloseTo(-5, 5);
    expect(cut.size[2]).toBeGreaterThan(40);
    // H-profile: the notch and the tunnel share the same x span.
    const notch = cutFor(H_PROFILE, 0);
    if (notch.kind !== "box") return;
    expect(cut.center[0]).toBeCloseTo(notch.center[0], 5);
    expect(cut.size[0]).toBeCloseTo(notch.size[0], 5);
  });

  it("keeps an explicitly shallow pocket inside the part instead of cutting through", () => {
    const cut = cutFor(
      {
        block: { width: 64, height: 50, depth: 40 },
        operations: [{ type: "notch_top", x: 10, width: 8, height: 6, depth: 10 }],
        dimensions: [],
      },
      0,
    );
    if (cut.kind !== "box") return;
    expect(cut.size[2]).toBeCloseTo(10, 5);
    expect(cut.size[2]).toBeLessThan(40);
  });

  it("turns an incline into a rotated half-space cut", () => {
    const geometry = normalizeEngineeringGeometry(BRIEF_EXAMPLE) as EngineeringGeometry;
    const cut = cutFor(geometry, 2);
    expect(cut.kind).toBe("box");
    if (cut.kind !== "box") return;
    expect(cut.rotationZ).toBeDefined();
    // Descending left-to-right from (34, 50) to (64, 20): negative slope.
    expect(cut.rotationZ as number).toBeLessThan(0);
    // The cutter reaches well outside the block so the whole roof is removed.
    expect(cut.size[0]).toBeGreaterThan(64);
    expect(cut.size[2]).toBeGreaterThan(40);
  });

  it("accepts an explicit endX for the incline's far edge", () => {
    const cut = cutFor(
      {
        block: { width: 64, height: 50, depth: 40 },
        operations: [{ type: "incline", axis: "x", fromY: 50, toY: 0, atX: 34, endX: 0 }],
        dimensions: [],
      },
      0,
    );
    if (cut.kind !== "box") return;
    // Plane from (34, 50) to (0, 0) — the worked example in the analyzer prompt.
    expect(cut.rotationZ).toBeCloseTo(Math.atan2(0 - 50, 0 - 34), 5);
  });

  it("defaults the incline's far edge to the block edge it faces", () => {
    const cut = cutFor(
      {
        block: { width: 64, height: 50, depth: 40 },
        operations: [{ type: "incline", axis: "left", atX: 34, fromY: 50, toY: 20 }],
        dimensions: [],
      },
      0,
    );
    if (cut.kind !== "box") return;
    // (34, 50) -> (64, 20): a 45-degree descending roof.
    expect(cut.rotationZ).toBeCloseTo(-Math.PI / 4, 5);
  });

  it("models a chamfer as a 45-degree corner cut", () => {
    const cut = cutFor(
      {
        block: { width: 40, height: 30, depth: 20 },
        operations: [{ type: "chamfer", axis: "left", width: 5 }],
        dimensions: [],
      },
      0,
    );
    if (cut.kind !== "box") return;
    expect(cut.rotationZ).toBeCloseTo(Math.PI / 4, 5);
  });

  it("drills a through hole as a cylinder longer than the part", () => {
    const cut = cutFor(
      {
        block: { width: 40, height: 30, depth: 20 },
        // x/y/z are hole CENTRE coordinates in block space (20, 15, 10 = centre).
        operations: [{ type: "through_hole", x: 20, y: 15, z: 10, diameter: 8 }],
        dimensions: [],
      },
      0,
    );
    expect(cut.kind).toBe("cylinder");
    if (cut.kind !== "cylinder") return;
    expect(cut.axis).toBe("z");
    expect(cut.radius).toBeCloseTo(4, 5);
    expect(cut.length).toBeGreaterThan(20);
    expect(cut.center).toEqual([0, 0, 0]);
  });

  it("skips degenerate operations instead of emitting unusable cuts", () => {
    const plan = buildEngineeringSolidPlan({
      block: { width: 64, height: 50, depth: 40 },
      // A flat incline removes nothing, so it must not become a cut solid.
      operations: [{ type: "incline", axis: "left", atX: 10, fromY: 30, toY: 30 }],
      dimensions: [],
    });
    expect(plan.cuts).toHaveLength(0);
  });

  it("falls back to block dimensions when the drawing carried none", () => {
    const plan = buildEngineeringSolidPlan(H_PROFILE);
    expect(plan.dimensions.length).toBeGreaterThan(0);
  });
});

describe("Tool #9 — analysis engine", () => {
  it("instructs the model to READ the drawing, never to draw it", () => {
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/ANALYZER/);
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/Return ONLY the JSON object/i);
    for (const type of [
      "notch_top",
      "tunnel_bottom",
      "slot_side",
      "through_hole",
      "step",
      "chamfer",
      "incline",
    ]) {
      expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toContain(`"type": "${type}"`);
    }
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/LEFT-BOTTOM-BACK corner/);
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/DASHED hidden lines[\s\S]{0,40}as REAL internal geometry/i);
  });

  it("carries few-shot worked examples that pin the drawing-to-operations mapping", () => {
    const system = ENGINEERING_ANALYSIS_SYSTEM_PROMPT;
    expect(system).toContain("WORKED EXAMPLES");
    // Example 1: incline + top notch + bottom tunnel, verbatim schema shape.
    expect(system).toContain('"type": "incline", "axis": "x", "fromY": 50, "toY": 0, "atX": 34, "endX": 0');
    expect(system).toContain('"block": { "width": 64, "height": 50, "depth": 40 }');
    // Example 2: the H-profile pairing of notch_top with tunnel_bottom.
    expect(system).toContain('"block": { "width": 50, "height": 50, "depth": 40 }');
    expect(system).toMatch(/BOTH halves are separate operations/i);
    // Example 3: step + chamfer + through_hole.
    expect(system).toContain('"type": "step", "x": 30, "y": 25, "width": 30, "height": 15');
    expect(system).toContain('"type": "through_hole", "axis": "z"');
    // And every worked example is valid JSON that the real normaliser accepts.
    const examples = promptJsonBlocks(system).filter((block) =>
      Array.isArray((block as { operations?: unknown }).operations),
    ) as { block: unknown; operations: unknown[] }[];
    expect(examples.length).toBeGreaterThanOrEqual(3);
    for (const example of examples) {
      const geometry = normalizeEngineeringGeometry(example);
      expect(geometry?.operations.length).toBe(example.operations.length);
    }
  });

  it("tells the analyzer to read dashed hidden lines as through cuts", () => {
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toContain('"- - -" stroke convention');
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/DASHED hidden lines/i);
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).toMatch(/through cut/i);
  });

  it("builds a text-output vision request with the JSON response format", () => {
    const request = buildEngineeringAnalysisRequest(
      "data:image/png;base64,AAAA",
      "Deduce the missing view.",
      "server-secret",
      { jsonMode: true },
    );
    const body = JSON.parse(String(request.init.body)) as {
      model: string;
      response_format?: { type: string };
      messages: { role: string; content: unknown }[];
      modalities?: unknown;
    };
    expect(body.model).toBe(ENGINEERING_ANALYSIS_MODEL);
    expect(body.response_format).toEqual({ type: "json_object" });
    // Text-only: no image modality requested, so the answer is pure geometry.
    expect(body.modalities).toBeUndefined();
    expect(body.messages[0].role).toBe("system");
    const userContent = body.messages[1].content as { type: string }[];
    expect(userContent.map((part) => part.type)).toEqual(["text", "image_url"]);
    // The API key never leaks into the prompt itself.
    expect(JSON.stringify(body)).not.toContain("server-secret");
  });

  it("extracts geometry from fenced, bare and prose-wrapped answers", () => {
    const json = JSON.stringify({ block: { width: 10, height: 5, depth: 4 } });
    expect(extractEngineeringGeometryPayload("```json\n" + json + "\n```")).toEqual(
      JSON.parse(json),
    );
    expect(extractEngineeringGeometryPayload(json)).toEqual(JSON.parse(json));
    expect(
      extractEngineeringGeometryPayload(`Here is the geometry:\n${json}\nHope that helps!`),
    ).toEqual(JSON.parse(json));
    expect(extractEngineeringGeometryPayload("no json here")).toBeNull();
    expect(extractEngineeringGeometryPayload(undefined)).toBeNull();
  });

  it("recovers geometry past a preamble that itself contains a brace", () => {
    const text = 'Answer: {" then {"block":{"width":64,"height":50,"depth":40}, "operations": []}';
    // The first balanced span is unusable; the extractor must try every brace.
    expect(balancedJsonCandidates(text).length).toBeGreaterThanOrEqual(2);
    expect(extractEngineeringGeometryPayload(text)).toEqual({
      block: { width: 64, height: 50, depth: 40 },
      operations: [],
    });
  });

  it("reads both string and part-array message contents", () => {
    expect(
      extractMessageText({ choices: [{ message: { content: "plain" } }] }),
    ).toBe("plain");
    expect(
      extractMessageText({
        choices: [{ message: { content: [{ type: "text", text: "a" }, { text: "b" }] } }],
      }),
    ).toBe("a\nb");
    expect(extractMessageText(null)).toBe("");
  });

  it("returns validated geometry from a successful analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    block: { width: 64, height: 50, depth: 40 },
                    operations: [{ type: "notch_top", x: 34, width: 10, height: 20 }],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const result = await analyzeEngineeringGeometry(
      "data:image/png;base64,AAAA",
      "Deduce the views.",
      "test-key",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.geometry.block.width).toBe(64);
      expect(result.geometry.operations[0].type).toBe("notch_top");
    }
  });

  it("retries once with the rendering model when the analysis model is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "no such model" } }), { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    block: { width: 20, height: 10, depth: 8 },
                    operations: [],
                  }),
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeEngineeringGeometry(
      "data:image/png;base64,AAAA",
      "Deduce the views.",
      "test-key",
    );
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as { model: string };
    expect(secondBody.model).toBe(OPENROUTER_MODEL);
  });

  it("returns the 422 extraction notice — including the refund claim — when the answer is unusable", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "sorry!" } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await analyzeEngineeringGeometry(
      "data:image/png;base64,AAAA",
      "Deduce the views.",
      "test-key",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.message).toBe(ENGINEERING_EXTRACTION_FAILURE_BILINGUAL);
      expect(result.message).toMatch(/Could not extract geometry from this drawing/);
      expect(result.message).toMatch(/upload a clearer image \(credit refunded\)/);
      expect(result.message).toMatch(/لم نتمكن من قراءة تفاصيل الرسم الهندسي/);
      expect(result.message).toMatch(/تم استرجاع رصيدك/);
    }
  });

  it("reports an engine problem — not a drawing problem — when upstream fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: {} }), { status: 500 })),
    );
    const result = await analyzeEngineeringGeometry(
      "data:image/png;base64,AAAA",
      "Deduce the views.",
      "test-key",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // An engine that never answered must not tell the student their drawing
      // was unclear (and must not claim a drawing-specific failure).
      expect(result.status).toBe(502);
      expect(result.message).toBe(ENGINE_BUSY_BILINGUAL);
      expect(result.message).not.toMatch(/clearer image/);
    }
  });

  it("never names the underlying provider in any failure copy", () => {
    for (const message of [
      ENGINEERING_EXTRACTION_FAILURE_BILINGUAL,
      ENGINEERING_ANALYSIS_FAILURE_BILINGUAL,
      ENGINE_BUSY_BILINGUAL,
    ]) {
      expect(message).not.toMatch(/openrouter|gemini/i);
    }
    expect(ENGINEERING_ANALYSIS_SYSTEM_PROMPT).not.toMatch(/openrouter|gemini/i);
  });

  it("refuses to analyse when no engine key is configured", async () => {
    const previous = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const result = await analyzeEngineeringGeometry(
      "data:image/png;base64,AAAA",
      "Deduce the views.",
      undefined,
    );
    if (previous !== undefined) process.env.OPENROUTER_API_KEY = previous;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });
});

describe("Tool #9 — analyze route wiring", () => {
  const route = readFileSync("app/api/engineering/analyze/route.ts", "utf8");

  it("gates the analysis exactly like the render route", () => {
    const rate = route.indexOf("rateLimit(");
    const auth = route.indexOf("verifySupabaseUser(");
    const image = route.indexOf("validateImageDataUrl(");
    const refresh = route.indexOf("refreshDailyCredits(");
    const deduct = route.indexOf("deductGenerationCredit(");
    const analyze = route.indexOf("analyzeEngineeringGeometry(");
    const refund = route.indexOf("refundGenerationCredit(");

    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThan(auth);
    expect(auth).toBeLessThan(image);
    expect(image).toBeLessThan(refresh);
    expect(refresh).toBeLessThan(deduct);
    // Exactly one credit, charged BEFORE the model call, refunded on failure.
    expect(deduct).toBeLessThan(analyze);
    expect(refund).toBeGreaterThan(analyze);
    expect(route.match(/deductGenerationCredit\(/g)?.length).toBe(1);
    expect(route.match(/refundGenerationCredit\(/g)?.length).toBe(1);
  });

  it("returns the geometry plus the authoritative credit balance", () => {
    expect(route).toContain("geometry: result.geometry");
    expect(route).toContain("creditsRemaining");
    // The refund path returns the post-refund balance too, so the header badge
    // can never drift after a failed analysis.
    expect(route).toContain("return NextResponse.json({ error: message, creditsRemaining }, { status })");
  });

  it("ships the decision-point diagnostics", () => {
    for (const tag of [
      "[ENGINEERING_START]",
      "[ENGINEERING_REFRESH]",
      "[ENGINEERING_DEDUCTED]",
      "[ENGINEERING_CALLING_ENGINE]",
      "[ENGINEERING_REFUNDED]",
      "[ENGINEERING_RESPONSE]",
    ]) {
      expect(route).toContain(tag);
    }
  });

  it("refunds and reports 422 when the geometry is not renderable", () => {
    // The 200 path is guarded: an unusable block must never be returned as a
    // success, because the client cannot render it and the credit was charged.
    expect(route).toContain("isRenderableGeometry(result.geometry)");
    expect(route).toContain("failWithRefund(422, ENGINEERING_EXTRACTION_FAILURE_BILINGUAL)");
    // Every failure path goes through the one refund helper.
    expect(route).toContain("const failWithRefund");
    expect(route.match(/refundGenerationCredit\(/g)?.length).toBe(1);
    expect(route).toContain('console.log("[ENGINEERING_REFUNDED]", {');
  });

  it("is POST-only and marks itself as a node runtime", () => {
    expect(route).toContain('export const runtime = "nodejs"');
    expect(route).toContain("export async function GET()");
    expect(route).toContain("methodNotAllowed");
  });
});
