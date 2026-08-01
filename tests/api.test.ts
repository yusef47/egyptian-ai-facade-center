import { describe, expect, it } from "vitest";
import {
  buildOpenRouterRequest,
  extractImageData,
} from "../src/lib/openrouter";

describe("OpenRouter facade proxy helpers", () => {
  it("builds a multimodal request for the exact image model", () => {
    const request = buildOpenRouterRequest(
      "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==",
      "Restore the facade with warm limestone and mashrabiya.",
      "server-secret",
    );

    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(request.init.method).toBe("POST");
    expect(request.init.headers).toEqual({
      Authorization: "Bearer server-secret",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(request.init.body));
    expect(body.model).toBe("google/gemini-3.1-flash-lite-image");
    expect(body.modalities).toEqual(["image", "text"]);
    expect(body.messages[0].content).toEqual([
      {
        type: "text",
        text: "Restore the facade with warm limestone and mashrabiya.",
      },
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,ZmFrZS1pbWFnZQ==" },
      },
    ]);
  });

  it("extracts a generated image from an image array", () => {
    expect(
      extractImageData({
        images: [{ b64_json: "ZmFrZS1vdXRwdXQ=" }],
      }),
    ).toBe("data:image/png;base64,ZmFrZS1vdXRwdXQ=");
  });

  it("extracts a generated image from a message content part", () => {
    expect(
      extractImageData({
        choices: [
          {
            message: {
              content: [
                {
                  type: "image_url",
                  image_url: {
                    url: "data:image/png;base64,ZmFrZS1vdXRwdXQ=",
                  },
                },
              ],
            },
          },
        ],
      }),
    ).toBe("data:image/png;base64,ZmFrZS1vdXRwdXQ=");
  });

  it("extracts an image nested directly on the assistant message", () => {
    expect(
      extractImageData({
        choices: [
          {
            message: {
              images: [{ b64_json: "ZmFrZS1vdXRwdXQ=" }],
            },
          },
        ],
      }),
    ).toBe("data:image/png;base64,ZmFrZS1vdXRwdXQ=");
  });
});
