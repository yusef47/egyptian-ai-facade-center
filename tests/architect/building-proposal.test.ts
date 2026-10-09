import { describe, expect, it } from "vitest";
import { compileBuildingProposal, designMatchesSite, parseBuildingProposal } from "../../lib/architect/building-proposal";
import { sampleBuildingProposal } from "./building-fixture";

const building = sampleBuildingProposal();

describe("multi-floor building proposal", () => {
  it("compiles different layouts at measured elevations through an aligned core", () => {
    const compiled = compileBuildingProposal(building);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.floors.map((floor) => [floor.geometry.floor.id, floor.geometry.floor.elevation])).toEqual([
      ["ground", 0], ["first", 3.2],
    ]);
    expect(compiled.floors[0]!.geometry.spaces.map((space) => space.id)).toEqual(["core", "living"]);
    expect(compiled.floors[1]!.geometry.spaces.map((space) => space.id)).toEqual(["core", "bedroom"]);
    expect(compiled.floors[1]!.geometry.openings.filter((opening) => opening.kind === "door")).toHaveLength(1);
    expect(designMatchesSite(compiled.proposal, 12, 20)).toBe(true);
  });

  it("rejects misaligned cores and upper rooms with no door from the core", () => {
    const moved = structuredClone(building);
    moved.floors[1]!.plan.cells[0]!.points = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 8 }, { x: 0, y: 8 }];
    expect(compileBuildingProposal(moved)).toEqual({ ok: false, errors: ["VERTICAL_CORE_MISALIGNED:first"] });

    const blocked = structuredClone(building);
    blocked.floors[1]!.plan.doors = [];
    const result = compileBuildingProposal(blocked);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("first:SPACE_WITHOUT_ACCESS:bedroom");
  });

  it("rejects invalid floor order, missing ground level and a changed site", () => {
    expect(parseBuildingProposal({ ...building, floors: [...building.floors].reverse() })).toBeNull();
    const elevated = structuredClone(building);
    elevated.floors[0]!.elevation = 1;
    expect(parseBuildingProposal(elevated)).toBeNull();
    const differentSite = structuredClone(building);
    differentSite.floors[1]!.plan.site = [{ x: 0, y: 0 }, { x: 13, y: 0 }, { x: 13, y: 20 }, { x: 0, y: 20 }];
    expect(compileBuildingProposal(differentSite)).toEqual({ ok: false, errors: ["FLOOR_SITE_MISMATCH:first"] });
  });
});
