import { describe, expect, it } from "vitest";
import {
  NONE_OPTION,
  QATTAN_TOOLS,
  TOOL_IDS,
  buildToolPrompt,
  getToolById,
  type ToolId,
} from "../tools/registry";
import {
  NO_WATERMARK_CLAUSE,
  STRUCTURAL_FIDELITY_CLAUSE,
  buildOpenRouterRequest,
  resolvePromptMode,
} from "../lib/openrouter-engine";

/**
 * Production audit of the eight core architectural tools. This is the
 * regression net for the launch contract: exactly eight live tools, fully
 * bilingual, each with a real prompt builder, and every assembled system
 * prompt carrying the structural-fidelity and no-watermark directives.
 */

const CORE_TOOLS: ToolId[] = [
  "exterior",
  "interior",
  "sketch",
  "masterplan",
  "landscape",
  "staging",
  "enhancer",
  "floorplan",
];

/** The system message of a request built for a tool, as sent on the wire. */
function systemPromptFor(id: ToolId): string {
  const request = buildOpenRouterRequest(
    "data:image/png;base64,AAAA",
    buildToolPrompt(id, {}),
    "audit-key",
    { promptMode: resolvePromptMode(id) },
  );
  const body = JSON.parse(String(request.init.body)) as {
    messages: { role: string; content: unknown }[];
  };
  const system = body.messages.find((message) => message.role === "system");
  return typeof system?.content === "string" ? system.content : "";
}

describe("Core-8 audit — registry contract", () => {
  it("registers exactly the eight core tools, in order, all live and deep-linked", () => {
    expect(TOOL_IDS).toEqual(CORE_TOOLS);
    expect(QATTAN_TOOLS.map((tool) => tool.id)).toEqual(CORE_TOOLS);

    for (const id of CORE_TOOLS) {
      const tool = getToolById(id);
      expect(tool, `missing tool: ${id}`).toBeDefined();
      expect(tool?.status).toBe("live");
      // Every card links straight into its own studio mode.
      expect(tool?.href).toContain(`mode=${id}`);
    }
  });

  it("keeps every tool fully bilingual and documented for users", () => {
    for (const tool of QATTAN_TOOLS) {
      for (const field of ["title", "description", "uploadLabel"] as const) {
        expect(tool[field].en.trim().length, `${tool.id}.${field}.en`).toBeGreaterThan(0);
        expect(tool[field].ar.trim().length, `${tool.id}.${field}.ar`).toBeGreaterThan(0);
      }
      for (const field of ["input", "output", "tip"] as const) {
        expect(tool.guide[field].en.trim().length, `${tool.id}.guide.${field}.en`).toBeGreaterThan(0);
        expect(tool.guide[field].ar.trim().length, `${tool.id}.guide.${field}.ar`).toBeGreaterThan(0);
      }
    }
  });

  it("offers the None (custom prompt) escape hatch first on every dropdown", () => {
    for (const tool of QATTAN_TOOLS) {
      for (const control of tool.controls ?? []) {
        // Multi-select checklists are feature pickers, not preset constraints.
        if (control.type !== "select") continue;
        expect(control.options.length, `${tool.id}.${control.id}`).toBeGreaterThan(1);
        expect(control.options[0]?.value, `${tool.id}.${control.id}`).toBe(NONE_OPTION.value);
        expect(control.label.en.trim().length).toBeGreaterThan(0);
        expect(control.label.ar.trim().length).toBeGreaterThan(0);
        for (const option of control.options) {
          expect(option.value.trim().length, `${tool.id}.${control.id} option`).toBeGreaterThan(0);
          expect(option.label.en.trim().length).toBeGreaterThan(0);
          expect(option.label.ar.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("builds a substantial, non-empty prompt for every tool with no selections at all", () => {
    for (const id of CORE_TOOLS) {
      const prompt = buildToolPrompt(id, {});
      expect(prompt.length, `${id} prompt length`).toBeGreaterThan(80);
      // Exactly one engine call site exists (see the route tests): the builder
      // is a pure string function and never issues a request itself.
      expect(prompt).not.toMatch(/https?:\/\//);
    }
  });
});

describe("Core-8 audit — engine contract", () => {
  it("agrees with the engine on the system-prompt mode for every tool", () => {
    for (const id of CORE_TOOLS) {
      expect(getToolById(id)?.promptMode, id).toBe(resolvePromptMode(id));
    }
  });

  it("carries structural fidelity and brand-safety into every tool's system prompt", () => {
    for (const id of CORE_TOOLS) {
      const system = systemPromptFor(id);
      expect(system, `${id} fidelity clause`).toContain(STRUCTURAL_FIDELITY_CLAUSE);
      expect(system, `${id} no-watermark clause`).toContain(NO_WATERMARK_CLAUSE);
      // Fidelity must outrank the layout and brand-safety rules.
      expect(system.indexOf(STRUCTURAL_FIDELITY_CLAUSE), id).toBeLessThan(
        system.indexOf(NO_WATERMARK_CLAUSE),
      );
    }
  });

  it("never frames a single-image brief as a presentation board", () => {
    for (const id of CORE_TOOLS) {
      const system = systemPromptFor(id);
      expect(system, `${id} board framing`).not.toContain("3-PANEL PRESENTATION BOARD LAYOUT");
    }
  });
});

describe("Core-8 audit — landscape feature checklist", () => {
  it("injects no preset feature when the user clears every checkbox", () => {
    const prompt = buildToolPrompt("landscape", {
      landscapeFeatures: [],
      landscapePlantStyle: "Tropical",
    });
    expect(prompt).not.toContain("Swimming Pool");
    expect(prompt).toContain("derived from the written brief");
    expect(prompt).toContain("Tropical planting");
  });

  it("still defaults to the first feature when the control was never provided", () => {
    expect(buildToolPrompt("landscape", {})).toContain("Swimming Pool");
  });
});
