import { describe, expect, it } from "vitest";
import { buildOpenRouterRequest, CAD_SYSTEM_PROMPT } from "../api/restore";

describe("V117 CAD OpenRouter request", () => {
  it("uses the dedicated CAD prompt without leaking facade triptych instructions", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "convert this architectural floor plan to a high-contrast 2D black and white clean CAD drafting style drawing, sharp thin black lines on pure white background, no 3D shading, clean vector line art style",
      "sk-test",
      { mode: "cad" },
    );
    const body = JSON.parse(String(request.init.body)) as {
      messages: { role: string; content: string | { type: string; text?: string }[] }[];
    };
    const system = body.messages.find((message) => message.role === "system");
    const instruction = typeof system?.content === "string"
      ? system.content
      : system?.content.find((part) => part.type === "text")?.text ?? "";

    expect(instruction.startsWith(CAD_SYSTEM_PROMPT)).toBe(true);
    expect(instruction).toContain("watermark-free");
    expect(instruction).toContain("2x2 grid");
    expect(instruction).toContain("NO grayscale shading");
    expect(instruction).toContain("expert AI Architectural CAD Generator");
    expect(instruction).toContain("directly parsed by a CAD Vectorizer");
    expect(instruction).toContain("pure, razor-sharp black lines");
    expect(instruction).toContain("100% solid white background");
    expect(instruction).toContain("solid black rectangular blocks");
    expect(instruction).toContain("structural concrete columns");
    expect(instruction).toContain("Do NOT generate ANY text");
    expect(instruction).toContain("ABSOLUTELY ZERO LETTERS OR NUMBERS");
    expect(instruction).toContain("FFL");
    expect(instruction).toContain("PLAN, ELEVATION, SECTION, PERSPECTIVE");
    expect(instruction).not.toContain("label each quadrant PLAN");
    expect(instruction).not.toContain("crisp, horizontal, and clearly legible");
    expect(instruction).not.toContain("3-Panel Architectural Presentation Board");
  });

  it("keeps the facade master prompt when mode is omitted", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "Restore this facade",
      "sk-test",
    );
    const body = JSON.parse(String(request.init.body)) as {
      messages: { role: string; content: string | { type: string; text?: string }[] }[];
    };
    expect(String(body.messages[0].content)).toContain("3-Panel");
  });
});
