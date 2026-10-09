import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingWallObj, type WallMeshSettings } from "../../lib/architect/wall-mesh";
import { sampleBuildingProposal } from "./building-fixture";

const settings: WallMeshSettings = {
  roofElevation: 6.4, doorHeadHeight: 2.1,
  windowSillHeight: 0.9, windowHeadHeight: 2.1,
};

function solids(obj: string): Array<{ name: string; vertices: number[][] }> {
  const groups: Array<{ name: string; vertices: number[][] }> = [];
  let current: (typeof groups)[number] | undefined;
  for (const line of obj.trim().split("\n")) {
    if (line.startsWith("o ")) {
      current = { name: line.slice(2), vertices: [] };
      groups.push(current);
    } else if (line.startsWith("v ") && current) {
      current.vertices.push(line.slice(2).split(" ").map(Number));
    }
  }
  return groups;
}

describe("multi-floor wall solids OBJ", () => {
  it("exports bounded, indexed solids at the authored levels with openings cut through", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const result = buildBuildingWallObj(compiled, settings);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pieces = solids(result.obj);
    expect(pieces).toHaveLength(result.solids);
    expect(result.openings).toBe(5);
    expect(pieces.every((piece) => piece.vertices.length === 8)).toBe(true);
    expect(pieces.some((piece) => piece.name.startsWith("ground_"))).toBe(true);
    expect(pieces.some((piece) => piece.name.startsWith("first_"))).toBe(true);
    expect(Math.min(...pieces.flatMap((piece) => piece.vertices.map((vertex) => vertex[2]!)))).toBe(0);
    expect(Math.max(...pieces.flatMap((piece) => piece.vertices.map((vertex) => vertex[2]!)))).toBe(6.4);
    const faceIndices = [...result.obj.matchAll(/^f (\d+) (\d+) (\d+) (\d+)$/gm)]
      .flatMap((match) => match.slice(1).map(Number));
    expect(faceIndices).toHaveLength(result.solids * 24);
    expect(Math.min(...faceIndices)).toBe(1);
    expect(Math.max(...faceIndices)).toBe(result.solids * 8);

    const ground = compiled.floors[0]!;
    for (const opening of ground.geometry.openings) {
      const wall = ground.geometry.walls.find((candidate) => candidate.id === opening.wallId)!;
      const length = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      const center = opening.offset + opening.width / 2;
      const aligned = pieces.filter((piece) => piece.name.startsWith(`ground_${wall.id}_`));
      const spansCenter = (piece: (typeof pieces)[number]) => {
        const offsets = piece.vertices.map(([x, y]) => ((x! - wall.start.x) * (wall.end.x - wall.start.x)
          + (y! - wall.start.y) * (wall.end.y - wall.start.y)) / length);
        return Math.min(...offsets) < center && Math.max(...offsets) > center;
      };
      const atCenter = aligned.filter(spansCenter);
      expect(atCenter.length).toBeGreaterThan(0);
      const zRanges = atCenter.map((piece) => piece.vertices.map((vertex) => vertex[2]!));
      expect(zRanges.some((zs) => Math.min(...zs) < 1.2 && Math.max(...zs) > 1.2)).toBe(false);
      if (opening.kind === "window") {
        expect(zRanges.some((zs) => Math.min(...zs) === 0 && Math.max(...zs) === 0.9)).toBe(true);
      } else {
        expect(zRanges.some((zs) => Math.min(...zs) === 0)).toBe(false);
      }
    }
  });

  it("rejects non-finite, invalid and too-low authored heights", () => {
    const compiled = compileBuildingProposal(sampleBuildingProposal());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(buildBuildingWallObj(compiled, { ...settings, roofElevation: Infinity })).toEqual({
      ok: false, errors: ["NON_FINITE_MESH_SETTING"],
    });
    const short = buildBuildingWallObj(compiled, { ...settings, roofElevation: 4.5 });
    expect(short.ok).toBe(false);
    if (!short.ok) expect(short.errors).toContain("OPENING_HEAD_EXCEEDS_STORY:first:cp-door-1");
  });
});
