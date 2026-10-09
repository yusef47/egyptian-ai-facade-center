import type { Opening, Point2, Wall } from "./geometry";
import { polygonArea, wallLength } from "./geometry";
import { clipPolygon, findSpaceOverlaps, polygonInsidePolygon, triangulatePolygon } from "./validate";

export type BuildingColumn = { id: string; position: Point2; width: number; depth: number };
export type BuildingBeam = {
  id: string;
  floorId: string;
  fromColumnId: string;
  toColumnId: string;
  width: number;
  depth: number;
};
export type BuildingStructure = {
  version: 1;
  status: "coordination-only";
  columns: BuildingColumn[];
  beams: BuildingBeam[];
};

export type StructureFloorContext = {
  id: string;
  site: Point2[];
  core: Point2[];
  spaces: Point2[][];
  walls: Wall[];
  openings: Opening[];
};

const SAFE_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_COORDINATE = 1000;
const EPSILON = 1e-7;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysMatch(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === keys.sort().join(",");
}

function dimension(value: unknown): value is number {
  // Format bounds prevent absurd geometry and resource use; they are not member sizing rules.
  return typeof value === "number" && Number.isFinite(value) && value >= 0.1 && value <= 3;
}

/** Parse only the authored coordination schema; engineering validity is separate. */
export function parseBuildingStructure(value: unknown): BuildingStructure | null {
  if (!record(value) || !keysMatch(value, ["version", "status", "columns", "beams"])
      || value.version !== 1 || value.status !== "coordination-only"
      || !Array.isArray(value.columns) || value.columns.length < 2 || value.columns.length > 64
      || !Array.isArray(value.beams) || value.beams.length > 128) return null;
  const columns: BuildingColumn[] = [];
  for (const item of value.columns) {
    if (!record(item) || !keysMatch(item, ["id", "position", "width", "depth"])
        || typeof item.id !== "string" || !SAFE_ID.test(item.id)
        || !record(item.position) || !keysMatch(item.position, ["x", "y"])
        || typeof item.position.x !== "number" || !Number.isFinite(item.position.x)
        || typeof item.position.y !== "number" || !Number.isFinite(item.position.y)
        || Math.abs(item.position.x) > MAX_COORDINATE || Math.abs(item.position.y) > MAX_COORDINATE
        || !dimension(item.width) || !dimension(item.depth)) return null;
    columns.push({
      id: item.id,
      position: { x: Math.round(item.position.x * 1000) / 1000, y: Math.round(item.position.y * 1000) / 1000 },
      width: Math.round(item.width * 1000) / 1000,
      depth: Math.round(item.depth * 1000) / 1000,
    });
  }
  const beams: BuildingBeam[] = [];
  for (const item of value.beams) {
    if (!record(item) || !keysMatch(item, ["id", "floorId", "fromColumnId", "toColumnId", "width", "depth"])
        || typeof item.id !== "string" || !SAFE_ID.test(item.id)
        || typeof item.floorId !== "string" || !SAFE_ID.test(item.floorId)
        || typeof item.fromColumnId !== "string" || !SAFE_ID.test(item.fromColumnId)
        || typeof item.toColumnId !== "string" || !SAFE_ID.test(item.toColumnId)
        || !dimension(item.width) || !dimension(item.depth)) return null;
    beams.push({
      id: item.id, floorId: item.floorId, fromColumnId: item.fromColumnId, toColumnId: item.toColumnId,
      width: Math.round(item.width * 1000) / 1000,
      depth: Math.round(item.depth * 1000) / 1000,
    });
  }
  return { version: 1, status: "coordination-only", columns, beams };
}

export function columnFootprint(column: BuildingColumn): Point2[] {
  const { x, y } = column.position;
  const halfX = column.width / 2;
  const halfY = column.depth / 2;
  return [
    { x: x - halfX, y: y - halfY }, { x: x + halfX, y: y - halfY },
    { x: x + halfX, y: y + halfY }, { x: x - halfX, y: y + halfY },
  ];
}

export function beamFootprint(beam: BuildingBeam, from: Point2, to: Point2): Point2[] {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < EPSILON) return [];
  const nx = -(to.y - from.y) / length * beam.width / 2;
  const ny = (to.x - from.x) / length * beam.width / 2;
  return [
    { x: from.x - nx, y: from.y - ny }, { x: to.x - nx, y: to.y - ny },
    { x: to.x + nx, y: to.y + ny }, { x: from.x + nx, y: from.y + ny },
  ];
}

/** Plan footprint of the wall segment removed by an authored door/window. */
export function openingFootprint(opening: Opening, wall: Wall): Point2[] {
  const length = wallLength(wall);
  if (length < EPSILON) return [];
  const tx = (wall.end.x - wall.start.x) / length;
  const ty = (wall.end.y - wall.start.y) / length;
  const nx = -ty * wall.thickness / 2;
  const ny = tx * wall.thickness / 2;
  const start = { x: wall.start.x + tx * opening.offset, y: wall.start.y + ty * opening.offset };
  const end = { x: start.x + tx * opening.width, y: start.y + ty * opening.width };
  return [
    { x: start.x - nx, y: start.y - ny }, { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny }, { x: start.x + nx, y: start.y + ny },
  ];
}

/** Exact area intersection for simple concave polygons via triangle pairs. */
function intersectionArea(first: Point2[], second: Point2[]): number {
  const firstTriangles = triangulatePolygon(first);
  const secondTriangles = triangulatePolygon(second);
  if (!firstTriangles || !secondTriangles) return 0;
  let area = 0;
  for (const subject of firstTriangles) {
    for (const clip of secondTriangles) {
      const intersection = clipPolygon(subject, clip);
      if (intersection.length >= 3) area += polygonArea({ points: intersection });
    }
  }
  return area;
}

function fullyCovered(footprint: Point2[], spaces: Point2[][]): boolean {
  const total = polygonArea({ points: footprint });
  const covered = spaces.reduce((sum, space) => sum + intersectionArea(footprint, space), 0);
  return total > EPSILON && covered >= total - 0.0001;
}

/** Geometry and references only. Passing these checks does not prove safety. */
export function validateBuildingStructure(structure: BuildingStructure, floors: StructureFloorContext[]): string[] {
  const errors: string[] = [];
  const floorIds = new Set(floors.map((floor) => floor.id));
  const columns = new Map<string, BuildingColumn>();
  for (const column of structure.columns) {
    if (columns.has(column.id)) errors.push(`COLUMN_ID_DUPLICATE:${column.id}`);
    columns.set(column.id, column);
  }
  const openingsByFloor = floors.map((floor) => {
    const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
    return floor.openings.flatMap((opening) => {
      const wall = wallById.get(opening.wallId);
      return wall ? [{ id: opening.id, points: openingFootprint(opening, wall) }] : [];
    });
  });
  const footprints = structure.columns.map(columnFootprint);
  for (let index = 0; index < structure.columns.length; index += 1) {
    const column = structure.columns[index]!;
    if (!polygonInsidePolygon(footprints[index]!, floors[0]!.site)) errors.push(`COLUMN_OUT_OF_SITE:${column.id}`);
    if (findSpaceOverlaps([footprints[index]!, floors[0]!.core]).length) errors.push(`COLUMN_BLOCKS_CORE:${column.id}`);
    for (let floorIndex = 0; floorIndex < floors.length; floorIndex += 1) {
      const floor = floors[floorIndex]!;
      if (!fullyCovered(footprints[index]!, floor.spaces)) errors.push(`COLUMN_OUTSIDE_FLOOR:${floor.id}:${column.id}`);
      for (const opening of openingsByFloor[floorIndex]!) {
        if (findSpaceOverlaps([footprints[index]!, opening.points]).length) {
          errors.push(`COLUMN_BLOCKS_OPENING:${floor.id}:${column.id}:${opening.id}`);
        }
      }
    }
  }
  for (const [first, second] of findSpaceOverlaps(footprints)) {
    errors.push(`COLUMNS_OVERLAP:${structure.columns[first]!.id}:${structure.columns[second]!.id}`);
  }
  const beamIds = new Set<string>();
  const spans = new Set<string>();
  const beamsByFloor = new Map<string, number>();
  for (const beam of structure.beams) {
    if (beamIds.has(beam.id)) errors.push(`BEAM_ID_DUPLICATE:${beam.id}`);
    beamIds.add(beam.id);
    if (!floorIds.has(beam.floorId)) errors.push(`BEAM_FLOOR_INVALID:${beam.id}`);
    if (beam.floorId === floors[0]!.id) errors.push(`BEAM_ON_BASE_FLOOR:${beam.id}`);
    const from = columns.get(beam.fromColumnId);
    const to = columns.get(beam.toColumnId);
    if (!from || !to || from.id === to.id) {
      errors.push(`BEAM_COLUMN_REFERENCE_INVALID:${beam.id}`);
      continue;
    }
    const footprint = beamFootprint(beam, from.position, to.position);
    if (!footprint.length) {
      errors.push(`BEAM_ZERO_LENGTH:${beam.id}`);
      continue;
    }
    if (!polygonInsidePolygon(footprint, floors[0]!.site)) errors.push(`BEAM_OUT_OF_SITE:${beam.id}`);
    if (findSpaceOverlaps([footprint, floors[0]!.core]).length) errors.push(`BEAM_BLOCKS_CORE:${beam.id}`);
    const floor = floors.find((candidate) => candidate.id === beam.floorId);
    if (floor && !fullyCovered(footprint, floor.spaces)) errors.push(`BEAM_OUTSIDE_FLOOR:${beam.id}`);
    const span = `${beam.floorId}:${[beam.fromColumnId, beam.toColumnId].sort().join(":")}`;
    if (spans.has(span)) errors.push(`BEAM_SPAN_DUPLICATE:${beam.id}`);
    spans.add(span);
    beamsByFloor.set(beam.floorId, (beamsByFloor.get(beam.floorId) ?? 0) + 1);
  }
  for (const floor of floors.slice(1)) {
    if (!beamsByFloor.get(floor.id)) errors.push(`BEAMS_MISSING_ON_UPPER_FLOOR:${floor.id}`);
  }
  return errors;
}
