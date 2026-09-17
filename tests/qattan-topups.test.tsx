import { readFileSync } from "node:fs";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QattanProviders } from "../components/qattan/QattanProviders";
import TopUpModal from "../components/qattan/TopUpModal";
import {
  CUSTOM_EGP_PER_CREDIT,
  TOPUP_PACKS,
  egpForCustomCredits,
  generateRefCode,
  isValidRefCode,
} from "../lib/topups";

const OWNER_EMAIL = "yusefelshater979@gmail.com";

/**
 * State-driven Supabase mock shared across the server-side suites: the
 * service-role admin client (lib/topups + lib/credits + lib/admin) and the
 * bearer-verification client.
 */
const state = vi.hoisted(() => ({
  adminSession: null as { access_token: string; user: { id: string; email: string | null } } | null,
  serverSession: null as { access_token: string; user: { id: string } } | null,
  browserSession: null as
    | { access_token: string; user: { id: string; email: string | null; user_metadata: Record<string, unknown> } }
    | null,
  rpcResponses: new Map<string, { data: unknown; error: { code?: string; message?: string } | null }>(),
  insertResult: { data: { id: "11111111-2222-4333-8444-555555555555", ref_code: "REF-111222" }, error: null },
  /** Layer-3 anti-replay: rows returned by the receipt-hash lookup. */
  replayRows: [] as { id: string }[],
  clientConfigured: false,
}));

function setRpc(name: string, result: { data: unknown; error: { code?: string; message?: string } | null }) {
  state.rpcResponses.set(name, result);
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const table: Record<string, unknown> = {};
      table.insert = vi.fn(() => ({
        select: () => ({ single: () => Promise.resolve(state.insertResult) }),
      }));
      table.select = vi.fn(() => ({
        eq: () => ({
          eq: () => ({
            select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "r1" }, error: null }) }),
          }),
          // Anti-replay shape: .eq("receipt_hash", h).in("status", [...]).limit(1)
          in: () => ({ limit: () => Promise.resolve({ data: state.replayRows, error: null }) }),
        }),
      }));
      return table;
    }),
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
    rpc: vi.fn((name: string) =>
      Promise.resolve(
        state.rpcResponses.get(name) ?? { data: null, error: null },
      ),
    ),
  })),
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
  return {
    ...actual,
    getSupabaseBrowserClient: () => {
      if (!state.browserSession && !state.clientConfigured) return null;
      return {
        auth: {
          getSession: () => Promise.resolve({ data: { session: state.browserSession } }),
          onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        },
      };
    },
  };
});

function bearerRequest(token: string | null, body?: unknown): Request {
  return new Request("https://qattan.example/api/test", {
    method: "POST",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** A genuine-PNG data URL above the 10KB Layer-1 floor. */
function validReceiptDataUrl(): string {
  const bytes = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(11 * 1024, 7),
  ]);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

/** Stub the vision-engine fetch for the Layer-2 receipt audit. */
function setAuditVerdict(verdict: Record<string, unknown> | null, failUpstream = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string | URL | Request, _init?: RequestInit) => {
      if (failUpstream) return Promise.resolve(new Response("boom", { status: 500 }));
      const text = verdict === null ? "I cannot help with that." : JSON.stringify(verdict);
      return Promise.resolve(
        new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    }),
  );
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
  vi.stubEnv("OPENROUTER_API_KEY", "audit-test-key");
  state.rpcResponses.clear();
  state.insertResult = { data: { id: "11111111-2222-4333-8444-555555555555", ref_code: "REF-111222" }, error: null };
  state.replayRows = [];
});

afterEach(() => {
  state.adminSession = null;
  state.serverSession = null;
  state.browserSession = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Top-up pricing & reference codes (lib/topups)", () => {
  it("prices the fixed packs exactly as specified", () => {
    expect(TOPUP_PACKS).toEqual([
      expect.objectContaining({ credits: 10, amountEgp: 50, egpPerCredit: 5.0 }),
      expect.objectContaining({ credits: 50, amountEgp: 250, egpPerCredit: 5.0 }),
      expect.objectContaining({ credits: 100, amountEgp: 450, egpPerCredit: 4.5 }),
    ]);
  });

  it("prices custom slider credits at 5 EGP", () => {
    expect(CUSTOM_EGP_PER_CREDIT).toBe(5);
    expect(egpForCustomCredits(60)).toBe(300);
    expect(egpForCustomCredits(500)).toBe(2500);
  });

  it("generates unique REF-###### codes in the specified shape", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = generateRefCode();
      expect(isValidRefCode(code)).toBe(true);
      expect(code).toMatch(/^REF-\d{6}$/);
    }
    const codes = new Set(Array.from({ length: 30 }, () => generateRefCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("POST /api/topup/request", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    const response = await POST(
      bearerRequest(null, { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: "data:image/png;base64,AAAA" }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects an amount that disagrees with the server-side price table", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    // 50 credits must cost exactly 250 EGP — a tampered 1 EGP payload is refused.
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 1, paymentMethod: "instapay", receiptDataUrl: "data:image/png;base64,AAAA" }),
    );
    expect(response.status).toBe(400);
  });

  it("rejects non-image receipts via magic-byte validation", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    const fake = `data:image/png;base64,${Buffer.from([0x52, 0x61, 0x72, 0x21]).toString("base64")}`;
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: fake }),
    );
    expect(response.status).toBe(415);
  });

  it("inserts a pending request attributed to the VERIFIED user (never the body)", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "verified-user", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: true, detectedAmount: 450, confidence: "high", reason: "genuine receipt" });
    setRpc("approve_topup", { data: 60, error: null });
    const response = await POST(
      bearerRequest("jwt", { credits: 100, amountEgp: 450, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok?: boolean; refCode?: string; autoApproved?: boolean; creditsRemaining?: number };
    expect(payload.ok).toBe(true);
    expect(payload.refCode).toMatch(/^REF-\d{6}$/);
    expect(payload.autoApproved).toBe(true);
    expect(payload.creditsRemaining).toBe(60);
  });

  it("accepts ONLY InstaPay as the payment method", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    const png = `data:image/png;base64,${Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]).toString("base64")}`;
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "vodafone_cash", receiptDataUrl: png }),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("InstaPay");
  });

  it("rejects an undersized receipt image below the 10KB Layer-1 floor", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    const tiny = `data:image/png;base64,${Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]).toString("base64")}`;
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: tiny }),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("too small");
  });

  it("answers a fake/random image (fails the AI audit) with 422 and no credits", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: false, detectedAmount: 0, confidence: "low", reason: "nature photo" });
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("ليست إيصال تحويل InstaPay صالح");
  });

  it("rejects a low-confidence verdict even when isValidReceipt is true", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: true, detectedAmount: 250, confidence: "low", reason: "blurry" });
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(422);
  });

  it("rejects when the detected amount disagrees with the requested pack", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: true, detectedAmount: 50, confidence: "high", reason: "genuine but different amount" });
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(422);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("does not match the selected pack");
  });

  it("blocks a previously-used receipt with 409 and the replay notice", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: true, detectedAmount: 250, confidence: "high", reason: "genuine receipt" });
    state.replayRows = [{ id: "older-request" }];
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("تم استخدام هذا الإيصال من قبل");
  });

  it("fails closed with 502 when the vision engine is unreachable", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict(null, true);
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(502);
  });

  it("fails closed with 502 when the engine answers non-JSON (no silent pass)", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict(null);
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(502);
  });

  it("keeps the request pending (no auto-approve) when the atomic grant fails", async () => {
    const { POST } = await import("../app/api/topup/request/route");
    state.adminSession = { access_token: "t", user: { id: "u-1", email: "a@b.c" } };
    setAuditVerdict({ isValidReceipt: true, detectedAmount: 250, confidence: "high", reason: "genuine receipt" });
    setRpc("approve_topup", { data: null, error: { code: "P0001", message: "TOPUP_NOT_PENDING" } });
    const response = await POST(
      bearerRequest("jwt", { credits: 50, amountEgp: 250, paymentMethod: "instapay", receiptDataUrl: validReceiptDataUrl() }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok?: boolean; autoApproved?: boolean };
    expect(payload.ok).toBe(true);
    expect(payload.autoApproved).toBe(false);
  });
});

describe("POST /api/topup/promo", () => {
  it("returns 401 for unauthenticated callers", async () => {
    const { POST } = await import("../app/api/topup/promo/route");
    const response = await POST(bearerRequest(null, { code: "QATTAN10" }));
    expect(response.status).toBe(401);
  });

  it("grants credits instantly through the atomic RPC", async () => {
    const { POST } = await import("../app/api/topup/promo/route");
    state.adminSession = { access_token: "t", user: { id: "u-promo", email: "a@b.c" } };
    setRpc("redeem_promo_code", { data: 15, error: null });
    const response = await POST(bearerRequest("jwt", { code: "qattan10" }));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok?: boolean; creditsRemaining?: number };
    expect(payload.ok).toBe(true);
    expect(payload.creditsRemaining).toBe(15);
  });

  it("answers an invalid/exhausted code with 400 and the bilingual message", async () => {
    const { POST } = await import("../app/api/topup/promo/route");
    state.adminSession = { access_token: "t", user: { id: "u-promo", email: "a@b.c" } };
    setRpc("redeem_promo_code", { data: null, error: { code: "P0001", message: "PROMO_INVALID" } });
    const response = await POST(bearerRequest("jwt", { code: "DEAD" }));
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { error?: string };
    expect(payload.error).toContain("Invalid or already-used promo code");
    expect(payload.error).toContain("كود غير صالح");
  });
});

describe("POST /api/admin/topup/approve", () => {
  it("returns 401 anonymous and 403 for non-admin accounts", async () => {
    const { POST } = await import("../app/api/admin/topup/approve/route");
    state.adminSession = null;
    state.serverSession = null;
    const anonymous = await POST(bearerRequest(null, { requestId: "r1", action: "approve" }));
    expect(anonymous.status).toBe(401);

    state.adminSession = { access_token: "t", user: { id: "rand", email: "random@gmail.com" } };
    const forbidden = await POST(bearerRequest("jwt", { requestId: "r1", action: "approve" }));
    expect(forbidden.status).toBe(403);
  });

  it("approves through the atomic RPC for the owner account", async () => {
    const { POST } = await import("../app/api/admin/topup/approve/route");
    state.adminSession = { access_token: "t", user: { id: "owner-1", email: OWNER_EMAIL } };
    setRpc("approve_topup", { data: 60, error: null });
    const response = await POST(
      bearerRequest("jwt", { requestId: "9f1d3a20-1111-4222-8333-444455556666", action: "approve" }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok?: boolean; creditsRemaining?: number };
    expect(payload.ok).toBe(true);
    expect(payload.creditsRemaining).toBe(60);
  });

  it("reports an already-handled request as 409 (no double credit)", async () => {
    const { POST } = await import("../app/api/admin/topup/approve/route");
    state.adminSession = { access_token: "t", user: { id: "owner-1", email: OWNER_EMAIL } };
    setRpc("approve_topup", { data: null, error: { code: "P0001", message: "TOPUP_NOT_PENDING" } });
    const response = await POST(
      bearerRequest("jwt", { requestId: "9f1d3a20-1111-4222-8333-444455556666", action: "approve" }),
    );
    expect(response.status).toBe(409);
  });
});

describe("Migration contract — 20260914_qattan_topups.sql", () => {
  const sql = readFileSync("supabase/migrations/20260914_qattan_topups.sql", "utf8");

  it("creates both tables with the specified columns", () => {
    expect(sql).toContain("create table if not exists public.topup_requests");
    expect(sql).toContain("credits integer not null");
    expect(sql).toContain("amount_egp numeric(12, 2)");
    expect(sql).toContain("payment_method text not null");
    expect(sql).toContain("receipt_url text");
    expect(sql).toMatch(/status text not null default 'pending'/);
    expect(sql).toContain("ref_code text not null");
    expect(sql).toContain("create table if not exists public.promo_codes");
    expect(sql).toMatch(/used_count integer not null default 0/);
    expect(sql).toMatch(/max_uses integer not null default 1/);
    expect(sql).toMatch(/active boolean not null default true/);
  });

  it("approves atomically: only a pending row pays out, exactly once", () => {
    expect(sql).toContain("create function public.approve_topup(p_request_id uuid)");
    // Guarded claim of the pending row — later approvers update zero rows.
    expect(sql).toMatch(/status = 'pending'\s*\n\s*returning \* into req;/);
    expect(sql).toMatch(/credits = credits \+ req\.credits/);
    expect(sql).toMatch(/raise exception 'TOPUP_NOT_PENDING'/);
    // Service-role only, like the credit engine.
    expect(sql).toContain("grant execute on function public.approve_topup(uuid) to service_role;");
    expect(sql).toContain("revoke execute on function public.approve_topup(uuid) from public, anon, authenticated;");
  });

  it("redeems promo codes atomically within max_uses and normalizes case", () => {
    expect(sql).toContain("create function public.redeem_promo_code(p_code text, p_user_id uuid)");
    expect(sql).toMatch(/code = upper\(trim\(p_code\)\)/);
    expect(sql).toMatch(/used_count < max_uses/);
    expect(sql).toMatch(/used_count = used_count \+ 1/);
    expect(sql).toContain("grant execute on function public.redeem_promo_code(text, uuid) to service_role;");
  });

  it("keeps promo codes invisible to anon/authenticated and enables RLS", () => {
    expect(sql).toContain("alter table public.topup_requests enable row level security;");
    expect(sql).toContain("alter table public.promo_codes enable row level security;");
    expect(sql).toContain("revoke all on public.promo_codes from anon, authenticated;");
  });
});

describe("Admin queue surface", () => {
  it("exposes the pending queue through /api/admin/stats (service-role read)", async () => {
    // The stats route must include the topup queue loader behind the admin gate.
    const source = readFileSync("app/api/admin/stats/route.ts", "utf8");
    expect(source).toContain("loadPendingTopups");
    expect(source).toContain('from("topup_requests")');
    expect(source.indexOf("authorizeAdmin(request, admin)")).toBeLessThan(
      source.indexOf("loadPendingTopups(admin)"),
    );
  });

  it("renders the queue with approve/reject controls on /admin", async () => {
    const page = readFileSync("app/admin/page.tsx", "utf8");
    expect(page).toContain('data-testid="admin-topup-queue"');
    expect(page).toContain('"/api/admin/topup/approve"');
    expect(page).toContain('"approve"');
    expect(page).toContain('"reject"');
    expect(page).toContain("previewReceipt");
  });
});

describe("TopUpModal surface (InstaPay exclusively)", () => {
  it("renders packs, slider, the InstaPay handle + QR, direct link, warning, and promo box when opened", async () => {
    state.clientConfigured = true;
    render(
      <QattanProviders locale="en">
        <TopUpModal open onClose={() => {}} />
      </QattanProviders>,
    );

    expect(screen.getByText("Top Up Credits")).toBeInTheDocument();
    expect(screen.getByText("50 EGP")).toBeInTheDocument();
    expect(screen.getByText("450 EGP")).toBeInTheDocument();
    // The exclusive IPA handle is displayed, with the QR right beside it.
    expect(screen.getByText("ahmedelqattan78@instapay")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /InstaPay transfer QR code/i })).toBeInTheDocument();
    // The official direct transfer link is clickable and copyable.
    const directLink = screen.getByRole("link", { name: /ipn\.eg\/S\/ahmedelqattan78/i });
    expect(directLink).toHaveAttribute("href", "https://ipn.eg/S/ahmedelqattan78/instapay/9RkGnD");
    expect(directLink).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: /Copy transfer link/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Copy InstaPay address/i })).toBeInTheDocument();
    expect(screen.getByText(/Reference code/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter promo code")).toBeInTheDocument();
    // Pack labels are shown (Student Pack selected by default).
    expect(screen.getByText("Student Pack")).toBeInTheDocument();
    expect(screen.getByText("Pro Pack")).toBeInTheDocument();
    // Reference code is always present and well-formed.
    const ref = screen.getAllByText(/^REF-\d{6}$/)[0];
    expect(ref).toBeTruthy();
    // AI anti-fraud security warning is visible.
    expect(screen.getByText(/Security notice: receipts are verified by AI/i)).toBeInTheDocument();
  });

  it("shows NO mobile-wallet rails — InstaPay is the only payment method", () => {
    state.clientConfigured = true;
    render(
      <QattanProviders locale="en">
        <TopUpModal open onClose={() => {}} />
      </QattanProviders>,
    );
    expect(screen.queryByText(/Vodafone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Orange Cash/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/wallet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/010XXXXXXX/)).not.toBeInTheDocument();
    // The payment header states exclusivity explicitly.
    expect(screen.getByText(/Payment instructions \(InstaPay only\)/i)).toBeInTheDocument();
  });

  it("shows the bilingual submit gate when no receipt is attached yet", async () => {
    state.clientConfigured = true;
    render(
      <QattanProviders locale="en">
        <TopUpModal open onClose={() => {}} />
      </QattanProviders>,
    );
    const submit = screen.getByRole("button", { name: /Submit request/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });

  it("uploads a receipt and submits the request with bearer auth", async () => {
    state.browserSession = {
      access_token: "browser-token",
      user: { id: "u-1", email: OWNER_EMAIL, user_metadata: {} },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/topup/request")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, refCode: "REF-990011" }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <QattanProviders locale="en">
        <TopUpModal open onClose={() => {}} />
      </QattanProviders>,
    );

    // Attach a real PNG receipt through the file input.
    const input = document.querySelector('.qattan-topup-upload input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "receipt.png", {
      type: "image/png",
    });
    await fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(screen.getByRole("button", { name: /Submit request/ })).not.toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: /Submit request/ }));

    await waitFor(() => expect(screen.getByText(/Request sent with reference REF-990011/)).toBeInTheDocument());

    const call = fetchMock.mock.calls.find((entry) => String(entry[0]).includes("/api/topup/request"));
    expect(call).toBeTruthy();
    const init = call?.[1];
    expect(init).toBeTruthy();
    expect(((init?.headers ?? {}) as Record<string, string>).Authorization).toBe("Bearer browser-token");
    const sent = JSON.parse(String(init?.body)) as { credits: number; amountEgp: number };
    expect(sent.credits).toBeGreaterThan(0);
    expect(sent.amountEgp).toBeGreaterThan(0);
  });

  it("redeems a promo code and broadcasts the new balance to the header badge", async () => {
    state.browserSession = {
      access_token: "browser-token",
      user: { id: "u-1", email: OWNER_EMAIL, user_metadata: {} },
    };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("/api/topup/promo")) {
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true, creditsRemaining: 65, message: "Promo applied!" }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const listener = vi.fn();
    window.addEventListener("qattan:credits", listener);

    render(
      <QattanProviders locale="en">
        <TopUpModal open onClose={() => {}} />
      </QattanProviders>,
    );

    fireEvent.change(screen.getByPlaceholderText("Enter promo code"), { target: { value: "qattan15" } });
    fireEvent.click(screen.getByRole("button", { name: "Redeem" }));

    await waitFor(() => expect(screen.getByText("Promo applied!")).toBeInTheDocument());
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toBe(65);
    window.removeEventListener("qattan:credits", listener);
  });
});
