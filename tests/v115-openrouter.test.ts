import { describe, expect, it } from "vitest";
import { buildOpenRouterRequest } from "../api/restore";

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

    expect(instruction).toMatch(/one single image|one cohesive.*Triptych/i);
    expect(instruction).toMatch(/8K/i);
    expect(instruction).toMatch(/Khedivial Classic/i);
    expect(instruction).toMatch(/Hashami.*Biophilic/i);
    expect(instruction).toMatch(/Islamic Mashrabiya/i);
    expect(instruction).toMatch(/thin.*gold.*borders/i);
    expect(instruction).toMatch(/side.by.side|panels side by side|left.*center.*right/i);
    expect(instruction).toMatch(/ULTRA-WIDE PANORAMIC/i);
    expect(instruction).toMatch(/3:1/);
    expect(instruction).toMatch(/3072×1024|3072x1024/i);
    expect(instruction).toMatch(/exactly one-third/i);
    expect(instruction).toMatch(/same level of detail/i);
    expect(instruction).toMatch(/Do NOT compress or narrow/i);
  });
});
