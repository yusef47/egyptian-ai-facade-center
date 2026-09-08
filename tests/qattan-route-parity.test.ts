import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  dependencies?: Record<string, string>;
};

describe("Qattan App Router route parity", () => {
  it("has explicit public and studio routes", () => {
    expect(existsSync("app/page.tsx")).toBe(true);
    expect(existsSync("app/ar/page.tsx")).toBe(true);
    expect(existsSync("app/en/page.tsx")).toBe(true);
    expect(existsSync("app/studio/page.tsx")).toBe(true);
    expect(existsSync("app/api/restore/route.ts")).toBe(true);
  });

  it("does not retain the removed browser/server runtime entrypoints", () => {
    expect(existsSync("client/src/main.tsx")).toBe(false);
    expect(existsSync("client/src/App.tsx")).toBe(false);
    expect(existsSync("client/index.html")).toBe(false);
    expect(existsSync("server/index.ts")).toBe(false);
    expect(existsSync("vite.config.ts")).toBe(false);
    expect(existsSync("tsconfig.node.json")).toBe(false);

    expect(existsSync("public/logos/syndicate-logo.png")).toBe(true);
    expect(existsSync("public/logos/center-logo.png")).toBe(true);
    expect(existsSync("public/logos/egypt-flag.png")).toBe(true);
    expect(existsSync("client/public/logos")).toBe(false);
    expect(packageJson.dependencies?.wouter).toBeUndefined();
    expect(packageJson.dependencies?.express).toBeUndefined();

    const sourceText = [
      "app/api/restore/route.ts",
      "lib/openrouter-engine.ts",
      "api/restore.ts",
    ]
      .filter((file) => existsSync(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    expect(sourceText).not.toMatch(/from ['\"]wouter['\"]|from ['\"]express['\"]/);
  });
});
