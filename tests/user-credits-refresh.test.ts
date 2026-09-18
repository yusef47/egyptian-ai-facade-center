import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Contract for GET /api/user/credits — the route must apply the Cairo-midnight
 * refresh rule BEFORE returning the balance, and the header badge must be fed
 * exclusively by this route with the session bearer token.
 */

describe("GET /api/user/credits — refresh-before-read contract", () => {
  it("executes refreshDailyCredits before returning the balance", () => {
    const route = readFileSync("app/api/user/credits/route.ts", "utf8");
    expect(route).toContain("verifySupabaseUser(request)");
    expect(route).toContain("refreshDailyCredits(admin, userId)");
    // Refresh must precede the balance response, and there is exactly one
    // call site — no double-reset risk.
    expect(route.indexOf("refreshDailyCredits(admin, userId)")).toBeLessThan(
      route.indexOf("console.log(`[USER_CREDITS]"),
    );
    expect(route.match(/refreshDailyCredits\(/g)?.length).toBe(1);
  });

  it("applies the strict Cairo calendar-date rule, not a rolling 24h window", () => {
    const lib = readFileSync("lib/credits.ts", "utf8");
    expect(lib).toContain("Africa/Cairo");
    // A stale stamp (earlier Cairo calendar day) triggers the full-allowance
    // reset via a strict YYYY-MM-DD string comparison — hours are irrelevant.
    expect(lib).toContain("getCairoDateString");
    expect(lib).toContain("lastResetCairoDate < todayCairoDate");
    expect(lib).not.toContain("CREDIT_REFRESH_MS");
  });

  it("feeds the badge from /api/user/credits with the session bearer token", () => {
    const button = readFileSync("components/qattan/AuthButton.tsx", "utf8");
    expect(button).toContain('"/api/user/credits"');
    expect(button).toContain("Bearer ${accessToken}");
    expect(button).toContain("QATTAN_CREDITS_EVENT");
    // The badge never fabricates a balance: initial state is null, and the
    // server's 0 is rendered as 0.
    expect(button).toContain("useState<number | null>(null)");
    expect(button).not.toContain("setCredits(10)");
  });

  it("keeps the route dynamic so a stale cache can never serve an old balance", () => {
    const route = readFileSync("app/api/user/credits/route.ts", "utf8");
    expect(route).toContain('export const dynamic = "force-dynamic"');
  });
});
