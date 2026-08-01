import { describe, expect, it } from "vitest";
import { extractImageData } from "../src/lib/openrouter";
import { compressImageDataUrl } from "../src/lib/optimize";

describe("V109.4 response-size strategy", () => {
  it("prefers a hosted URL over base64 when both are present", () => {
    const found = extractImageData({
      images: [
        {
          b64_json: "ZmFrZS1vdXRwdXQ=",
          url: "https://example.com/restored-facade.png",
        },
      ],
    });
    expect(found).toBe("https://example.com/restored-facade.png");
  });

  it("parses markdown image URLs from message content", () => {
    const found = extractImageData({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "Here is the result:" },
              { type: "text", text: "![image](https://example.com/facade.png)" },
            ],
          },
        },
      ],
    });
    expect(found).toBe("https://example.com/facade.png");
  });

  it("returns small base64 unchanged and only compresses oversized payloads", async () => {
    const small = "data:image/png;base64,ZmFrZS1vdXRwdXQ=";
    expect(await compressImageDataUrl(small)).toBe(small);
  });

  it("passes through hosted URLs without compression", async () => {
    const url = "https://example.com/facade.png";
    expect(await compressImageDataUrl(url)).toBe(url);
  });
});
