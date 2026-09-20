import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ENGINE_FETCH_BUDGET_MS,
  ENGINE_MAX_UPSTREAM_ATTEMPTS,
} from "../lib/openrouter-engine";

/**
 * Regression pins for the four CRITICAL findings from the pre-launch audit
 * (5.md). These are source-contract tests: they assert the exact fixed shapes
 * exist (and the buggy shapes are gone) so none of the four can silently
 * regress.
 */

describe("CRITICAL-1 — admin stats RPCs locked to service_role", () => {
  const sql = readFileSync("supabase/migrations/20260910_qattan_admin.sql", "utf8");

  it("revokes EXECUTE from public/anon/authenticated on both admin RPCs", () => {
    expect(sql).toContain(
      "revoke execute on function public.admin_platform_stats() from public, anon, authenticated;",
    );
    expect(sql).toContain(
      "revoke execute on function public.admin_recent_profiles(integer) from public, anon, authenticated;",
    );
  });

  it("grants EXECUTE strictly to service_role", () => {
    expect(sql).toContain("grant execute on function public.admin_platform_stats() to service_role;");
    expect(sql).toContain(
      "grant execute on function public.admin_recent_profiles(integer) to service_role;",
    );
  });
});

describe("CRITICAL-2 — refund never caps/destroys purchased credits", () => {
  const sql = readFileSync("supabase/migrations/20260910_qattan_profiles.sql", "utf8");

  it("refunds exactly +1 credit with NO daily-allowance cap", () => {
    expect(sql).toMatch(/set credits = credits \+ 1,\s*\n\s*generations_used = greatest\(generations_used - 1, 0\)/);
    // The destructive cap must never return in any form.
    expect(sql).not.toContain("least(credits + 1, 10)");
  });
});

describe("CRITICAL-2b — migration is truly idempotent (stale grant removed)", () => {
  const sql = readFileSync("supabase/migrations/20260910_qattan_profiles.sql", "utf8");

  it("no longer grants EXECUTE on the deleted qattan_cairo_midnight function", () => {
    expect(sql).not.toContain("qattan_cairo_midnight");
  });
});

describe("CRITICAL-3 — bounded engine time budget", () => {
  it("budgets upstream time well inside the 60s function window", () => {
    expect(ENGINE_FETCH_BUDGET_MS).toBe(45_000);
    expect(ENGINE_MAX_UPSTREAM_ATTEMPTS).toBe(2);
  });

  it("shares ONE AbortSignal.timeout deadline across the whole attempt chain", () => {
    const source = readFileSync("lib/openrouter-engine.ts", "utf8");
    expect(source).toContain("const engineDeadline = AbortSignal.timeout(ENGINE_FETCH_BUDGET_MS);");
    expect(source).toContain("signal: engineDeadline");
    // The per-attempt shape (2 × timeout could exceed the 60s window) must
    // never return.
    expect(source).not.toContain("ENGINE_FETCH_TIMEOUT_MS");
  });
});

describe("CRITICAL-4 — provision-on-first-use instead of a permanent 429", () => {
  it("exports a race-safe profile provisioning helper", () => {
    const source = readFileSync("lib/credits.ts", "utf8");
    expect(source).toContain("export async function provisionProfileCredits(");
    // ignoreDuplicates is essential: a plain upsert would overwrite an
    // existing row's balance back to the daily allowance.
    expect(source).toContain("ignoreDuplicates: true");
  });

  it("the restore route provisions instead of answering 429 on an unreadable profile", () => {
    const route = readFileSync("app/api/restore/route.ts", "utf8");
    expect(route).toContain("provisionProfileCredits");
    expect(route).toContain("[REFRESH_PROFILE_MISSING]");
  });
});
