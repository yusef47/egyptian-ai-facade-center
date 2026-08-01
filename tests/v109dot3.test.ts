import { describe, expect, it } from "vitest";
import { buildSuccessResponse, maxDuration } from "../api/restore.js";

describe("V109.3 restore response contract", () => {
  it("returns clean JSON with the imageUrl key", () => {
    const payload = buildSuccessResponse("data:image/png;base64,ZmFrZS1vdXRwdXQ=");
    expect(payload).toEqual({
      imageUrl: "data:image/png;base64,ZmFrZS1vdXRwdXQ=",
    });
    expect(payload.imageUrl).toBe("data:image/png;base64,ZmFrZS1vdXRwdXQ=");
  });

  it("keeps the extended serverless max duration export", () => {
    expect(maxDuration).toBe(60);
  });
});
