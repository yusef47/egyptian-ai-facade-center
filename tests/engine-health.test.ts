import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Engine health probe contract: admin-gated, provider-secret, and classified
 * so the operator sees ok / auth / credits / forbidden / rate / capacity at a
 * glance instead of grepping runtime logs.
 */

describe("GET /api/admin/engine-health — probe contract", () => {
  it("gates behind authorizeAdmin before any probe executes", () => {
    const route = readFileSync("app/api/admin/engine-health/route.ts", "utf8");
    const gateIndex = route.indexOf("authorizeAdmin(request, admin)");
    const probeIndex = route.indexOf("probeModel(OPENROUTER_MODEL");
    expect(gateIndex).toBeGreaterThan(-1);
    expect(probeIndex).toBeGreaterThan(gateIndex);
    // Same CSRF parity as the other admin route.
    expect(route).toContain("isAllowedOrigin(request)");
  });

  it("classifies every upstream failure class the production incident produced", () => {
    const route = readFileSync("app/api/admin/engine-health/route.ts", "utf8");
    for (const label of ["auth", "credits", "forbidden", "rate", "capacity", "network", "config"]) {
      expect(route).toContain(`"${label}"`);
    }
    // Key-limit phrasing maps to the credits class (the suspected root cause).
    expect(route).toMatch(/key limit/i);
  });

  it("probes the fallback model only when the primary fails", () => {
    const route = readFileSync("app/api/admin/engine-health/route.ts", "utf8");
    expect(route).toContain("if (!primary.ok)");
  });

  it("probes with a negligible text-only completion, not an image generation", () => {
    const route = readFileSync("app/api/admin/engine-health/route.ts", "utf8");
    expect(route).toContain("max_tokens: 5");
    expect(route).not.toContain("modalities");
  });

  it("is reachable from the admin dashboard with a Run probe button", () => {
    const page = readFileSync("app/admin/page.tsx", "utf8");
    expect(page).toContain("/api/admin/engine-health");
    expect(page).toContain("Run probe");
  });
});
