import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Client auth contract: the generation request must always carry a VALID
 * bearer token — expired cached sessions are refreshed BEFORE the POST, so
 * an hour-old login never produces a 401/403 mid-session.
 */

type SessionShape = {
  access_token: string;
  expires_at?: number; // epoch seconds
} | null;

/** Builds a Supabase browser client double with configurable session state. */
function makeSupabaseMock(initial: SessionShape, refreshed: SessionShape = null) {
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: initial }, error: null })),
      refreshSession: vi.fn(async () => ({
        data: { session: refreshed },
        error: refreshed ? null : { message: "refresh failed" },
      })),
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../lib/supabase");
});

async function loadWithClient(mock: ReturnType<typeof makeSupabaseMock>) {
  // The restore module imports "../../../lib/supabase" — from THIS test file
  // the specifier for doMock must resolve to the same module: "../lib/supabase".
  vi.doMock("../lib/supabase", () => ({
    getSupabaseBrowserClient: () => mock,
    supabaseEnvConfigured: () => true,
    AuthRequiredError: class AuthRequiredError extends Error {
      constructor() {
        super("Sign in with Google to generate.");
        this.name = "AuthRequiredError";
      }
    },
    QATTAN_AUTH_REQUIRED_EVENT: "qattan:auth-required",
  }));
  return (await import("../client/src/lib/restore")).restoreFacade;
}

describe("client token auto-refresh before generation", () => {
  it("refreshes an EXPIRED cached token and sends the fresh bearer token", async () => {
    const mock = makeSupabaseMock(
      { access_token: "stale-token", expires_at: Math.floor(Date.now() / 1000) - 60 },
      { access_token: "fresh-token", expires_at: Math.floor(Date.now() / 1000) + 3600 },
    );
    const restoreFacade = await loadWithClient(mock);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU", creditsRemaining: 9 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({ imageDataUrl: "data:image/jpeg;base64,AAAA", prompt: "x" });

    expect(mock.auth.refreshSession).toHaveBeenCalledTimes(1);
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fresh-token");
  });

  it("sends the cached token untouched while it is still VALID (no refresh)", async () => {
    const mock = makeSupabaseMock({
      access_token: "live-token",
      expires_at: Math.floor(Date.now() / 1000) + 1800,
    });
    const restoreFacade = await loadWithClient(mock);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({ imageDataUrl: "data:image/jpeg;base64,AAAA", prompt: "x" });

    expect(mock.auth.refreshSession).not.toHaveBeenCalled();
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer live-token");
  });

  it("dispatches the auth-required event and throws when refresh yields no session", async () => {
    const mock = makeSupabaseMock({ access_token: "stale", expires_at: 1 }, null);
    const restoreFacade = await loadWithClient(mock);

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      restoreFacade({ imageDataUrl: "data:image/jpeg;base64,AAAA", prompt: "x" }),
    ).rejects.toThrow(/sign in/i);
    expect(mock.auth.refreshSession).toHaveBeenCalledTimes(1);
    // No request may leave the browser without a token.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("server rejection-reason logging contract", () => {
  it("labels every rejection class with [RESTORE_403_REASON] for log triage", () => {
    const route = readFileSync("app/api/restore/route.ts", "utf8");
    // Four distinct failure classes: origin (403), missing token (401),
    // rejected token (401 — shared log line), missing admin client (503).
    expect(route.match(/RESTORE_403_REASON/g)?.length).toBe(3);
    expect(route).toContain('reason: "origin_rejected"');
    expect(route).toContain('reason: "service_role_error"');
    // Auth failures distinguish a missing token from a rejected one.
    expect(route).toContain('? "auth_verification_failed"');
    expect(route).toContain(': "missing_bearer_token"');
    // Origin rejections are still 403; auth failures 401; missing admin 503.
    expect(route).toContain("status: 403");
    expect(route).toContain("status: 401");
    expect(route).toContain("status: 503");
  });
});
