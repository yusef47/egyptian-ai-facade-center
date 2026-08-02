import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequest,
  extractImageData,
  OPENROUTER_MODEL,
} from "../api/restore";

describe("OpenRouter restoration request", () => {
  it("targets the fast Gemini image model", () => {
    expect(OPENROUTER_MODEL).toBe("google/gemini-3.1-flash-lite-image");
  });

  it("builds a POST request with the image and prompt payload", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "Restore in Khedivial style",
      "sk-test",
    );
    expect(request.url).toContain("openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(request.init.body as string) as {
      model: string;
      modalities: string[];
      messages: { role: string; content: { type: string; image_url: { url: string } }[] }[];
    };
    expect(body.model).toBe("google/gemini-3.1-flash-lite-image");
    expect(body.modalities).toContain("image");
    expect(body.messages[0].content[1].type).toBe("image_url");
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("extracts base64 image output from the OpenRouter response", () => {
    const output = extractImageData({ images: [{ b64_json: "aGVsbG8=" }] });
    expect(output).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("extracts hosted image urls from content parts", () => {
    const output = extractImageData({
      choices: [{ message: { content: [{ image_url: { url: "https://cdn.example.com/result.png" } }] } }],
    });
    expect(output).toBe("https://cdn.example.com/result.png");
  });

  it("returns null when no image is present", () => {
    expect(extractImageData({ choices: [{ message: { content: [{ type: "text", text: "ok" }] } }] })).toBeNull();
  });
});
