import { describe, expect, it } from "vitest";
import { ar, en } from "../client/src/lib/i18n";

describe("i18n dictionary", () => {
  it("defines the same keys in English and Arabic", () => {
    const enKeys = Object.keys(en).sort();
    const arKeys = Object.keys(ar).sort();
    expect(arKeys).toEqual(enKeys);
  });

  it("has no empty values in either language", () => {
    for (const key of Object.keys(en)) {
      expect(en[key as keyof typeof en].trim(), `en.${key}`).not.toBe("");
      expect(ar[key as keyof typeof ar].trim(), `ar.${key}`).not.toBe("");
    }
  });

  it("keeps the Egyptian center brand strings intact", () => {
    expect(en["nav.center"]).toContain("Egyptian Center");
    expect(ar["nav.center"]).toContain("المركز المصري");
    expect(en["nav.syndicate"]).toContain("Egyptian Engineers Syndicate");
    expect(ar["nav.syndicate"]).toContain("نقابة المهندسين");
  });
});
