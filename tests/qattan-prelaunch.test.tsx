import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PrivacyPage from "../app/privacy/page";
import TermsPage from "../app/terms/page";
import ArabicPrivacyPage from "../app/ar/privacy/page";
import ArabicTermsPage from "../app/ar/terms/page";
import { metadata as rootMetadata } from "../app/layout";
import { rateLimit, resetRequestGuards } from "../lib/request-guards";
import { validateImageDataUrl } from "../lib/image-validation";

// A tiny real PNG (8-byte signature + minimal IHDR) for magic-byte tests.
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);
const PNG_DATA_URL = `data:image/png;base64,${PNG_BYTES.toString("base64")}`;
// "Rar!" — an archive signature disguised with an image MIME type.
const FAKE_IMAGE_DATA_URL = `data:image/png;base64,${Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]).toString("base64")}`;

afterEach(() => {
  resetRequestGuards();
  vi.restoreAllMocks();
});

describe("P1/P8 — request guards on the generation API", () => {
  it("allows the first 15 requests per minute then blocks with a friendly retry-after", () => {
    for (let i = 0; i < 15; i++) {
      expect(rateLimit("user-a").allowed).toBe(true);
    }
    const blocked = rateLimit("user-a");
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    // Other users are unaffected.
    expect(rateLimit("user-b").allowed).toBe(true);
  });

  it("has no dedupe window blocking legitimate consecutive generations", () => {
    // The dedupe layer was removed per the launch spec: back-to-back
    // generations from the same key are throttled only by the 15/min limit.
    const guards = readFileSync("lib/request-guards.ts", "utf8");
    expect(guards).not.toMatch(/__qattanDedupe|DEDUPE_WINDOW_MS|export function dedupe/);
    const route = readFileSync("app/api/restore/route.ts");
    expect(route).not.toContain("dedupe(");
  });
});

describe("P8 — uploaded image validation (MIME + magic bytes, 10MB cap)", () => {
  it("accepts a genuine PNG data URL", () => {
    expect(validateImageDataUrl(PNG_DATA_URL)).toEqual({ ok: true });
  });

  it("accepts hosted https image references unchanged", () => {
    expect(validateImageDataUrl("https://cdn.example/render.jpg")).toEqual({ ok: true });
  });

  it("rejects non-image bytes disguised with an image MIME type", () => {
    const result = validateImageDataUrl(FAKE_IMAGE_DATA_URL);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(415);
  });

  it("rejects unsupported and SVG MIME types", () => {
    const zip = validateImageDataUrl(`data:application/zip;base64,${PNG_BYTES.toString("base64")}`);
    expect(zip.ok).toBe(false);
    if (!zip.ok) expect(zip.status).toBe(415);

    const svg = validateImageDataUrl(`data:image/svg+xml;base64,${PNG_BYTES.toString("base64")}`);
    expect(svg.ok).toBe(false);
    if (!svg.ok) expect(svg.status).toBe(415);
  });

  it("rejects oversized images beyond the 10MB cap", () => {
    const huge = Buffer.alloc(11 * 1024 * 1024, 0x89);
    const result = validateImageDataUrl(`data:image/png;base64,${huge.toString("base64")}`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(413);
  });

  it("rejects missing or malformed payloads", () => {
    expect(validateImageDataUrl(undefined).ok).toBe(false);
    expect(validateImageDataUrl("").ok).toBe(false);
    expect(validateImageDataUrl("data:image/png,not-base64!!").ok).toBe(false);
  });
});

describe("P1 — generation route wires guards + exactly-once deduction", () => {
  it("sources the guards, validation, and audit log in the route", () => {
    const route = readFileSync("app/api/restore/route.ts", "utf8");
    expect(route).toContain("rateLimit(");
    expect(route).toContain("validateImageDataUrl(");
    // Exact simplified flow: refresh → gate → deduct → engine, with logs.
    expect(route).toContain("[RESTORE_START]");
    expect(route).toContain("[REFRESH_CHECK]");
    expect(route).toContain("[PRE_DEDUCT]");
    expect(route).toContain("[POST_DEDUCT]");
    expect(route).toContain("[CALLING_ENGINE]");
    expect(route.indexOf("refreshDailyCredits(admin, userId)")).toBeLessThan(
      route.indexOf("deductGenerationCredit(userId)"),
    );
    expect(route).toContain("deductGenerationCredit(userId)");
    // The RPC call site must appear exactly once — no loops or retries.
    expect(route.match(/deductGenerationCredit\(/g)?.length).toBe(1);
    // Audit log fires with userId + remaining balance (pre-generation order).
    expect(route).toContain("[POST_DEDUCT]");
    expect(route.indexOf("deductGenerationCredit(userId)")).toBeLessThan(
      route.indexOf("executeRestore(body"),
    );
    // A failed RPC (parameter-name mismatch, missing function, permission) is
    // an infrastructure problem: 503 + busy copy, never "credits exhausted".
    expect(route).toContain('deduction.reason === "insufficient"');
    expect(route).toContain("ENGINE_BUSY_BILINGUAL");
  });

  it("always returns a numeric creditsRemaining so the header badge can update", () => {
    const route = readFileSync("app/api/restore/route.ts", "utf8");
    // Every response path logs and returns the balance — a null here used to
    // silently freeze the badge at its stale value.
    expect(route).toContain("[RESPONSE]");
    expect(route).toContain("[CREDITS_FALLBACK_READ]");
    expect(route).toContain("readProfileCredits(admin, userId)");
    expect(route).toMatch(/imageDataUrl: result\.imageDataUrl,\s*\n\s*creditsRemaining,/);

    // Client broadcasts the value, badge applies it immediately.
    const client = readFileSync("client/src/lib/restore.ts", "utf8");
    expect(client).toContain("[CREDITS_EVENT_DISPATCH]");
    const authButton = readFileSync("components/qattan/AuthButton.tsx", "utf8");
    expect(authButton).toContain("[CREDITS_EVENT_RECEIVED]");
    expect(authButton).toContain("setCredits(next)");
    // A failed/empty profiles read never clobbers a known-good balance.
    expect(authButton).toMatch(/typeof profile\?\.credits === "number"/);
  });

  it("preserves the balance when last_credit_reset is recent and only true 24h+ triggers reset", () => {
    const sql = readFileSync("supabase/migrations/20260910_qattan_profiles.sql", "utf8");
    expect(sql).toMatch(/last_credit_reset < now\(\) - interval '24 hours'/);
    // Stamping legacy rows must NOT touch credits.
    expect(sql).toMatch(/set last_credit_reset = now\(\)\s*\n\s*where id = user_id\s*\n\s*returning credits into stamped;/);
  });
});

describe("Branding — zero provider mentions in user-facing surfaces", () => {
  const USER_FACING_SOURCES = [
    "lib/openrouter-engine.ts",
    "app/api/restore/route.ts",
    "lib/request-guards.ts",
    "lib/credits.ts",
    "lib/image-validation.ts",
    "components/qattan/ToolWorkspace.tsx",
    "client/src/lib/i18n.tsx",
    "client/src/lib/restore.ts",
  ];

  it("never names the upstream provider in error copy or UI strings", () => {
    for (const file of USER_FACING_SOURCES) {
      const source = readFileSync(file, "utf8");
      // Strip comments so server-side identifiers/imports don't false-positive:
      // only string/JSX literals are user-visible.
      const literals = source
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !/^[/*]/.test(line.trim()))
        .join("\n")
        // Server-side wiring never reaches the browser: the gateway endpoint,
        // env-var identifiers, and type/import names are not user-visible.
        .replace(/https:\/\/openrouter\.ai[^\"']*/gi, "")
        .replace(/OPENROUTER_[A-Z_]+/g, "")
        .replace(/OpenRouter(Request|Failure)/g, "");
      const matches = literals.match(/openrouter(?![-_])/gi);
      if (matches) {
        const offending = literals
          .split("\n")
          .filter((line) => /openrouter(?![-_])/i.test(line));
        throw new Error(`${file} leaks the provider name: ${offending.join("\n")}`);
      }
      expect(matches).toBeNull();
    }
  });

  it("uses the proprietary bilingual busy + rate-limit messages", () => {
    const engine = readFileSync("lib/openrouter-engine.ts", "utf8");
    expect(engine).toContain("Qattan Architectural Engine is currently busy");
    expect(engine).toContain("عذراً، محرك قطان المعماري مشغول حالياً");
    const guards = readFileSync("lib/request-guards.ts", "utf8");
    expect(guards).toContain("Please wait a few seconds before the next generation");
    expect(guards).toContain("يرجى الانتظار بضع ثوانٍ");
    // Rate limit raised to 15/min.
    expect(guards).toMatch(/RATE_MAX_REQUESTS = 15/);
    const route = readFileSync("app/api/restore/route.ts", "utf8");
    expect(route).toContain("RATE_LIMIT_MESSAGE_BILINGUAL");
  });

  it("maps upstream provider failures to the proprietary busy message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: "Insufficient credits. Top up at provider." } }),
          { status: 402 },
        ),
      ),
    );
    const { executeRestore } = await import("../lib/openrouter-engine");
    const result = await executeRestore(
      { imageDataUrl: "data:image/png;base64,AAAA", prompt: "villa" },
      { apiKey: "test-key", clientKey: "branding-test" },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("Qattan Architectural Engine is currently busy");
      expect(result.message).not.toMatch(/openrouter/i);
    }
  });
});

describe("P3 — language & theme persistence", () => {
  it("persists theme under qattan-theme on toggle and hydrates pre-paint", () => {
    const header = readFileSync("components/qattan/QattanHeader.tsx", "utf8");
    expect(header).toContain('localStorage.setItem("qattan-theme", next)');
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain('localStorage.getItem("qattan-theme")');
    expect(layout).toContain('localStorage.getItem("qattan-lang")');
  });

  it("persists language under qattan-lang and restores before first paint", () => {
    const providers = readFileSync("components/qattan/QattanProviders.tsx", "utf8");
    expect(providers).toContain('localStorage.setItem("qattan-lang", locale)');
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toContain('location.replace("/ar")');
  });
});

describe("P4 — bilingual legal pages", () => {
  it("renders the English privacy policy with required disclosures", () => {
    render(<PrivacyPage />);
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText(/We do NOT sell your personal data/i)).toBeInTheDocument();
    expect(screen.getByText(/European Union/i)).toBeInTheDocument();
    expect(screen.getByText(/request complete deletion/i)).toBeInTheDocument();
  });

  it("renders the English terms with the AI-output disclaimer and credit rules", () => {
    render(<TermsPage />);
    expect(screen.getByText("Terms of Service")).toBeInTheDocument();
    expect(screen.getByText(/NOT certified engineering drawings/i)).toBeInTheDocument();
    expect(screen.getByText(/10 free credits that renew automatically every 24 hours/i)).toBeInTheDocument();
    expect(screen.getByText(/illegal purpose/i)).toBeInTheDocument();
  });

  it("renders the Arabic privacy policy in Arabic", () => {
    render(<ArabicPrivacyPage />);
    expect(screen.getByText("سياسة الخصوصية")).toBeInTheDocument();
    expect(screen.getByText(/لا نبيع بياناتك الشخصية/i)).toBeInTheDocument();
  });

  it("renders the Arabic terms in Arabic", () => {
    render(<ArabicTermsPage />);
    expect(screen.getByText("شروط الاستخدام")).toBeInTheDocument();
    expect(screen.getByText(/ليست رسومات هندسية معتمدة/i)).toBeInTheDocument();
  });

  it("links both legal pages from the site footer", () => {
    const footer = readFileSync("components/qattan/QattanFooter.tsx", "utf8");
    expect(footer).toContain('"/privacy"');
    expect(footer).toContain('"/terms"');
    expect(footer).toContain('"/ar/privacy"');
    expect(footer).toContain('"/ar/terms"');
  });
});

describe("P5/P6 — OG metadata, favicon, and tab title", () => {
  it("declares the full OG/Twitter metadata and tab title", () => {
    expect(String(rootMetadata.title)).toContain("Qattan AI");
    expect(String(rootMetadata.title)).toContain("منصة قطان المعمارية");
    const ogImages = Array.isArray(rootMetadata.openGraph?.images)
      ? rootMetadata.openGraph.images
      : rootMetadata.openGraph?.images
        ? [rootMetadata.openGraph.images]
        : [];
    expect(ogImages[0]).toMatchObject({ url: "/og-image.jpg", width: 1200, height: 630 });
    expect((rootMetadata.twitter as { card?: string }).card).toBe("summary_large_image");
    expect(rootMetadata.icons).toBeDefined();
  });

  it("ships the generated OG image and gold Q favicon", () => {
    const icon = readFileSync("public/icon.svg", "utf8");
    expect(icon).toContain("<svg");
    expect(icon).toContain("#d4af37");

    const ogStats = readFileSync("public/og-image.jpg");
    expect(ogStats.length).toBeGreaterThan(10_000);
  });
});

describe("P7 — light-mode counterparts for new surfaces", () => {
  it("defines light-theme rules for legal and admin surfaces", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/data-qattan-theme="light"\] \.qattan-legal \{/);
    expect(css).toMatch(/data-qattan-theme="light"\] \.qattan-admin \{/);
    expect(css).toMatch(/data-qattan-theme="light"\] \.qattan-admin-card[\s,]/);
  });
});
