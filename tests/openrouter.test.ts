import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequest,
  extractImageData,
  extractImageUrlFromText,
  OPENROUTER_MODEL,
  trimOutputDataUrl,
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
});

describe("image output extraction", () => {
  it("extracts base64 image output from the OpenRouter response", () => {
    const output = extractImageData({ images: [{ b64_json: "aGVsbG8=" }] });
    expect(output).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("extracts hosted image urls from content image_url parts", () => {
    const output = extractImageData({
      choices: [{ message: { content: [{ image_url: { url: "https://cdn.example.com/result.png" } }] } }],
    });
    expect(output).toBe("https://cdn.example.com/result.png");
  });

  it("extracts markdown ![image](url) from content text", () => {
    const output = extractImageData({
      choices: [
        {
          message: {
            content: [{ type: "text", text: "Here you go ![image](https://cdn.example.com/result.png)" }],
          },
        },
      ],
    });
    expect(output).toBe("https://cdn.example.com/result.png");
  });

  it("extracts a plain https url from content text", () => {
    const output = extractImageData({
      choices: [{ message: { content: [{ type: "text", text: "Result: https://cdn.example.com/out.jpg" }] } }],
    });
    expect(output).toBe("https://cdn.example.com/out.jpg");
  });

  it("extracts image_url objects nested inside the top-level images array", () => {
    const output = extractImageData({
      images: [{ type: "image_url", image_url: { url: "https://cdn.example.com/top.png" } }],
    });
    expect(output).toBe("https://cdn.example.com/top.png");
  });

  it("extracts a markdown image url from a plain-string content field", () => {
    const output = extractImageData({
      choices: [{ message: { content: "![image](https://cdn.example.com/plain.png)" } }],
    });
    expect(output).toBe("https://cdn.example.com/plain.png");
  });

  it("returns null when no image is present", () => {
    expect(extractImageData({ choices: [{ message: { content: [{ type: "text", text: "ok" }] } }] })).toBeNull();
  });

  it("does not extract text-only urls from unrelated plain text", () => {
    expect(extractImageUrlFromText("This is documentation, see https://openrouter.ai/docs")).toBeNull();
  });
});

describe("output payload trimming", () => {
  it("passes through small data urls without re-encoding", async () => {
    const output = await trimOutputDataUrl("data:image/png;base64,aGVsbG8=");
    expect(output).toBe("data:image/png;base64,aGVsbG8=");
  });

  it("passes through hosted https urls untouched", async () => {
    const output = await trimOutputDataUrl("https://cdn.example.com/result.png");
    expect(output).toBe("https://cdn.example.com/result.png");
  });

  it("falls back to the original payload when re-encoding fails", async () => {
    const oversized = `data:image/png;base64,${"A".repeat(3_000_000)}`;
    const output = await trimOutputDataUrl(oversized);
    expect(output).toBe(oversized);
  });
});
