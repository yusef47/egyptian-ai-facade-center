import { describe, expect, it } from "vitest";
import {
  CAD_SYSTEM_PROMPT,
  OPENROUTER_MODEL,
  buildOpenRouterRequest,
} from "../server/openrouter-engine";

describe("Qattan restore engine contract", () => {
  it("keeps CAD mode and the zero-text prompt server-side", () => {
    const request = buildOpenRouterRequest(
      "data:image/png;base64,abc",
      "Generate the views",
      "server-secret",
      { mode: "cad" },
    );
    const body = JSON.parse(String(request.init.body)) as { model: string; messages: unknown[] };

    expect(body.model).toBe(OPENROUTER_MODEL);
    expect(JSON.stringify(body)).toContain("ABSOLUTELY ZERO LETTERS OR NUMBERS");
    expect(CAD_SYSTEM_PROMPT).not.toContain("server-secret");
    expect(JSON.stringify(body)).not.toContain("server-secret");
  });
});
