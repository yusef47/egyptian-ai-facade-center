import { describe, expect, it } from "vitest";
import { ALLOWED_SITE_ORIGINS, isAllowedOrigin } from "../lib/origin.js";
import { readFileSync } from "node:fs";

function requestWithOrigin(origin: string | null): Request {
  const headers = new Headers();
  if (origin) headers.set("origin", origin);
  return new Request("https://www.qattan-ai.com/api/restore", {
    method: "POST",
    headers,
  });
}

describe("CSRF origin allowlist", () => {
  it("allows both production hosts — apex AND www", () => {
    expect(isAllowedOrigin(requestWithOrigin("https://qattan-ai.com"))).toBe(true);
    expect(isAllowedOrigin(requestWithOrigin("https://www.qattan-ai.com"))).toBe(true);
    expect(ALLOWED_SITE_ORIGINS).toContain("https://qattan-ai.com");
  });

  it("is case-insensitive on the scheme/host", () => {
    expect(isAllowedOrigin(requestWithOrigin("https://QATTAN-AI.COM"))).toBe(true);
    expect(isAllowedOrigin(requestWithOrigin("HTTPS://WWW.QATTAN-AI.COM"))).toBe(true);
  });

  it("allows every Vercel deployment origin", () => {
    expect(isAllowedOrigin(requestWithOrigin("https://egyptian-ai-facade-center.vercel.app"))).toBe(true);
    expect(isAllowedOrigin(requestWithOrigin("https://qattan-git-preview-yusef47.vercel.app"))).toBe(true);
  });

  it("allows localhost development origins", () => {
    expect(isAllowedOrigin(requestWithOrigin("http://localhost:3000"))).toBe(true);
    expect(isAllowedOrigin(requestWithOrigin("http://127.0.0.1:5173"))).toBe(true);
  });

  it("allows requests with no Origin header (same-origin fetches, curl)", () => {
    expect(isAllowedOrigin(requestWithOrigin(null))).toBe(true);
  });

  it("rejects cross-site and spoofed origins", () => {
    expect(isAllowedOrigin(requestWithOrigin("https://evil.example.com"))).toBe(false);
    expect(isAllowedOrigin(requestWithOrigin("http://qattan-ai.com.evil.io"))).toBe(false);
    // Insecure apex/http is NOT the production origin.
    expect(isAllowedOrigin(requestWithOrigin("http://qattan-ai.com"))).toBe(false);
    // Lookalike host under a different TLD.
    expect(isAllowedOrigin(requestWithOrigin("https://qattan-ai.com.evil.io"))).toBe(false);
  });

  it("rejects a malformed Origin header", () => {
    expect(isAllowedOrigin(requestWithOrigin("not-a-url"))).toBe(false);
  });
});

describe("state-changing credit routes enforce the origin gate", () => {
  it("wires isAllowedOrigin into every credit-mutating POST route", () => {
    for (const route of [
      "app/api/restore/route.ts",
      "app/api/topup/request/route.ts",
      "app/api/topup/promo/route.ts",
      "app/api/admin/topup/approve/route.ts",
    ]) {
      const source = readFileSync(route, "utf8");
      expect(source, route).toContain("isAllowedOrigin(request)");
      expect(source, route).toContain("status: 403");
    }
  });

  it("documents the apex in the restore route's gate comment", () => {
    const source = readFileSync("app/api/restore/route.ts", "utf8");
    expect(source).toContain("qattan-ai.com");
  });
});
