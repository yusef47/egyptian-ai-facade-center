import { describe, expect, it } from "vitest";
import { buildResidentialFloorFixture } from "../../lib/architect/fixtures";
import { buildMassingSvg } from "../../lib/architect/massing";

describe("illustrative massing preview", () => {
  it("shows exactly the validated fixture spaces with Arabic labels", () => {
    const geometry = buildResidentialFloorFixture();
    const svg = buildMassingSvg(geometry, "ar");
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.getAttribute("data-preview")).toBe("concept-massing");
    expect(doc.querySelectorAll("[data-massing-space]")).toHaveLength(geometry.spaces.length);
    expect(doc.querySelector("[data-massing-space='space-unit-a']")?.textContent).toContain("الوحدة أ");
    expect(doc.querySelector("[data-massing-space='space-core']")?.textContent).toContain("النواة");
    expect(svg).not.toContain("<script");
  });
});
