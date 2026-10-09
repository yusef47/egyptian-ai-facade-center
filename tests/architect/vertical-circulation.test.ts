import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { sampleBuildingProposal } from "./building-fixture";

describe("vertical circulation audit", () => {
  it("measures each rise and reports real core door spans without inventing stairs", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.coreNominalArea).toBe(24);
    expect(compiled.circulation.coreBoundingWidth).toBe(3);
    expect(compiled.circulation.coreBoundingDepth).toBe(8);
    expect(compiled.circulation.groundOutsideDoors).toEqual([{
      id: "cp-door-1", connectsTo: "outside",
      start: { x: 0, y: 4.5 }, end: { x: 0, y: 3.5 },
    }]);
    expect(compiled.circulation.links).toHaveLength(1);
    const link = compiled.circulation.links[0]!;
    expect(link.rise).toBe(3.2);
    expect(link.status).toBe("stair-not-authored");
    expect(link.lowerCoreDoors.map((door) => door.connectsTo)).toEqual(["outside", "living"]);
    expect(link.upperCoreDoors).toEqual([{
      id: "cp-door-1", connectsTo: "bedroom",
      start: { x: 3, y: 3.55 }, end: { x: 3, y: 4.45 },
    }]);
  });

  it("does not claim direct outside entry when the ground core is reached through another room", () => {
    const proposal = sampleBuildingProposal();
    proposal.floors[0]!.plan.doors[0] = { from: "living", to: "outside", width: 1, at: 0.5 };
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.groundOutsideDoors).toEqual([]);
    expect(compiled.circulation.links[0]!.lowerCoreDoors.map((door) => door.connectsTo)).toEqual(["living"]);
  });

  it("identifies datum-level entry even when a basement appears first", () => {
    const proposal = sampleBuildingProposal();
    const basement = structuredClone(proposal.floors[0]!);
    basement.id = "basement";
    basement.elevation = -3;
    basement.plan.doors[0] = { from: "living", to: "outside", width: 1, at: 0.5 };
    proposal.floors.unshift(basement);
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.groundOutsideDoors).toHaveLength(1);
    expect(compiled.circulation.links.map((link) => link.rise)).toEqual([3, 3.2]);
  });
});
