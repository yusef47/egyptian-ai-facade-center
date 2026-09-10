import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  checkGenerationCredits,
  deductGenerationCreditWithAdmin,
  refreshDailyCredits,
} from "../lib/credits";
import { DAILY_CREDITS, CREDIT_REFRESH_MS, getSupabaseBrowserClient } from "../lib/supabase";
import {
  NO_WATERMARK_CLAUSE,
  buildOpenRouterRequest,
} from "../lib/openrouter-engine";
import { buildSyndicateReport } from "../client/src/lib/report";
import { QATTAN_TOOLS } from "../tools/registry";
import { qattanCopy } from "../components/qattan/qattan-content";
import { QattanProviders } from "../components/qattan/QattanProviders";
import AuthButton from "../components/qattan/AuthButton";

describe("Rebrand — zero Gemini mentions in user-facing surfaces", () => {
  it("ships no literal Gemini anywhere a user could see it", () => {
    const userFacingFiles = [
      "components/qattan/qattan-content.ts",
      "components/qattan/HeroShowreel.tsx",
      "components/qattan/ToolPreviewModal.tsx",
      "components/qattan/ToolShowcase.tsx",
      "components/qattan/QattanHero.tsx",
      "components/qattan/QattanMarketingPage.tsx",
      "components/qattan/QattanHeader.tsx",
      "components/qattan/AuthButton.tsx",
      "components/qattan/ToolWorkspace.tsx",
      "components/qattan/StudioViewport.tsx",
      "components/qattan/StudioControlRail.tsx",
      "components/qattan/QattanStudio.tsx",
      "components/qattan/BeforeAfterSlider.tsx",
      "README.md",
      "VERCEL_WEB_APP.md",
    ];
    for (const file of userFacingFiles) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} still mentions Gemini`).not.toMatch(/gemini/i);
    }
  });

  it("keeps every registry tool free of vendor mentions", () => {
    expect(JSON.stringify(QATTAN_TOOLS)).not.toMatch(/gemini/i);
  });

  it("keeps the shared engine prompts and clauses free of vendor mentions", () => {
    expect(NO_WATERMARK_CLAUSE).not.toMatch(/gemini/i);
  });

  it("brands generated-file metadata as Qattan Vision v4.2", () => {
    const report = buildSyndicateReport({
      prompt: "Restore in Khedivial style",
      imageDataUrl: "data:image/png;base64,AAAA",
    });
    expect(report.model).toBe("Qattan Vision v4.2");
  });
});

describe("Rebrand — bilingual copy uses proprietary branding", () => {
  it("presents the Qattan Architectural Engine in both locales", () => {
    expect(qattanCopy.en.hero.powered).toContain("Qattan Architectural Engine");
    expect(qattanCopy.ar.hero.powered).toContain("محرك قطان المعماري");
    expect(qattanCopy.en.studio.model).toContain("Qattan Vision v4.2");
    expect(qattanCopy.ar.studio.model).toContain("الرؤية 4.2");
    expect(JSON.stringify(qattanCopy)).not.toMatch(/gemini/i);
  });
});

describe("Zero-watermark guarantee", () => {
  it("appends the no-watermark clause to every system-prompt mode", () => {
    for (const mode of ["facade", "general", "cad", "engineering"] as const) {
      const request = buildOpenRouterRequest(
        "data:image/png;base64,AAAA",
        "Design brief text",
        "sk-test",
        { mode },
      );
      const body = JSON.parse(String(request.init.body)) as {
        messages: { role: string; content: unknown }[];
      };
      const system = body.messages.find((message) => message.role === "system");
      expect(String(system?.content), `mode ${mode}`).toContain("watermark-free");
    }
  });

  it("keeps the inline fallback path watermark-free too", () => {
    const request = buildOpenRouterRequest(
      "data:image/png;base64,AAAA",
      "Design brief text",
      "sk-test",
      { inlineSystemPrompt: true, mode: "general" },
    );
    expect(String(request.init.body)).toContain("watermark-free");
  });
});

/** Chainable PostgREST-style builder returning queued results per maybeSingle call. */
function queryChain(results: { data: unknown; error: unknown }[]) {
  const builder: Record<string, unknown> = {};
  let call = 0;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.update = vi.fn(() => builder);
  builder.gt = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() =>
    Promise.resolve(results[Math.min(call++, results.length - 1)]),
  );
  return builder;
}

describe("Daily 10-credit refresh rule", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the balance untouched when the last reset is under 24h old", async () => {
    const admin = {
      from: vi.fn(() =>
        queryChain([
          {
            data: {
              credits: 7,
              last_credit_reset: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            },
            error: null,
          },
        ]),
      ),
    };
    const credits = await refreshDailyCredits(
      admin as unknown as Parameters<typeof refreshDailyCredits>[0],
      "user-1",
    );
    expect(credits).toBe(7);
  });

  it("resets credits back to 10 when the last reset is older than 24h", async () => {
    const chain = queryChain([
      {
        data: {
          credits: 2,
          last_credit_reset: new Date(Date.now() - CREDIT_REFRESH_MS - 60_000).toISOString(),
        },
        error: null,
      },
      { data: { credits: DAILY_CREDITS }, error: null },
    ]);
    const admin = { from: vi.fn(() => chain) };
    const credits = await refreshDailyCredits(
      admin as unknown as Parameters<typeof refreshDailyCredits>[0],
      "user-1",
    );
    expect(credits).toBe(DAILY_CREDITS);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ credits: DAILY_CREDITS }),
    );
  });

  it("treats a missing reset timestamp as eligible for refresh", async () => {
    const chain = queryChain([
      { data: { credits: 0, last_credit_reset: null }, error: null },
      { data: { credits: DAILY_CREDITS }, error: null },
    ]);
    const admin = { from: vi.fn(() => chain) };
    const credits = await refreshDailyCredits(
      admin as unknown as Parameters<typeof refreshDailyCredits>[0],
      "user-1",
    );
    expect(credits).toBe(DAILY_CREDITS);
  });
});

describe("Credit deduction", () => {
  it("deducts exactly one credit through the atomic RPC and reports the remaining balance", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const admin = { rpc };
    const result = await deductGenerationCreditWithAdmin(
      admin as unknown as Parameters<typeof deductGenerationCreditWithAdmin>[0],
      "user-1",
    );
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(3);
    expect(rpc).toHaveBeenCalledWith("deduct_credit", { p_user_id: "user-1", p_amount: 1 });
  });

  it("reports failure without going negative when the RPC raises insufficient credits", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "INSUFFICIENT_CREDITS" },
    });
    const admin = { rpc };
    const result = await deductGenerationCreditWithAdmin(
      admin as unknown as Parameters<typeof deductGenerationCreditWithAdmin>[0],
      "user-1",
    );
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("Credit gate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("allows requests when Supabase is not configured yet (pre-activation parity)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await checkGenerationCredits(
      new Request("https://qattan.example/api/restore", { method: "POST" }),
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks unauthenticated requests with 401 when configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-test-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ msg: "no session" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const result = await checkGenerationCredits(
      new Request("https://qattan.example/api/restore", { method: "POST" }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.status).toBe(401);
  });
});

describe("Auth UI", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("exposes no auth UI before Supabase credentials exist", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    expect(getSupabaseBrowserClient()).toBeNull();

    const { container } = render(
      <QattanProviders locale="en">
        <AuthButton />
      </QattanProviders>,
    );
    expect(container.querySelector(".qattan-auth-google")).toBeNull();
    expect(container.querySelector(".qattan-auth-user")).toBeNull();
  });
});
