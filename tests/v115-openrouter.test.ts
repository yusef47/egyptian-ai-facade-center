import { describe, expect, it } from "vitest";
import { buildOpenRouterRequest } from "../lib/openrouter-engine";
import {
  STRUCTURAL_FIDELITY_CLAUSE,
  resolveToolRequest,
  type OpenRouterRequest,
} from "../lib/openrouter-engine";
import {
  GALLERY_VARIATION_DIRECTIVE,
  TOOL_IDS,
  TRIPTYCH_DIRECTIVE,
} from "../tools/registry";

/** Extracts the system prompt from an already-built request. */
type BuiltBody = {
  messages: { role: string; content: string | { type: string; text?: string }[] }[];
};

function systemPromptFrom(request: OpenRouterRequest): string {
  const body = JSON.parse(String(request.init.body)) as BuiltBody;
  const system = body.messages.find((message) => message.role === "system");
  return typeof system?.content === "string"
    ? system.content
    : system?.content.find((part) => part.type === "text")?.text ?? "";
}

/**
 * Every text part across all messages. The inline path folds the system prompt
 * into the user turn, so a system-only extractor would miss it entirely.
 */
function allPromptText(request: OpenRouterRequest): string {
  const body = JSON.parse(String(request.init.body)) as BuiltBody;
  return body.messages
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : message.content.map((part) => part.text ?? "").join("\n"),
    )
    .join("\n");
}

/** Extracts the system prompt from a built request body. */
function systemPromptFor(prompt: string): string {
  const request = buildOpenRouterRequest("data:image/jpeg;base64,AAAA", prompt, "sk-test");
  const body = JSON.parse(String(request.init.body)) as {
    messages: { role: string; content: string | { type: string; text?: string }[] }[];
  };
  const system = body.messages.find((message) => message.role === "system");
  return typeof system?.content === "string"
    ? system.content
    : system?.content.find((part) => part.type === "text")?.text ?? "";
}

describe("V115 triptych restoration request", () => {
  it("asks for one 8K image containing three gold-separated restoration panels", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "Preserve the existing geometry and use warm evening light.",
      "sk-test",
    );
    const body = JSON.parse(String(request.init.body)) as {
      messages: { role: string; content: string | { type: string; text?: string }[] }[];
    };
    const system = body.messages.find((message) => message.role === "system");
    const instruction = typeof system?.content === "string"
      ? system.content
      : system?.content.find((part) => part.type === "text")?.text ?? "";

    expect(instruction).toMatch(/ONE cohesive 8K 3-Panel Architectural Presentation Board/i);
    expect(instruction).toMatch(/8K/i);
    expect(instruction).toMatch(/Khedivial Classic/i);
    expect(instruction).toMatch(/Hashami.*Biophilic/i);
    expect(instruction).toMatch(/Islamic Mashrabiya/i);
    expect(instruction).toMatch(/thin.*gold.*borders/i);
    expect(instruction).toMatch(/side.by.side|panels side by side|left.*center.*right/i);
    // Clean horizontal 16:9 board with three tall vertical panels.
    expect(instruction).toMatch(/16:9/i);
    expect(instruction).toMatch(/three tall vertical panels/i);
    expect(instruction).toMatch(/2048×1152|2048x1152/i);
    expect(instruction).toMatch(/exactly one-third/i);
    expect(instruction).toMatch(/same level of detail/i);
    expect(instruction).toMatch(/Do NOT compress or narrow/i);
  });

  it("asks for ONE clean render (no board framing) when no board directive is present", () => {
    const instruction = systemPromptFor("Modern villa facade in limestone, warm evening light.");

    expect(instruction).toMatch(/produce ONE single photorealistic 8K architectural render/i);
    expect(instruction).toMatch(/no panels, no dividing borders, and no poster framing/i);
    // Board-only layout enforcement must stay out of single-image prompts.
    expect(instruction).not.toMatch(/NO bottom thumbnail rows/i);
    expect(instruction).not.toMatch(/NO vertical side text/i);
  });

  it("injects mode-aware board layout and strict negatives for Triptych and 3-gallery briefs", () => {
    const triptychInstruction = systemPromptFor(`Redesign this building. ${TRIPTYCH_DIRECTIVE}`);

    expect(triptychInstruction).toMatch(/TRIPTYCH BOARD LAYOUT \(NON-NEGOTIABLE\)/i);
    expect(triptychInstruction).toMatch(/16:9 LANDSCAPE panoramic canvas/i);
    expect(triptychInstruction).toMatch(/EXACTLY THREE side-by-side panels/i);
    expect(triptychInstruction).toMatch(/Left panel = full Daytime view/i);
    expect(triptychInstruction).toMatch(/Center panel = the same view under Dusk\/Golden-hour lighting/i);
    expect(triptychInstruction).toMatch(/Right panel = an Architectural detail close-up/i);
    expect(triptychInstruction).toMatch(/crisp thin vertical division lines/i);
    // Strict negatives: the exact exclusions requested for board outputs.
    expect(triptychInstruction).toMatch(/no infographics/i);
    expect(triptychInstruction).toMatch(/no vertical side text/i);
    expect(triptychInstruction).toMatch(/no bottom thumbnail rows/i);
    expect(triptychInstruction).toMatch(/no diagrams/i);
    expect(triptychInstruction).toMatch(/no technical charts/i);
    expect(triptychInstruction).toMatch(/no poster margins/i);
    expect(triptychInstruction).toMatch(/Pure photorealistic architectural renders only/i);

    // Gallery briefs get the portfolio-sheet spec — hero left, stacked right.
    const galleryInstruction = systemPromptFor(`Redesign this building. ${GALLERY_VARIATION_DIRECTIVE}`);
    expect(galleryInstruction).toMatch(/GALLERY PRESENTATION SHEET LAYOUT \(NON-NEGOTIABLE\)/i);
    expect(galleryInstruction).toMatch(/16:9 LANDSCAPE canvas split into TWO columns/i);
    expect(galleryInstruction).toMatch(/primary HERO view/i);
    expect(galleryInstruction).toMatch(/exactly TWO stacked detail views/i);
    expect(galleryInstruction).toMatch(/must never be three equal panels/i);
    expect(galleryInstruction).not.toMatch(/TRIPTYCH BOARD LAYOUT/i);
  });
});

describe("Structural fidelity — enforced across all 8 tools", () => {
  it("carries the structural preservation directive for every registered tool", () => {
    expect(TOOL_IDS).toHaveLength(8);
    for (const toolId of TOOL_IDS) {
      const instruction = systemPromptFrom(
        resolveToolRequest(toolId, "Redesign per the brief.", "sk-test"),
      );
      expect(instruction, `${toolId} must carry the fidelity clause`).toContain(
        STRUCTURAL_FIDELITY_CLAUSE,
      );
    }
  });

  it("states each structural guarantee explicitly and verbatim", () => {
    for (const phrase of [
      "Maintain 100% exact architectural structural fidelity from the source image",
      "exact camera perspective",
      "room proportions",
      "door openings",
      "window placements",
      "ceiling heights",
      "structural columns",
      "wall boundaries",
      "ONLY within the existing structural bounds of the uploaded image",
      "without shifting structural elements",
    ]) {
      expect(STRUCTURAL_FIDELITY_CLAUSE).toContain(phrase);
    }
  });

  it("places the directive ahead of the board layout and watermark rules", () => {
    const instruction = systemPromptFrom(
      resolveToolRequest(
        "exterior",
        `Redesign this building. ${TRIPTYCH_DIRECTIVE}`,
        "sk-test",
      ),
    );
    expect(instruction.indexOf(STRUCTURAL_FIDELITY_CLAUSE)).toBeGreaterThan(-1);
    expect(instruction.indexOf(STRUCTURAL_FIDELITY_CLAUSE)).toBeLessThan(
      instruction.indexOf("TRIPTYCH BOARD LAYOUT"),
    );
  });

  it("survives the inline-system-prompt path used by the restore route", () => {
    const inline = resolveToolRequest("interior", "Furnish this room.", "sk-test", {
      inlineSystemPrompt: true,
    });
    expect(allPromptText(inline)).toContain(STRUCTURAL_FIDELITY_CLAUSE);
  });
});
