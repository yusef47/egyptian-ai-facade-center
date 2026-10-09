import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import { buildBuildingSlabObj } from "../../lib/architect/slab-mesh";
import { DEFAULT_WALL_MESH_PRESET, parseWallMeshPreset } from "../../lib/architect/wall-mesh";
import { sampleBuildingProposal } from "./building-fixture";

describe("combined architectural OBJ geometry", () => {
  it("exports a base under the core and leaves upper core shaft open", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const slabs = buildBuildingSlabObj(compiled, 0.2);
    expect(slabs.ok).toBe(true);
    if (!slabs.ok) return;
    expect(slabs.solids).toBe(3);
    expect(slabs.obj).toContain("o ground_core_slab");
    expect(slabs.obj).toContain("o first_bedroom_slab");
    expect(slabs.obj).not.toContain("o first_core_slab");
    expect(slabs.obj).toContain("v 0.000000 0.000000 -0.200000");
    expect(slabs.obj).toContain("v 3.000000 0.000000 3.200000");

    const result = buildBuildingModelObj(compiled, DEFAULT_WALL_MESH_PRESET);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.wallSolids).toBeGreaterThan(0);
    expect(result.slabSolids).toBe(3);
    const vertices = [...result.obj.matchAll(/^v /gm)].length;
    const faces = [...result.obj.matchAll(/^f (\d+(?: \d+)+)$/gm)].flatMap((match) => match[1]!.split(" ").map(Number));
    expect(Math.min(...faces)).toBe(1);
    expect(Math.max(...faces)).toBe(vertices);
    expect(vertices).toBe(result.wallSolids * 8 + slabs.vertices);
  });

  it("triangulates a concave room into caps with the correct area", () => {
    const proposal = sampleBuildingProposal();
    const lShape = [
      { x: 3, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 },
      { x: 8, y: 8 }, { x: 8, y: 12 }, { x: 3, y: 12 },
    ];
    for (const floor of proposal.floors) floor.plan.cells[1]!.points = structuredClone(lShape);
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const result = buildBuildingSlabObj(compiled, 0.2);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const vertices: number[][] = [];
    let current = "";
    let topArea = 0;
    for (const line of result.obj.split("\n")) {
      if (line.startsWith("o ")) current = line.slice(2);
      if (line.startsWith("v ")) vertices.push(line.slice(2).split(" ").map(Number));
      if (!line.startsWith("f ") || current !== "first_bedroom_slab") continue;
      const face = line.slice(2).split(" ").map((part) => vertices[Number(part) - 1]!);
      if (face.length !== 3 || !face.every((point) => point[2] === 3.2)) continue;
      const [a, b, c] = face;
      topArea += Math.abs((b![0]! - a![0]!) * (c![1]! - a![1]!)
        - (b![1]! - a![1]!) * (c![0]! - a![0]!)) / 2;
    }
    expect(topArea).toBeCloseTo(92, 6);
  });

  it("rejects impossible slab values and migrates saved pre-slab settings", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(buildBuildingSlabObj(compiled, 0)).toEqual({ ok: false, errors: ["INVALID_SLAB_THICKNESS"] });
    expect(buildBuildingModelObj(compiled, { ...DEFAULT_WALL_MESH_PRESET, slabThickness: 0 }).ok).toBe(false);
    const { slabThickness: _old, ...previous } = DEFAULT_WALL_MESH_PRESET;
    expect(parseWallMeshPreset(previous)).toEqual(DEFAULT_WALL_MESH_PRESET);
  });
});
