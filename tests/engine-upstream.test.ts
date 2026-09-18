import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FALLBACK_OPENROUTER_MODEL,
  OPENROUTER_MODEL,
  executeRestore,
} from "../lib/openrouter-engine";

/**
 * Production-incident contract: a provider 403 must NEVER reach the browser.
 * Before the fix, the engine relayed upstream.status verbatim, so an OpenRouter
 * key-level 403 surfaced to users as a raw 403 from /api/restore — while auth,
 * credits, and deduction had all succeeded (the credit was refunded).
 */

const PAYLOAD = { imageDataUrl: "data:image/png;base64,AAAA", prompt: "modern villa" };

/** A successful image-generation response body (choices[].message.images shape). */
function successBody() {
  return {
    choices: [
      {
        message: {
          images: [{ image_url: { url: "data:image/png;base64,UkVTVUxU" } }],
        },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("upstream 403 is never relayed to the browser", () => {
  it("maps a provider 403 to 502 + the proprietary busy message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
      ),
    );
    const result = await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k1" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.message).toContain("Qattan Architectural Engine is currently busy");
      expect(result.message).not.toMatch(/forbidden|openrouter/i);
    }
  });

  it("maps provider 401/402/429/5xx to 502 as well — no upstream status leaks", async () => {
    for (const status of [401, 402, 429, 500, 503]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { message: "nope" } }), { status }),
        ),
      );
      const result = await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k2" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(502);
    }
  });

  it("logs [ENGINE_UPSTREAM] with the status for server-side triage", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Key limit exceeded" } }), { status: 403 }),
      ),
    );
    await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k3" });
    expect(logSpy.mock.calls.some((args) => String(args[0]).includes("[ENGINE_UPSTREAM]"))).toBe(
      true,
    );
    expect(
      logSpy.mock.calls.some((args) => String(args[0]).includes('"class":"account_credits"')),
    ).toBe(true);
  });
});

describe("fallback image model", () => {
  it("declares a secondary image model distinct from the primary", () => {
    expect(FALLBACK_OPENROUTER_MODEL).toBeTruthy();
    expect(FALLBACK_OPENROUTER_MODEL).not.toBe(OPENROUTER_MODEL);
  });

  it("retries on the fallback model after a key-level rejection and SUCCEEDS", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(successBody()), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k4" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.imageDataUrl).toMatch(/^data:image\//);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1][1].body)) as { model?: string };
    expect(secondBody.model).toBe(FALLBACK_OPENROUTER_MODEL);
  });

  it("still fails with the busy message when the fallback model also rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
      ),
    );
    const result = await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k5" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.message).toContain("currently busy");
    }
  });

  it("does NOT waste the fallback attempt on client errors like 400", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad request" } }), { status: 400 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeRestore(PAYLOAD, { apiKey: "test-key", clientKey: "k6" });
    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
