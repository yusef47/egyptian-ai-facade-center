import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingStackSvg } from "../../lib/architect/building-stack";
import { sampleBuildingProposal } from "./building-fixture";

describe("multi-floor axonometric preview", () => {
  it("projects every authored level and the continuous core without inventing volumes", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const doc = new DOMParser().parseFromString(buildBuildingStackSvg(compiled, "first"), "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.documentElement.getAttribute("data-preview")).toBe("building-stack");
    expect(doc.querySelectorAll("[data-stack-floor]")).toHaveLength(2);
    expect(doc.querySelectorAll("[data-legend-floor]")).toHaveLength(2);
    expect(doc.querySelector('[data-legend-floor="first"] text')?.textContent).toContain("3.2 m");
    expect(doc.querySelector('[data-stack-floor="first"] text')).toBeNull();
    expect(doc.querySelectorAll("[data-vertical-core]")).toHaveLength(4);
    expect(doc.querySelector('[data-stack-floor="first"]')?.getAttribute("data-selected")).toBe("true");
    expect(doc.querySelectorAll("[data-stack-space]")).toHaveLength(4);
    expect(doc.querySelector("[data-floor-plate='first']")).toBeTruthy();
    expect(doc.querySelector("[data-wall-volume]")).toBeNull();
    const connector = doc.querySelector("[data-vertical-core]")!;
    const rise = Number(connector.getAttribute("y1")) - Number(connector.getAttribute("y2"));
    expect(rise).toBeCloseTo(3.2 * 1.35, 2);
  });

  it("rotates the same geometry and escapes authored floor names", () => {
    const proposal = sampleBuildingProposal();
    proposal.floors[1]!.name = "First <script>";
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const front = buildBuildingStackSvg(compiled, "ground", 0);
    const side = buildBuildingStackSvg(compiled, "ground", 1);
    expect(front).not.toBe(side);
    expect(side).toContain("First &lt;script&gt;");
    const doc = new DOMParser().parseFromString(side, "image/svg+xml");
    expect(doc.querySelector("script")).toBeNull();
    expect(doc.querySelector("parsererror")).toBeNull();
  });
});
