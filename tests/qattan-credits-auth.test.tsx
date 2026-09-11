import { readFileSync } from "node:fs";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QATTAN_CREDITS_EVENT, restoreFacade } from "../client/src/lib/restore";
import { authorizeAdmin } from "../lib/admin";
import {
  checkGenerationCredits,
  getSupabaseAdminClient,
  verifySupabaseUser,
} from "../lib/credits";
import { QattanProviders } from "../components/qattan/QattanProviders";
import AuthButton from "../components/qattan/AuthButton";

const OWNER_EMAIL = "yusefelshater979@gmail.com";

/**
 * One state-driven Supabase mock serves every role in the flow: the
 * service-role admin client (lib/credits + lib/admin), the bearer-verification
 * client (supabase-js), the cookie-verification client (@supabase/ssr), and
 * the browser session client (lib/supabase). Tests flip module state instead
 * of re-mocking.
 */
const state = vi.hoisted(() => ({
  adminSession: null as { access_token: string; user: { id: string; email: string | null } } | null,
  serverSession: null as { access_token: string; user: { id: string } } | null,
  browserSession: null as
    | { access_token: string; user: { id: string; email: string | null; user_metadata: Record<string, unknown> } }
    | null,
  profile: null as { credits: number; email: string | null } | null,
  rpcOk: true,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => {
    const builder: Record<string, unknown> = {};
    const chain = () => {
      builder.select = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.update = vi.fn(() => builder);
      builder.maybeSingle = vi.fn(() => Promise.resolve({ data: state.profile, error: null }));
      return builder;
    };
    return {
      auth: {
        getUser: () =>
          Promise.resolve(
            state.adminSession
              ? { data: { user: { id: state.adminSession.user.id, email: state.adminSession.user.email } }, error: null }
              : { data: { user: null }, error: null },
          ),
        admin: {
          getUserById: (userId: string) =>
            Promise.resolve(
              state.adminSession && state.adminSession.user.id === userId
                ? { data: { user: { id: userId, email: state.adminSession.user.email } }, error: null }
                : { data: { user: null }, error: null },
            ),
        },
      },
      from: vi.fn(() => chain()),
      rpc: vi.fn(() =>
        Promise.resolve(state.rpcOk ? { data: 4, error: null } : { data: null, error: { code: "P0001" } }),
      ),
    };
  }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: () =>
        Promise.resolve(
          state.serverSession
            ? { data: { user: { id: state.serverSession.user.id } }, error: null }
            : { data: { user: null }, error: null },
        ),
    },
  })),
  createBrowserClient: vi.fn(() => null),
}));

vi.mock("../lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/supabase")>();
  let browserSingleton: unknown = null;
  return {
    ...actual,
    getSupabaseBrowserClient: () => {
      if (!state.browserSession) return null;
      if (!browserSingleton) {
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn(() => builder);
        builder.eq = vi.fn(() => builder);
        builder.maybeSingle = vi.fn(() => Promise.resolve({ data: state.profile, error: null }));
        browserSingleton = {
          auth: {
            getSession: () => Promise.resolve({ data: { session: state.browserSession } }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
          },
          from: vi.fn(() => builder),
        };
      }
      return browserSingleton;
    },
  };
});

function bearerRequest(token: string | null): Request {
  return new Request("https://qattan.example/api/restore", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe("Frontend restore — Supabase bearer token & credit balance relay", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    state.browserSession = null;
  });

  it("attaches the Authorization header when a session exists", async () => {
    state.browserSession = {
      access_token: "test-access-token",
      user: { id: "u-1", email: "a@b.c", user_metadata: {} },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "data:image/png;base64,AAAA", creditsRemaining: 9 }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-access-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("omits the Authorization header when signed out", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "data:image/png;base64,AAAA" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("broadcasts the returned remaining balance so the header counter updates live", async () => {
    state.browserSession = {
      access_token: "test-access-token",
      user: { id: "u-1", email: "a@b.c", user_metadata: {} },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ imageDataUrl: "data:image/png;base64,AAAA", creditsRemaining: 7 }), {
          status: 200,
        }),
      ),
    );

    const listener = vi.fn();
    window.addEventListener(QATTAN_CREDITS_EVENT, listener);
    await restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" });
    window.removeEventListener(QATTAN_CREDITS_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    // Event contract: detail IS the new balance (bare number) — 10 -> 7 sync.
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe(7);
  });

  it("syncs the header counter with the post-refund balance on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Generation failed.", creditsRemaining: 10 }), {
          status: 502,
        }),
      ),
    );

    const listener = vi.fn();
    window.addEventListener(QATTAN_CREDITS_EVENT, listener);
    await expect(
      restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" }),
    ).rejects.toThrow("Generation failed.");
    window.removeEventListener(QATTAN_CREDITS_EVENT, listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe(10);
  });

  it("propagates the server error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "Daily credit limit reached." }), { status: 429 }),
      ),
    );
    await expect(
      restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" }),
    ).rejects.toThrow("Daily credit limit reached.");
  });
});

describe("Server auth — bearer token verification", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  });

  it("resolves the user id from a valid bearer token", async () => {
    state.adminSession = { access_token: "t", user: { id: "user-bearer", email: "a@b.c" } };
    const userId = await verifySupabaseUser(bearerRequest("any-jwt"));
    expect(userId).toBe("user-bearer");
  });

  it("returns null without any credentials (bearer or cookie)", async () => {
    state.adminSession = null;
    state.serverSession = null;
    const userId = await verifySupabaseUser(bearerRequest(null));
    expect(userId).toBeNull();
  });

  it("falls back to the cookie session when no bearer token is sent", async () => {
    state.adminSession = null;
    state.serverSession = { access_token: "cookie-token", user: { id: "user-cookie" } };
    const userId = await verifySupabaseUser(bearerRequest(null));
    expect(userId).toBe("user-cookie");
  });

  it("falls back to the cookie session when the bearer token is invalid", async () => {
    state.adminSession = null;
    state.serverSession = { access_token: "cookie-token", user: { id: "user-cookie" } };
    const userId = await verifySupabaseUser(bearerRequest("expired-jwt"));
    expect(userId).toBe("user-cookie");
  });
});

describe("Credit gate on /api/restore", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  });

  it("allows a signed-in caller with a positive daily balance", async () => {
    state.adminSession = { access_token: "t", user: { id: "user-1", email: "a@b.c" } };
    state.profile = { credits: 7, email: "a@b.c" };
    const result = await checkGenerationCredits(bearerRequest("jwt"));
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.remaining).toBe(7);
  });

  it("blocks a signed-in caller whose balance reached zero (429)", async () => {
    state.adminSession = { access_token: "t", user: { id: "user-1", email: "a@b.c" } };
    state.profile = { credits: 0, email: "a@b.c" };
    const result = await checkGenerationCredits(bearerRequest("jwt"));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(429);
  });

  it("blocks anonymous callers (401)", async () => {
    state.adminSession = null;
    state.serverSession = null;
    const result = await checkGenerationCredits(bearerRequest(null));
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(401);
  });
});

describe("Admin gate", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  });

  it("authorizes the owner account", async () => {
    state.adminSession = { access_token: "t", user: { id: "owner-1", email: OWNER_EMAIL } };
    state.profile = { credits: 3, email: OWNER_EMAIL };
    const gate = await authorizeAdmin(bearerRequest("jwt"), getSupabaseAdminClient()!);
    expect(gate.authorized).toBe(true);
  });

  it("rejects authenticated non-admin accounts (403 semantics)", async () => {
    state.adminSession = { access_token: "t", user: { id: "rand-1", email: "random@gmail.com" } };
    state.profile = { credits: 3, email: "random@gmail.com" };
    const gate = await authorizeAdmin(bearerRequest("jwt"), getSupabaseAdminClient()!);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) expect(gate.reason).toBe("forbidden");
  });

  it("rejects anonymous visitors (401 semantics)", async () => {
    state.adminSession = null;
    state.serverSession = null;
    const gate = await authorizeAdmin(bearerRequest(null), getSupabaseAdminClient()!);
    expect(gate.authorized).toBe(false);
    if (!gate.authorized) expect(gate.reason).toBe("unauthenticated");
  });
});

describe("Admin stats route authorization", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  });

  it("returns 401 for anonymous access and 403 for non-admin accounts", async () => {
    const { GET } = await import("../app/api/admin/stats/route");

    state.adminSession = null;
    state.serverSession = null;
    const anonymous = await GET(bearerRequest(null));
    expect(anonymous.status).toBe(401);

    state.adminSession = { access_token: "t", user: { id: "rand-1", email: "random@gmail.com" } };
    state.profile = { credits: 3, email: "random@gmail.com" };
    const forbidden = await GET(bearerRequest("jwt"));
    expect(forbidden.status).toBe(403);
  });

  it("returns stats for the owner account", async () => {
    const { GET } = await import("../app/api/admin/stats/route");
    state.adminSession = { access_token: "t", user: { id: "owner-1", email: OWNER_EMAIL } };
    state.profile = { credits: 3, email: OWNER_EMAIL };

    const response = await GET(bearerRequest("jwt"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      configured: boolean;
      stats: { totalUsers: number; totalGenerations: number; totalCreditsRemaining: number; activeUsers: number };
    };
    expect(payload.configured).toBe(true);
    expect(payload.stats).toEqual(
      expect.objectContaining({
        totalUsers: expect.any(Number),
        totalGenerations: expect.any(Number),
        totalCreditsRemaining: expect.any(Number),
        activeUsers: expect.any(Number),
      }),
    );
  });
});

describe("Header credit counter updates live after generation", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    state.browserSession = {
      access_token: "browser-token",
      user: { id: "owner-1", email: OWNER_EMAIL, user_metadata: { full_name: "Owner" } },
    };
    state.profile = { credits: 7, email: OWNER_EMAIL };
  });

  afterEach(() => {
    state.browserSession = null;
  });

  it("shows the real database balance on mount, not the 10-credit default", async () => {
    render(
      <QattanProviders locale="en">
        <AuthButton />
      </QattanProviders>,
    );

    await waitFor(() => expect(document.querySelector(".qattan-auth-credits")).not.toBeNull());
    expect(document.querySelector(".qattan-auth-credits")?.textContent).toContain("7");
  });

  it("applies the broadcast balance immediately after a generation", async () => {
    render(
      <QattanProviders locale="en">
        <AuthButton />
      </QattanProviders>,
    );

    await waitFor(() => expect(document.querySelector(".qattan-auth-credits")).not.toBeNull());
    expect(document.querySelector(".qattan-auth-credits")?.textContent).toContain("7");

    // /api/restore returns creditsRemaining: 5; restore.ts re-broadcasts it as
    // the bare new balance. The badge must follow it without a page refresh.
    state.profile = { credits: 5, email: OWNER_EMAIL };
    window.dispatchEvent(new CustomEvent(QATTAN_CREDITS_EVENT, { detail: 5 }));

    await waitFor(() =>
      expect(document.querySelector(".qattan-auth-credits")?.textContent).toContain("5"),
    );
  });

  it("still updates when the profiles read is unavailable (payload is authoritative)", async () => {
    render(
      <QattanProviders locale="en">
        <AuthButton />
      </QattanProviders>,
    );

    await waitFor(() => expect(document.querySelector(".qattan-auth-credits")).not.toBeNull());

    // A null/errored profile read must never clobber or block the update —
    // the server-computed balance wins.
    state.profile = null;
    window.dispatchEvent(new CustomEvent(QATTAN_CREDITS_EVENT, { detail: 5 }));

    await waitFor(() =>
      expect(document.querySelector(".qattan-auth-credits")?.textContent).toContain("5"),
    );
  });
});

describe("Admin dashboard surface & migration contract", () => {
  it("renders the /admin page with gate and metric structure", async () => {
    vi.doMock("../lib/supabase", () => ({
      ...vi.importActual<typeof import("../lib/supabase")>("../lib/supabase"),
      getSupabaseBrowserClient: () => null,
    }));
    const AdminPage = (await import("../app/admin/page")).default;
    const { container } = render(<AdminPage />);
    expect(container.querySelector('[data-testid="admin-dashboard"]')).not.toBeNull();
    vi.doUnmock("../lib/supabase");
  });

  it("keeps the migration aligned with the credit + admin RPC contract", () => {
    const sql = readFileSync("supabase/migrations/20260910_qattan_profiles.sql", "utf8");
    expect(sql).toContain("public.deduct_credit(user_id uuid, p_amount integer default 1)");
    // Postgres cannot rename an input parameter via CREATE OR REPLACE, so the
    // migration must drop the old signature first and flush the PostgREST
    // schema cache — otherwise a re-run leaves the deployed function uncallable.
    expect(sql).toContain("drop function if exists public.deduct_credit(uuid, integer);");
    expect(sql).toContain("notify pgrst, 'reload schema';");
    // The credit engine is callable only by the service-role server client.
    expect(sql).toContain(
      "revoke execute on function public.deduct_credit(uuid, integer) from public, anon, authenticated;",
    );
    expect(sql).toContain("grant execute on function public.deduct_credit(uuid, integer) to service_role;");
    // Hardened: exactly -1 credit / +1 generation, and non-1 amounts rejected.
    expect(sql).toContain("generations_used = generations_used + 1");
    expect(sql).toMatch(/p_amount <> 1/);
    expect(sql).toMatch(/raise exception 'INSUFFICIENT_CREDITS'/);
    expect(sql).toMatch(/CREDIT_DEDUCTION user=% old=% new=%/);
    const adminSql = readFileSync("supabase/migrations/20260910_qattan_admin.sql", "utf8");
    expect(adminSql).toContain("admin_platform_stats");
    expect(adminSql).toContain("admin_recent_profiles");
  });
});
