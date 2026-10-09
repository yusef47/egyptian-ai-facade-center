import { describe, expect, it } from "vitest";
import { compileBuildingProposal, parseBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import { DEFAULT_WALL_MESH_PRESET } from "../../lib/architect/wall-mesh";
import { sampleBuildingProposal } from "./building-fixture";
import { sampleBuildingStructure } from "./structure-fixture";

function proposal() {
  return { ...sampleBuildingProposal(), structure: sampleBuildingStructure() };
}

describe("authored multi-floor structural coordination", () => {
  it("accepts aligned columns and upper-level beams while retaining exact authored data", () => {
    const compiled = compileBuildingProposal(proposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.proposal.structure?.columns).toHaveLength(4);
    const model = buildBuildingModelObj(compiled, DEFAULT_WALL_MESH_PRESET);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.columnSolids).toBe(4);
    expect(model.beamSolids).toBe(4);
    expect(model.obj).toContain("o struct-column-c1");
    expect(model.obj).toContain("o struct-beam-first-b1");
    expect(model.obj).toContain("v 3.850000 1.850000 0.000000");
    expect(model.obj).toContain(" 3.000000\n"); // first-floor beam top = 3.2 - 0.2 slab
    const vertexCount = [...model.obj.matchAll(/^v /gm)].length;
    const indices = [...model.obj.matchAll(/^f (\d+(?: \d+)+)$/gm)]
      .flatMap((match) => match[1]!.split(" ").map(Number));
    expect(Math.max(...indices)).toBe(vertexCount);
  });

  it("rejects a column blocking the stair core or leaving the authored floor", () => {
    const blocked = proposal();
    blocked.structure.columns[0]!.position = { x: 2, y: 2 };
    const result = compileBuildingProposal(blocked);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("COLUMN_BLOCKS_CORE:c1");

    const outside = proposal();
    outside.structure.columns[0]!.position = { x: 4, y: 10 };
    const other = compileBuildingProposal(outside);
    expect(other.ok).toBe(false);
    if (!other.ok) expect(other.errors).toContain("COLUMN_OUTSIDE_FLOOR:first:c1");
  });

  it("rejects an otherwise in-bounds column that covers a core door", () => {
    const atDoor = proposal();
    atDoor.structure.columns[0]!.position = { x: 3.2, y: 4 };
    const result = compileBuildingProposal(atDoor);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.startsWith("COLUMN_BLOCKS_OPENING:ground:c1:"))).toBe(true);
      expect(result.errors.some((error) => error.startsWith("COLUMN_BLOCKS_OPENING:first:c1:"))).toBe(true);
      expect(result.errors).not.toContain("COLUMN_BLOCKS_CORE:c1");
    }
  });

  it("rejects a beam section that physically crosses a lower-storey window head", () => {
    const candidate = proposal();
    candidate.floors[0]!.plan.windows![0]!.edgeIndex = 0; // south wall below b1
    candidate.structure.columns[0]!.position.y = 1.5;
    candidate.structure.columns[1]!.position.y = 1.5;
    candidate.structure.beams[0]!.width = 3;
    candidate.structure.beams[0]!.depth = 1;
    const compiled = compileBuildingProposal(candidate);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const colliding = buildBuildingModelObj(compiled, DEFAULT_WALL_MESH_PRESET);
    expect(colliding.ok).toBe(false);
    if (!colliding.ok) expect(colliding.errors.some((error) => error.startsWith("BEAM_CROSSES_OPENING:first:b1:ground:"))).toBe(true);
    candidate.structure.beams[0]!.depth = 0.8;
    const fixed = compileBuildingProposal(candidate);
    expect(fixed.ok).toBe(true);
    if (fixed.ok && fixed.kind === "building") expect(buildBuildingModelObj(fixed, DEFAULT_WALL_MESH_PRESET).ok).toBe(true);
  });

  it("rejects broken, duplicate and missing beam topology", () => {
    const broken = proposal();
    broken.structure.beams[0]!.toColumnId = "missing";
    const result = compileBuildingProposal(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("BEAM_COLUMN_REFERENCE_INVALID:b1");

    const duplicate = proposal();
    duplicate.structure.beams[1]!.fromColumnId = "c2";
    duplicate.structure.beams[1]!.toColumnId = "c1";
    const second = compileBuildingProposal(duplicate);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.errors).toContain("BEAM_SPAN_DUPLICATE:b2");

    const missing = proposal();
    missing.structure.beams = [];
    const third = compileBuildingProposal(missing);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.errors).toContain("BEAMS_MISSING_ON_UPPER_FLOOR:first");

    const base = proposal();
    base.structure.beams[0]!.floorId = "ground";
    const fourth = compileBuildingProposal(base);
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.errors).toContain("BEAM_ON_BASE_FLOOR:b1");
  });

  it("rejects malformed structure schema without changing legacy building projects", () => {
    const original = sampleBuildingProposal();
    expect(parseBuildingProposal(original)).not.toBeNull();
    expect(parseBuildingProposal({ ...original, structure: { ...sampleBuildingStructure(), status: "approved" } })).toBeNull();
    expect(parseBuildingProposal({ ...original, structure: { ...sampleBuildingStructure(), injected: true } })).toBeNull();
  });
});
