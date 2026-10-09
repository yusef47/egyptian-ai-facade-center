import type { Point2 } from "./geometry";
import type { CompiledDesign } from "./building-proposal";
import { triangulatePolygon } from "./validate";
import { stairVoidFootprint } from "./building-stair";
import { corePlatformPieces } from "./core-platform";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;
export type SlabMeshResult =
  | { ok: true; obj: string; solids: number; vertices: number }
  | { ok: false; errors: string[] };

const EPSILON = 1e-8;

function coordinate(value: number): string {
  return (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6);
}

function cross(a: Point2, b: Point2, c: Point2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Remove redundant points so cap and side faces use identical boundary edges. */
function simpleRing(input: Point2[]): Point2[] {
  const points = [...input];
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const a = points[(index - 1 + points.length) % points.length]!;
      const b = points[index]!;
      const c = points[(index + 1) % points.length]!;
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
      if (Math.abs(cross(a, b, c)) <= EPSILON && dot >= -EPSILON) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  const signed = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0);
  return signed < 0 ? points.reverse() : points;
}

function slabObject(points: Point2[], top: number, thickness: number, name: string, firstVertex: number): string | null {
  const ring = simpleRing(points);
  const triangles = triangulatePolygon(ring);
  if (!triangles) return null;
  const index = (point: Point2) => ring.indexOf(point);
  const caps = triangles.map((triangle) => triangle.map(index));
  if (caps.some((triangle) => triangle.some((vertex) => vertex < 0))) return null;
  const n = ring.length;
  const bottom = top - thickness;
  const vertices = [
    ...ring.map((point) => `v ${coordinate(point.x)} ${coordinate(point.y)} ${coordinate(bottom)}`),
    ...ring.map((point) => `v ${coordinate(point.x)} ${coordinate(point.y)} ${coordinate(top)}`),
  ];
  const f = (indices: number[]) => `f ${indices.map((vertex) => firstVertex + vertex).join(" ")}`;
  const faces = [
    ...caps.map(([a, b, c]) => f([c!, b!, a!])),
    ...caps.map(([a, b, c]) => f([a! + n, b! + n, c! + n])),
    ...ring.map((_, i) => f([i, (i + 1) % n, (i + 1) % n + n, i + n])),
  ];
  return [`o ${name}`, ...vertices, ...faces].join("\n");
}

/**
 * Independently triangulated floor-cell plates in meters, Z up. The core has
 * a base at the lowest level and, where stairs arrive, walking platforms around
 * the authored stair opening at upper levels. This is a
 * geometric coordination model, not a designed or checked structural slab.
 */
export function buildBuildingSlabObj(building: Building, thickness: number, firstVertex = 1): SlabMeshResult {
  if (!Number.isFinite(thickness) || thickness < 0.08 || thickness > 0.5) {
    return { ok: false, errors: ["INVALID_SLAB_THICKNESS"] };
  }
  const lines = ["# Qattan AI concept floor-cell plates; meters, Z up"];
  let vertex = firstVertex;
  let solids = 0;
  for (let floorIndex = 0; floorIndex < building.floors.length; floorIndex += 1) {
    const floor = building.floors[floorIndex]!;
    if (floorIndex > 0 && thickness >= floor.elevation - building.floors[floorIndex - 1]!.elevation) {
      return { ok: false, errors: [`SLAB_THICKNESS_EXCEEDS_STORY:${floor.id}`] };
    }
    for (const space of floor.geometry.spaces) {
      let plates = [space.polygon.points];
      if (floorIndex > 0 && space.id === building.proposal.coreCellId) {
        const arriving = (building.proposal.stairs ?? []).filter((stair) => stair.upperFloorId === floor.id);
        if (!arriving.length) continue;
        const pieces = corePlatformPieces(space.polygon.points, arriving.map(stairVoidFootprint));
        if (!pieces) return { ok: false, errors: [`CORE_PLATFORM_CUT_FAILED:${floor.id}`] };
        plates = pieces;
      }
      for (const [index, plate] of plates.entries()) {
        const name = plates.length === 1 && space.id !== building.proposal.coreCellId
          ? `${floor.id}_${space.id}_slab`
          : floorIndex === 0 ? `${floor.id}_${space.id}_slab` : `${floor.id}_${space.id}_platform_${index + 1}`;
        const object = slabObject(plate, floor.elevation, thickness, name, vertex);
        if (!object) return { ok: false, errors: [`SLAB_TRIANGULATION_FAILED:${floor.id}:${space.id}`] };
        lines.push(object);
        vertex += simpleRing(plate).length * 2;
        solids += 1;
      }
    }
  }
  return { ok: true, obj: lines.join("\n") + "\n", solids, vertices: vertex - firstVertex };
}
