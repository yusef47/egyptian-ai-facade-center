import type { Point2, ProjectGeometry } from "./geometry";
import { wallLength } from "./geometry";
import { openingFootprint } from "./building-structure";
import { findSpaceOverlaps, polygonInsidePolygon } from "./validate";
import { hasCoreWalkingPath } from "./stair-access";

/** One straight concept flight between two adjacent authored floor levels. */
export type BuildingStair = {
  id: string;
  lowerFloorId: string;
  upperFloorId: string;
  /** Centerline endpoints of the sloping run in plan meters. */
  start: Point2;
  end: Point2;
  width: number;
  risers: number;
  /** Same length at both level landings, measured along the run axis. */
  landingLength: number;
};

export type StairFloorContext = {
  id: string;
  elevation: number;
  core: Point2[];
  geometry: ProjectGeometry;
};

const SAFE_ID = /^[a-z][a-z0-9-]{0,39}$/;
const EPSILON = 1e-7;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function point(value: unknown): Point2 | null {
  if (!record(value) || !exactKeys(value, ["x", "y"])
      || typeof value.x !== "number" || !Number.isFinite(value.x) || Math.abs(value.x) > 1000
      || typeof value.y !== "number" || !Number.isFinite(value.y) || Math.abs(value.y) > 1000) return null;
  return { x: Math.round(value.x * 1000) / 1000, y: Math.round(value.y * 1000) / 1000 };
}

/** Schema bounds prevent malformed mesh data; they are not building-code limits. */
export function parseBuildingStairs(value: unknown): BuildingStair[] | null {
  if (!Array.isArray(value) || value.length > 10) return null;
  const result: BuildingStair[] = [];
  const ids = new Set<string>();
  for (const item of value) {
    if (!record(item) || !exactKeys(item, ["id", "lowerFloorId", "upperFloorId", "start", "end", "width", "risers", "landingLength"])
        || typeof item.id !== "string" || !SAFE_ID.test(item.id) || ids.has(item.id)
        || typeof item.lowerFloorId !== "string" || !SAFE_ID.test(item.lowerFloorId)
        || typeof item.upperFloorId !== "string" || !SAFE_ID.test(item.upperFloorId)
        || typeof item.width !== "number" || !Number.isFinite(item.width) || item.width < 0.6 || item.width > 3
        || typeof item.risers !== "number" || !Number.isInteger(item.risers) || item.risers < 4 || item.risers > 40
        || typeof item.landingLength !== "number" || !Number.isFinite(item.landingLength)
        || item.landingLength < 0.6 || item.landingLength > 3) return null;
    const start = point(item.start);
    const end = point(item.end);
    if (!start || !end) return null;
    ids.add(item.id);
    result.push({ id: item.id, lowerFloorId: item.lowerFloorId, upperFloorId: item.upperFloorId,
      start, end, width: item.width, risers: item.risers as number, landingLength: item.landingLength });
  }
  return result;
}

function stairSectionFootprint(stair: BuildingStair, from: number, to: number): Point2[] {
  const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
  if (length <= EPSILON) return [];
  const ux = (stair.end.x - stair.start.x) / length;
  const uy = (stair.end.y - stair.start.y) / length;
  const nx = -uy * stair.width / 2;
  const ny = ux * stair.width / 2;
  const a = { x: stair.start.x + ux * from, y: stair.start.y + uy * from };
  const b = { x: stair.start.x + ux * to, y: stair.start.y + uy * to };
  return [
    { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny },
    { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny },
  ];
}

/** Full plan envelope, including both level landings. */
export function stairFootprint(stair: BuildingStair): Point2[] {
  const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
  return stairSectionFootprint(stair, -stair.landingLength, length + stair.landingLength);
}

/** Opening in the upper core plate; the upper landing supplies its own surface. */
export function stairVoidFootprint(stair: BuildingStair): Point2[] {
  const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
  return stairSectionFootprint(stair, 0, length + stair.landingLength);
}

export function stairLandingFootprint(stair: BuildingStair, level: "lower" | "upper"): Point2[] {
  const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
  return level === "lower"
    ? stairSectionFootprint(stair, -stair.landingLength, 0)
    : stairSectionFootprint(stair, length, length + stair.landingLength);
}

type CoreDoorApproach = { id: string; points: Point2[]; entry: Point2 | null };

/** Door threshold plus a nominal 0.75 m approach zone within the core. */
function doorApproach(geometry: ProjectGeometry, coreCellId: string, core: Point2[]): CoreDoorApproach[] {
  const walls = new Map(geometry.walls.map((wall) => [wall.id, wall]));
  return geometry.openings.flatMap((opening) => {
    if (opening.kind !== "door") return [];
    const wall = walls.get(opening.wallId);
    if (!wall || !wall.sharedWith.includes(coreCellId)) return [];
    const length = wallLength(wall);
    if (length <= EPSILON) return [];
    const ux = (wall.end.x - wall.start.x) / length;
    const uy = (wall.end.y - wall.start.y) / length;
    const a = { x: wall.start.x + ux * opening.offset, y: wall.start.y + uy * opening.offset };
    const b = { x: a.x + ux * opening.width, y: a.y + uy * opening.width };
    const nx = -uy * 0.75;
    const ny = ux * 0.75;
    const zones = [1, -1].map((side) => [a, b,
      { x: b.x + nx * side, y: b.y + ny * side },
      { x: a.x + nx * side, y: a.y + ny * side }]);
    const inside = zones.find((zone) => polygonInsidePolygon(zone, core));
    // A zero-width or malformed approach must not silently approve a stair.
    return [{
      id: opening.id,
      points: inside ?? openingFootprint(opening, wall),
      entry: inside ? {
        x: inside.reduce((sum, point) => sum + point.x, 0) / inside.length,
        y: inside.reduce((sum, point) => sum + point.y, 0) / inside.length,
      } : null,
    }];
  });
}

/** Geometric checks only; egress, headroom, structure and local code need review. */
export function validateBuildingStairs(stairs: BuildingStair[], floors: StairFloorContext[], coreCellId: string): string[] {
  const errors: string[] = [];
  const footprints: Array<{ stair: BuildingStair; points: Point2[] }> = [];
  const supportAt = (floorIndex: number) => {
    const floor = floors[floorIndex]!;
    const arriving = stairs.filter((item) => item.upperFloorId === floor.id);
    const departing = stairs.filter((item) => item.lowerFloorId === floor.id);
    return {
      base: floorIndex === 0 || arriving.length > 0,
      voids: arriving.map(stairVoidFootprint),
      bridges: [
        ...arriving.map((item) => stairLandingFootprint(item, "upper")),
        ...departing.map((item) => stairLandingFootprint(item, "lower")),
      ],
    };
  };
  for (const stair of stairs) {
    const lowerIndex = floors.findIndex((floor) => floor.id === stair.lowerFloorId);
    const upperIndex = floors.findIndex((floor) => floor.id === stair.upperFloorId);
    if (lowerIndex < 0 || upperIndex !== lowerIndex + 1) {
      errors.push(`STAIR_FLOORS_NOT_ADJACENT:${stair.id}`);
      continue;
    }
    const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
    if (length <= EPSILON) {
      errors.push(`STAIR_ZERO_RUN:${stair.id}`);
      continue;
    }
    const footprint = stairFootprint(stair);
    footprints.push({ stair, points: footprint });
    const lower = floors[lowerIndex]!;
    const upper = floors[upperIndex]!;
    if (lowerIndex > 0 && !stairs.some((item) => item.upperFloorId === lower.id)) {
      errors.push(`STAIR_LEVEL_UNSUPPORTED:${stair.id}:${lower.id}`);
    }
    if (!polygonInsidePolygon(footprint, lower.core)) errors.push(`STAIR_OUTSIDE_CORE:${stair.id}`);
    // These loose sanity bounds exclude degenerate model geometry, not unsafe designs.
    const rise = (upper.elevation - lower.elevation) / stair.risers;
    const tread = length / (stair.risers - 1);
    if (rise < 0.08 || rise > 0.3 || tread < 0.1 || tread > 1) errors.push(`STAIR_GEOMETRY_IMPLAUSIBLE:${stair.id}`);
    const ux = (stair.end.x - stair.start.x) / length;
    const uy = (stair.end.y - stair.start.y) / length;
    for (const [level, floor] of [lower, upper].entries()) {
      const target = level === 0
        ? { x: stair.start.x - ux * stair.landingLength / 2, y: stair.start.y - uy * stair.landingLength / 2 }
        : { x: stair.end.x + ux * stair.landingLength / 2, y: stair.end.y + uy * stair.landingLength / 2 };
      const obstacle = level === 0
        ? stairSectionFootprint(stair, 0, length + stair.landingLength)
        : stairSectionFootprint(stair, -stair.landingLength, length);
      for (const approach of doorApproach(floor.geometry, coreCellId, floor.core)) {
        if (findSpaceOverlaps([footprint, approach.points]).length) {
          errors.push(`STAIR_BLOCKS_CORE_DOOR:${stair.id}:${floor.id}`);
          continue;
        }
        if (!approach.entry) {
          errors.push(`STAIR_DOOR_APPROACH_INVALID:${stair.id}:${floor.id}:${approach.id}`);
          continue;
        }
        if (polygonInsidePolygon(footprint, floor.core)
            && !hasCoreWalkingPath(floor.core, obstacle, approach.entry, target, supportAt(lowerIndex + level))) {
          errors.push(`STAIR_DOOR_UNREACHABLE:${stair.id}:${floor.id}:${approach.id}`);
        }
      }
    }
  }
  for (const [first, second] of findSpaceOverlaps(footprints.map((item) => item.points))) {
    const a = footprints[first]!.stair;
    const b = footprints[second]!.stair;
    // The same core can hold flights directly above one another in different storeys.
    if (a.lowerFloorId === b.lowerFloorId && a.upperFloorId === b.upperFloorId) {
      errors.push(`STAIRS_OVERLAP:${a.id}:${b.id}`);
    }
  }
  return errors;
}
