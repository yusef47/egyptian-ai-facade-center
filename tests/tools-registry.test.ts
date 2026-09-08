import { describe, expect, it } from "vitest";
import {
  QATTAN_TOOLS,
  TOOL_IDS,
  buildToolPrompt,
  getToolById,
  type ToolControlId,
  type ToolId,
} from "../tools/registry";

describe("Qattan tool registry", () => {
  it("defines exactly the eight unified tools in the agreed order", () => {
    expect(TOOL_IDS).toEqual([
      "exterior",
      "interior",
      "sketch",
      "masterplan",
      "landscape",
      "staging",
      "enhancer",
      "floorplan",
    ]);
    expect(QATTAN_TOOLS).toHaveLength(8);
  });

  it("marks exterior and floorplan as live engines and every other tool live too", () => {
    for (const tool of QATTAN_TOOLS) {
      expect(tool.status).toBe("live");
    }
    expect(getToolById("exterior")?.promptMode).toBe("facade");
    expect(getToolById("floorplan")?.promptMode).toBe("cad");
  });

  it("never reuses a control id across tools", () => {
    const seen = new Set<ToolControlId>();
    for (const tool of QATTAN_TOOLS) {
      for (const control of tool.controls) {
        expect(seen.has(control.id)).toBe(false);
        seen.add(control.id);
      }
    }
  });

  it("builds the exterior prompt with style, lighting and materials", () => {
    const prompt = buildToolPrompt("exterior", {
      exteriorStyle: "Modern",
      exteriorLighting: "Golden Hour",
      exteriorMaterial: "Limestone",
    });
    expect(prompt).toContain("Modern");
    expect(prompt).toContain("Golden Hour");
    expect(prompt).toContain("Limestone");
    expect(prompt).toContain("Maintain the exact structural grid");
    expect(prompt).toContain("photorealistic 8K architectural visualization");
  });

  it("builds the interior prompt with room, style and palette", () => {
    const prompt = buildToolPrompt("interior", {
      interiorRoom: "Living Room",
      interiorStyle: "Japandi",
      interiorMood: "Warm Neutrals",
    });
    expect(prompt).toContain("Living Room");
    expect(prompt).toContain("Japandi");
    expect(prompt).toContain("Warm Neutrals");
    expect(prompt).toContain("Maintain existing walls, doors, and windows");
  });

  it("builds the sketch prompt with building type, style and environment", () => {
    const prompt = buildToolPrompt("sketch", {
      sketchBuilding: "Residential Villa",
      sketchStyle: "Mediterranean",
      sketchEnvironment: "Coastal",
    });
    expect(prompt).toContain("Residential Villa");
    expect(prompt).toContain("Mediterranean");
    expect(prompt).toContain("Coastal");
  });

  it("builds the masterplan prompt with project type, density and landscape", () => {
    const prompt = buildToolPrompt("masterplan", {
      masterplanProject: "Residential Compound",
      masterplanDensity: "Mid-rise",
      masterplanLandscape: "Arid",
    });
    expect(prompt).toContain("Residential Compound");
    expect(prompt).toContain("Mid-rise");
    expect(prompt).toContain("bird's-eye view");
  });

  it("builds the landscape prompt with selected features", () => {
    const prompt = buildToolPrompt("landscape", {
      landscapeFeatures: ["Swimming Pool", "Pergola"],
      landscapePlantStyle: "Tropical",
    });
    expect(prompt).toContain("Swimming Pool");
    expect(prompt).toContain("Pergola");
    expect(prompt).toContain("Tropical");
  });

  it("builds the staging prompt with market and furniture style", () => {
    const prompt = buildToolPrompt("staging", {
      stagingMarket: "Luxury Residential",
      stagingFurniture: "Contemporary",
    });
    expect(prompt).toContain("Luxury Residential");
    expect(prompt).toContain("Contemporary");
    expect(prompt).toContain("Keep all walls, floors, windows, and doors exactly as they are");
  });

  it("builds the enhancer prompt with level and focus", () => {
    const prompt = buildToolPrompt("enhancer", {
      enhancerLevel: "Maximum",
      enhancerFocus: "Materials & Textures",
    });
    expect(prompt).toContain("Maximum");
    expect(prompt).toContain("Materials & Textures");
    expect(prompt).toContain("Maintain the exact composition, camera angle");
  });

  it("builds the floorplan prompt through the CAD engine contract", () => {
    const prompt = buildToolPrompt("floorplan", {});
    expect(prompt).toContain("2x2");
    expect(prompt).toContain("PLAN");
    expect(prompt).toContain("ELEVATION");
    expect(prompt).toContain("SECTION");
    expect(prompt).toContain("PERSPECTIVE");
  });

  it("rejects unknown tool ids", () => {
    const unknown = "unknown" as ToolId;
    expect(() => buildToolPrompt(unknown, {})).toThrow(/unknown tool/i);
  });
});
