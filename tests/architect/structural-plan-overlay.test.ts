import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";
import { buildStructuralFloorOverlays, STRUCTURAL_DXF_LAYERS } from "../../lib/architect/structural-plan-overlay";

function demo() {
  const project = JSON.parse(readFileSync("examples/architect-two-floor-demo.json", "utf8"));
  const compiled = compileBuildingProposal(project.conceptProposal);
  if (!compiled.ok || compiled.kind !== "building" || !compiled.proposal.structure) throw new Error("Invalid structural demo");
  return compiled;
}

describe("floor-specific structural coordination exports", () => {
  it("shows continuous columns on both floors and upper-floor beams only at their referenced level", () => {
    const building = demo();
    const structure = building.proposal.structure!;
    const ground = building.floors.find((floor) => floor.id === "ground")!;
    const first = building.floors.find((floor) => floor.id === "first")!;
    const groundOverlay = buildStructuralFloorOverlays(structure, ground.id, ground.plan.site);
    const firstOverlay = buildStructuralFloorOverlays(structure, first.id, first.plan.site);
    expect([groundOverlay.columns, groundOverlay.beams]).toEqual([6, 0]);
    expect([firstOverlay.columns, firstOverlay.beams]).toEqual([6, 7]);
    expect(groundOverlay.svg.every((member) => member.kind === "column")).toBe(true);
    expect(firstOverlay.svg.filter((member) => member.kind === "beam")).toHaveLength(7);
  });

  it("draws the same authored footprints in screen Y-down and CAD Y-up coordinates", () => {
    const building = demo();
    const first = building.floors.find((floor) => floor.id === "first")!;
    const overlay = buildStructuralFloorOverlays(building.proposal.structure!, first.id, first.plan.site);
    const svg = buildSvgPlan(first.geometry, { structuralOverlay: overlay.svg });
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(parsed.querySelector('g#structural-coordination')?.getAttribute("data-status")).toBe("coordination-only");
    expect(parsed.querySelector('polygon#struct-column-c1')?.getAttribute("points")).toBe("4.85,19.15 5.15,19.15 5.15,18.85 4.85,18.85");
    expect(parsed.querySelectorAll('polygon[data-structural-kind="beam"]')).toHaveLength(7);

    const dxf = buildDxfPlan(first.geometry, overlay.dxf);
    for (const layer of Object.values(STRUCTURAL_DXF_LAYERS)) expect(dxf).toContain(`  0\nLAYER\n  2\n${layer}\n`);
    expect(dxf).toContain("  8\nSTRUCT_COLUMNS\n 10\n3.85\n 20\n1.85\n 11\n4.15\n 21\n1.85");
    expect(dxf).toContain("COORDINATION ONLY - NOT FOR CONSTRUCTION");
    expect(dxf.split("  8\nSTRUCT_COLUMNS\n").length - 1).toBe(6 * 5); // 4 edges + label per column
    expect(dxf.split("  8\nSTRUCT_BEAMS\n").length - 1).toBe(7 * 5);
  });
});
