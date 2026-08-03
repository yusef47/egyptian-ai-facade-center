import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequest,
  extractImageData,
  extractImageUrlFromText,
  MASTER_ARCHITECTURAL_SYSTEM_PROMPT,
  OPENROUTER_MODEL,
  trimOutputDataUrl,
} from "../api/restore";

describe("OpenRouter restoration request", () => {
  it("targets the fast Gemini image model", () => {
    expect(OPENROUTER_MODEL).toBe("google/gemini-3.1-flash-lite-image");
  });

  it("builds a POST request with the image, prompt payload and master system prompt", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "Restore in Khedivial style",
      "sk-test",
    );
    expect(request.url).toContain("openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(request.init.body as string) as {
      model: string;
      modalities: string[];
      messages: {
        role: string;
        content: string | { type: string; image_url: { url: string } }[];
      }[];
    };
    expect(body.model).toBe("google/gemini-3.1-flash-lite-image");
    expect(body.modalities).toContain("image");

    expect(body.messages[0].role).toBe("system");
    expect(typeof body.messages[0].content).toBe("string");

    const userMessage = body.messages[1];
    expect(userMessage.role).toBe("user");
    const content = userMessage.content as { type: string; image_url: { url: string } }[];
    expect(content[0].type).toBe("text");
    expect(content[1].type).toBe("image_url");
    expect(content[1].image_url.url).toBe("data:image/jpeg;base64,AAAA");
  });

  it("can inline the master prompt into the user message as a fallback", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,AAAA",
      "Restore in Khedivial style",
      "sk-test",
      { inlineSystemPrompt: true },
    );
    const body = JSON.parse(request.init.body as string) as {
      messages: {
        role: string;
        content: { type: string; text?: string; image_url?: { url: string } }[];
      }[];
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    const textPart = body.messages[0].content[0];
    expect(textPart.type).toBe("text");
    expect(textPart.text).toContain("3-Panel");
    expect(textPart.text).toContain("Triptych");
    expect(textPart.text).toContain("USER RESTORATION BRIEF: Restore in Khedivial style");
    expect(body.messages[0].content[1].image_url?.url).toBe("data:image/jpeg;base64,AAAA");
  });
});

describe("Master Architectural system prompt", () => {
  it("covers all Egyptian & international heritage styles", () => {
    const prompt = MASTER_ARCHITECTURAL_SYSTEM_PROMPT;
    expect(prompt).toMatch(/Khedivial Cairo/i);
    expect(prompt).toMatch(/Mamluk|Fatimid/i);
    expect(prompt).toMatch(/Hashami Stone/i);
    expect(prompt).toMatch(/Pharaonic/i);
    expect(prompt).toMatch(/Greco-Roman/i);
  });

  it("covers the master architects Hassan Fathy, Lasciac and Mario Rossi", () => {
    const prompt = MASTER_ARCHITECTURAL_SYSTEM_PROMPT;
    expect(prompt).toMatch(/Hassan Fathy/i);
    expect(prompt).toMatch(/Lasciac/i);
    expect(prompt).toMatch(/Mario Rossi/i);
  });

  it("enforces the mandatory 3-panel triptych with the exact three panels", () => {
    const prompt = MASTER_ARCHITECTURAL_SYSTEM_PROMPT;
    expect(prompt).toMatch(/3-Panel/i);
    expect(prompt).toMatch(/Triptych/i);
    expect(prompt).toMatch(/Panel 1/i);
    expect(prompt).toMatch(/Panel 2/i);
    expect(prompt).toMatch(/Panel 3/i);
    expect(prompt).toMatch(/Khedivial Classic/i);
    expect(prompt).toMatch(/Hashami \/ Biophilic/i);
    expect(prompt).toMatch(/Islamic Mashrabiya/i);
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
