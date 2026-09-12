import { describe, expect, it } from "vitest";
import { buildOpenRouterRequest } from "../api/restore";
import { GALLERY_VARIATION_DIRECTIVE, TRIPTYCH_DIRECTIVE } from "../tools/registry";

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

  it("injects the 16:9 board layout and strict negatives for Triptych and 3-gallery briefs", () => {
    for (const directive of [TRIPTYCH_DIRECTIVE, GALLERY_VARIATION_DIRECTIVE]) {
      const instruction = systemPromptFor(`Redesign this building. ${directive}`);

      expect(instruction).toMatch(/3-PANEL PRESENTATION BOARD LAYOUT \(NON-NEGOTIABLE\)/i);
      expect(instruction).toMatch(/16:9 LANDSCAPE canvas/i);
      expect(instruction).toMatch(/EXACTLY THREE TALL VERTICAL panels side by side/i);
      expect(instruction).toMatch(/thin elegant gold dividing lines/i);
      expect(instruction).toMatch(/short style title centred directly above each panel/i);
      // Strict negatives: the exact exclusions requested for board outputs.
      expect(instruction).toMatch(/no infographics/i);
      expect(instruction).toMatch(/no vertical side text/i);
      expect(instruction).toMatch(/no bottom thumbnail rows/i);
      expect(instruction).toMatch(/no diagrams/i);
      expect(instruction).toMatch(/no technical charts/i);
      expect(instruction).toMatch(/no poster margins/i);
      expect(instruction).toMatch(/Pure photorealistic architectural renders only/i);
    }
  });
});
