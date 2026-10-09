import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import { createProjectDraft } from "../../lib/architect/project-draft";
import { defaultRoomProgram } from "../../lib/architect/room-plan";
import { createFourFloorResidentialDemo } from "../../lib/architect/residential-demo";
import { DEFAULT_WALL_MESH_PRESET } from "../../lib/architect/wall-mesh";
import { buildSvgPlan } from "../../lib/architect/export-plan";
import { buildStairFloorOverlay } from "../../lib/architect/stair-plan-overlay";

describe("four-storey residential reference", () => {
  it("compiles distinct rooms with an entrance, aligned core and three authored stairs", () => {
    const proposal = createFourFloorResidentialDemo();
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.floors).toHaveLength(4);
    expect(compiled.floors.every((floor) => floor.geometry.spaces.length === 12)).toBe(true);
    for (const floor of compiled.floors) {
      for (const space of floor.geometry.spaces.filter((candidate) => /(?:bed|kitchen)$/.test(candidate.id))) {
        const x = space.polygon.points.map((point) => point.x);
        const y = space.polygon.points.map((point) => point.y);
        expect(Math.min(Math.max(...x) - Math.min(...x), Math.max(...y) - Math.min(...y))).toBeGreaterThanOrEqual(2.5);
      }
    }
    expect(compiled.circulation.groundOutsideDoors).toHaveLength(1);
    expect(compiled.circulation.links.map((link) => link.status)).toEqual([
      "concept-stair-authored", "concept-stair-authored", "concept-stair-authored",
    ]);
    const model = buildBuildingModelObj(compiled, DEFAULT_WALL_MESH_PRESET);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.stairSolids).toBe(60);
    expect(model.openings).toBeGreaterThan(40);
    expect(model.obj).toContain("o first_core_platform_");
    expect(model.obj).not.toContain("o first_core_slab");
    const groundSvg = buildSvgPlan(compiled.floors[0]!.geometry, {
      locale: "ar",
      stairOverlay: buildStairFloorOverlay(proposal.stairs!, "ground").svg,
    });
    expect(groundSvg).toContain('data-space-label="a-living"');
    expect(groundSvg).not.toContain('data-space-label="core"');
  });

  it("can be saved as a portable draft and reopened through the project validator", () => {
    const draft = createProjectDraft(
      "Four-storey residential reference",
      { siteWidth: 12, siteDepth: 20, unitBSharePercent: 50, coreSide: "west" },
      defaultRoomProgram(), 1, "concept", createFourFloorResidentialDemo(), DEFAULT_WALL_MESH_PRESET,
    );
    expect(draft?.conceptProposal).toMatchObject({ kind: "building", floors: expect.any(Array) });
  });
});
