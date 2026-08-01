import { describe, expect, it } from "vitest";
import { config, maxDuration } from "../api/restore.js";
import { OPENROUTER_MODEL } from "../src/lib/openrouter.js";

describe("V109.2 serverless timeout and payload configuration", () => {
  it("exports an extended serverless max duration", () => {
    expect(maxDuration).toBe(60);
    expect(config.maxDuration).toBe(60);
  });

  it("raises the request body parser limit to 10mb", () => {
    expect(config.api.bodyParser.sizeLimit).toBe("10mb");
  });

  it("uses the exact fast image model slug", () => {
    expect(OPENROUTER_MODEL).toBe("google/gemini-3.1-flash-lite-image");
  });
});
