import { describe, expect, it } from "vitest";
import {
  FLOORPLAN_PROMPT,
  TOOL_IDS,
  buildToolPrompt,
} from "../tools/registry";
import {
  buildOpenRouterRequest,
  resolveToolRequest,
  validateRestorePayload,
} from "../server/openrouter-engine";

describe("server engine toolId contract", () => {
  it("defaults to the exterior tool and facade prompt mode", () => {
    const result = validateRestorePayload({
      imageDataUrl: "data:image/png;base64,abc",
      prompt: "Restore this facade warmly",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.toolId).toBe("exterior");
      expect(result.payload.promptMode).toBe("facade");
    }
  });

  it("accepts every registry toolId and resolves its prompt mode", () => {
    for (const toolId of TOOL_IDS) {
      const result = validateRestorePayload({
        imageDataUrl: "data:image/png;base64,abc",
        prompt: "Valid architectural brief",
        toolId,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.payload.toolId).toBe(toolId);
      }
    }
  });

  it("rejects unknown toolIds with a 400", () => {
    const result = validateRestorePayload({
      imageDataUrl: "data:image/png;base64,abc",
      prompt: "Valid architectural brief",
      toolId: "hologram",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.message).toMatch(/unsupported tool/i);
    }
  });

  it("maps exterior to facade mode, floorplan to cad mode, and others to general", () => {
    expect(resolveToolRequest("exterior", "brief", "key").init).toBeDefined();
    expect(resolveToolRequest("floorplan", FLOORPLAN_PROMPT, "key").init).toBeDefined();
    expect(resolveToolRequest("interior", buildToolPrompt("interior", {}), "key").init).toBeDefined();
  });

  it("keeps cad mode requests free of injected extra system text beyond the CAD prompt", () => {
    const request = resolveToolRequest("floorplan", FLOORPLAN_PROMPT, "key");
    const body = JSON.parse(String(request.init.body)) as { messages: { role: string }[] };
    expect(body.messages[0].role).toBe("system");
  });

  it("builds a valid OpenRouter request with the composed tool prompt", () => {
    const prompt = buildToolPrompt("exterior", {
      exteriorStyle: "Brutalist",
      exteriorLighting: "Night 2700K",
      exteriorMaterial: "Concrete",
    });
    const request = buildOpenRouterRequest(
      "data:image/png;base64,abc",
      prompt,
      "key",
      { promptMode: "general" },
    );
    const body = JSON.parse(String(request.init.body)) as {
      model: string;
      messages: { role: string; content: unknown }[];
    };
    expect(body.messages[0].role).toBe("system");
    expect(JSON.stringify(body)).toContain("Brutalist");
    expect(JSON.stringify(body)).not.toContain("key");
  });
});
