import { describe, expect, it } from "vitest";
import {
  NONE_OPTION,
  QATTAN_TOOLS,
  QUAD_MASTER_DIRECTIVE,
  TOOL_IDS,
  buildToolPrompt,
  getToolById,
} from "../tools/registry";
import {
  ENGINEERING_DEDUCTION_SYSTEM_PROMPT,
  buildOpenRouterRequest,
  resolvePromptMode,
  validateRestorePayload,
} from "../lib/openrouter-engine";

describe("Tool #9 — Engineering Multiview & 3D", () => {
  it("registers as the ninth live tool", () => {
    expect(TOOL_IDS[TOOL_IDS.length - 1]).toBe("engineering");
    expect(QATTAN_TOOLS).toHaveLength(9);
    expect(getToolById("engineering")?.status).toBe("live");
    expect(getToolById("engineering")?.href).toBe("/studio?mode=engineering");
  });

  it("carries the brief-specified bilingual titles and academic badge copy", () => {
    const tool = getToolById("engineering");
    expect(tool?.title.en).toBe("Engineering Multiview & 3D");
    expect(tool?.title.ar).toBe("الاستنتاج الهندسي (إعدادي هندسة)");
    expect(tool?.guide.tip.ar).toMatch(/[\u0600-\u06FF]/);
    expect(tool?.guide.input.en).toMatch(/drafting class/i);
  });

  it("exposes the two brief-specified controls with None at index 0", () => {
    const tool = getToolById("engineering");
    expect(tool?.controls.map((c) => c.id)).toEqual([
      "engineeringInputType",
      "engineeringTargetOutput",
    ]);
    for (const control of tool?.controls ?? []) {
      expect(control.options[0]).toEqual(NONE_OPTION);
    }
    const inputOptions = tool?.controls[0].options.map((o) => o.value);
    expect(inputOptions).toContain("Front Elevation");
    expect(inputOptions).toContain("Top Plan");
    expect(inputOptions).toContain("Side Elevation");
    expect(inputOptions).toContain("Isometric Rough Sketch");
    const outputOptions = tool?.controls[1].options.map((o) => o.value);
    expect(outputOptions).toContain("3D Isometric View");
    expect(outputOptions).toContain("Complete 3-View Orthographic Board");
    expect(outputOptions).toContain("Cross-Sectional Cut View");
  });

  it("falls back to the Full Quad Master Board as the default output when nothing is picked", () => {
    const prompt = buildToolPrompt("engineering", {});
    expect(prompt).toContain("Front Elevation");
    expect(prompt).toContain("4-quadrant engineering master board");
    expect(prompt).toContain("Top-Left: Front Elevation");
    expect(prompt).toContain("Bottom-Right: 3D Isometric Projection View");
  });

  it("assembles the brief's prompt template fields for explicit selections", () => {
    const prompt = buildToolPrompt("engineering", {
      engineeringInputType: "Top Plan",
      engineeringTargetOutput: "Complete 3-View Orthographic Board",
    });
    expect(prompt).toContain("deep academic engineering deduction");
    expect(prompt).toContain("single provided Top Plan");
    expect(prompt).toContain("precise Complete 3-View Orthographic Board");
  });

  it("keeps a coherent custom-prompt sentence when both controls are None", () => {
    const prompt = buildToolPrompt("engineering", {
      engineeringInputType: "none",
      engineeringTargetOutput: "none",
    });
    expect(prompt).not.toMatch(/\bnone\b/);
    expect(prompt).not.toMatch(/undefined|\{\}/);
    expect(prompt).toContain("deep academic engineering deduction");
    expect(prompt).toContain("orthographic projection rules");
  });

  it("offers the quad-master option with the exact bilingual label", () => {
    const tool = getToolById("engineering");
    const outputControl = tool?.controls.find((c) => c.id === "engineeringTargetOutput");
    const quad = outputControl?.options.find((o) => o.value === "quadmaster");
    expect(quad?.label.en).toBe("Full Quad Master Board (Elevation + Plan + Side + 3D Isometric)");
    expect(quad?.label.ar).toBe("لوحة هندسية شاملة (المساقط الثلاثة + المنظور الـ 3D معاً)");
    // First non-None option => the default fallback selection.
    expect(outputControl?.options[1].value).toBe("quadmaster");
  });

  it("embeds the quad-master directive verbatim for explicit quadmaster selection", () => {
    const prompt = buildToolPrompt("engineering", {
      engineeringInputType: "Top Plan",
      engineeringTargetOutput: "quadmaster",
    });
    expect(prompt).toContain("single provided Top Plan");
    expect(prompt).toContain(QUAD_MASTER_DIRECTIVE);
    expect(prompt).toContain("strict orthographic alignment, datum lines, hidden dashed lines");
  });

  it("swaps in the quad-master system prompt when the directive is present in the brief", () => {
    const quadPrompt = buildToolPrompt("engineering", { engineeringTargetOutput: "quadmaster" });
    const request = buildOpenRouterRequest("data:image/png;base64,abc", quadPrompt, "test-key", {
      promptMode: "engineering",
    });
    const body = JSON.parse(String(request.init.body));
    expect(body.messages[0].content).toContain("FULL QUAD MASTER BOARD LAYOUT");
    expect(body.messages[0].content).toContain("Top-Left: Front Elevation");
    expect(body.messages[0].content).toContain("MUST depict the SAME object");

    const plainPrompt = buildToolPrompt("engineering", { engineeringTargetOutput: "3D Isometric View" });
    const plainRequest = buildOpenRouterRequest("data:image/png;base64,abc", plainPrompt, "test-key", {
      promptMode: "engineering",
    });
    const plainBody = JSON.parse(String(plainRequest.init.body));
    expect(plainBody.messages[0].content).not.toContain("FULL QUAD MASTER BOARD LAYOUT");
    expect(plainBody.messages[0].content).toContain("ENGINEERING DRAFTING RULES");
  });

  it("routes engineering to its own drafting system prompt on the server", () => {
    expect(resolvePromptMode("engineering")).toBe("engineering");
    const request = buildOpenRouterRequest(
      "data:image/png;base64,abc",
      "Deduce the isometric view.",
      "test-key",
      { promptMode: "engineering" },
    );
    const body = JSON.parse(String(request.init.body));
    expect(body.messages[0].content).toContain("orthographic projection conventions");
    expect(body.messages[0].content).toContain("hidden-line convention");
    expect(body.messages[0].content).toContain("isometric projection geometry");
    expect(body.messages[0].content).toContain("NEVER invent doors, windows, masses");
  });

  it("drafts as a mechanical drafter with strict part-geometry integrity", () => {
    const system = ENGINEERING_DEDUCTION_SYSTEM_PROMPT;
    // Mechanical/industrial drafting identity, not architectural only.
    expect(system).toMatch(/Mechanical & Industrial Engineering Drafter/i);
    expect(system).toMatch(/preparatory engineering/i);
    expect(system).toMatch(/إعدادي هندسة/);
    // Deduces both the missing view and the 30-degree isometric.
    expect(system).toMatch(/MISSING ORTHOGRAPHIC VIEW/i);
    expect(system).toMatch(/30-degree isometric axes/i);
    // Feature-level integrity: slots, U-channels, inclined planes, holes.
    expect(system).toMatch(/U-slot/i);
    expect(system).toMatch(/counterbore/i);
    expect(system).toMatch(/inclined slope/i);
    expect(system).toContain("GEOMETRIC INTEGRITY (NON-NEGOTIABLE)");
    // Never fall back to generic blocks.
    expect(system).toMatch(/DO NOT hallucinate generic wedge blocks, plain rectangular solids, or simplified boxes/i);
    // Sheet layout: white paper, black CAD line work, bottom-right isometric, labels.
    expect(system).toContain("SHEET LAYOUT & LABELS");
    expect(system).toMatch(/solid white paper background/i);
    expect(system).toMatch(/crisp black CAD line work/i);
    expect(system).toMatch(/bottom-right of the sheet/i);
    for (const label of ["FRONT ELEVATION", "SIDE VIEW", "TOP PLAN", "ISOMETRIC PROJECTION"]) {
      expect(system).toContain(label);
    }
  });

  it("decomposes dual-cut and bottom-tunnel features before drawing", () => {
    const system = ENGINEERING_DEDUCTION_SYSTEM_PROMPT;
    // Ordered spatial chain-of-thought: discover -> reconstruct -> verify parity.
    expect(system).toContain("SPATIAL FEATURE DECOMPOSITION (MANDATORY, IN THIS ORDER)");
    expect(system).toContain("STEP 1 — FEATURE DISCOVERY");
    expect(system).toContain("STEP 2 — 3D VOLUME RECONSTRUCTION");
    expect(system).toContain("STEP 3 — PROJECTION CONSISTENCY");
    // Step 1: top and bottom cutouts, H-profiles, dashed = internal geometry.
    expect(system).toMatch(/BOTH top and bottom cutouts/i);
    expect(system).toMatch(/H-profiles/i);
    expect(system).toMatch(/horizontal dashed lines indicate internal ceiling cuts or through-tunnels/i);
    // Step 2: the bottom tunnel is a real through-void with a visible opening.
    expect(system).toMatch(/cut all the way through the base of the 3D Isometric object from front face to back face/i);
    expect(system).toMatch(/hollowed arch\/tunnel opening at the bottom front face/i);
    expect(system).toMatch(/Top Plan View, render the bottom tunnel walls as parallel dashed hidden lines extending along the full length/i);
    // Step 3: four-way feature parity.
    expect(system).toMatch(/100% feature parity/i);
    expect(system).toMatch(/Front Elevation, Side View \(H-profile\), Top Plan View, and 3D Isometric/i);
  });

  it("accepts toolId:engineering payloads and stamps the engineering prompt mode", () => {
    const result = validateRestorePayload({
      imageDataUrl: "data:image/png;base64,abc",
      prompt: "Deduce all three views from this plan.",
      toolId: "engineering",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.toolId).toBe("engineering");
      expect(result.payload.promptMode).toBe("engineering");
    }
  });

  it("ships real preview assets for the marketing modal", async () => {
    const { readFile } = await import("node:fs/promises");
    const poster = await readFile("public/poster-engineering.jpg");
    const video = await readFile("public/videos/tool-engineering.mp4");
    expect(poster.length).toBeGreaterThan(20_000);
    expect(video.length).toBeGreaterThan(100_000);
  });
});
