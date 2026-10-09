import type { Wall } from "./geometry";
import { wallLength } from "./geometry";
import type { CompiledDesign } from "./building-proposal";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;

/** Explicit preview settings. They are not structural dimensions or code checks. */
export type WallMeshSettings = {
  roofElevation: number;
  doorHeadHeight: number;
  windowSillHeight: number;
  windowHeadHeight: number;
};

/** Portable user choices; roof rise is relative to the last authored level. */
export type WallMeshPreset = {
  roofRise: number;
  doorHeadHeight: number;
  windowSillHeight: number;
  windowHeadHeight: number;
  slabThickness: number;
};

export const DEFAULT_WALL_MESH_PRESET: WallMeshPreset = {
  roofRise: 3.2, doorHeadHeight: 2.1, windowSillHeight: 0.9, windowHeadHeight: 2.1, slabThickness: 0.2,
};

export function parseWallMeshPreset(value: unknown): WallMeshPreset | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  const oldKeys = "doorHeadHeight,roofRise,windowHeadHeight,windowSillHeight";
  if (keys !== oldKeys && keys !== "doorHeadHeight,roofRise,slabThickness,windowHeadHeight,windowSillHeight") return null;
  const { roofRise, doorHeadHeight, windowSillHeight, windowHeadHeight } = record;
  const slabThickness = keys === oldKeys ? DEFAULT_WALL_MESH_PRESET.slabThickness : record.slabThickness;
  if (typeof roofRise !== "number" || !Number.isFinite(roofRise) || roofRise <= 0.5 || roofRise > 10
      || typeof doorHeadHeight !== "number" || !Number.isFinite(doorHeadHeight) || doorHeadHeight < 1.5 || doorHeadHeight > 4
      || typeof windowSillHeight !== "number" || !Number.isFinite(windowSillHeight) || windowSillHeight < 0.3 || windowSillHeight > 2.5
      || typeof windowHeadHeight !== "number" || !Number.isFinite(windowHeadHeight)
      || windowHeadHeight <= windowSillHeight + 0.3 || windowHeadHeight > 4
      || typeof slabThickness !== "number" || !Number.isFinite(slabThickness)
      || slabThickness < 0.08 || slabThickness > 0.5) return null;
  return { roofRise, doorHeadHeight, windowSillHeight, windowHeadHeight, slabThickness };
}

export type WallMeshResult =
  | { ok: true; obj: string; solids: number; openings: number }
  | { ok: false; errors: string[] };

type Prism = { wall: Wall; start: number; end: number; bottom: number; top: number; name: string };

function coord(value: number): string {
  return (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6);
}

function prismObj(prism: Prism, firstVertex: number): string {
  const { wall, start, end, bottom, top } = prism;
  const length = wallLength(wall);
  const tx = (wall.end.x - wall.start.x) / length;
  const ty = (wall.end.y - wall.start.y) / length;
  const nx = -ty * wall.thickness / 2;
  const ny = tx * wall.thickness / 2;
  const at = (distance: number, side: -1 | 1, z: number) =>
    `v ${coord(wall.start.x + tx * distance + nx * side)} ${coord(wall.start.y + ty * distance + ny * side)} ${coord(z)}`;
  const vertices = [
    at(start, -1, bottom), at(end, -1, bottom), at(end, 1, bottom), at(start, 1, bottom),
    at(start, -1, top), at(end, -1, top), at(end, 1, top), at(start, 1, top),
  ];
  const faces = [
    [4, 3, 2, 1], [5, 6, 7, 8], [1, 2, 6, 5],
    [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8],
  ];
  return [`o ${prism.name}`, ...vertices,
    ...faces.map((face) => `f ${face.map((index) => firstVertex + index - 1).join(" ")}`)].join("\n");
}

/**
 * Exports independent wall solids in meters (Z up). Splits each wall around
 * actual door/window voids; no slabs, stairs, column system or BIM semantics
 * are invented. Adjacent wall solids may meet or overlap at junctions.
 */
export function buildBuildingWallObj(building: Building, settings: WallMeshSettings): WallMeshResult {
  const errors: string[] = [];
  const { roofElevation, doorHeadHeight, windowSillHeight, windowHeadHeight } = settings;
  if (![roofElevation, doorHeadHeight, windowSillHeight, windowHeadHeight].every(Number.isFinite)) {
    return { ok: false, errors: ["NON_FINITE_MESH_SETTING"] };
  }
  const lastElevation = building.floors.at(-1)!.elevation;
  if (roofElevation <= lastElevation + 0.5 || roofElevation > lastElevation + 10) errors.push("INVALID_ROOF_ELEVATION");
  if (doorHeadHeight < 1.5 || doorHeadHeight > 4) errors.push("INVALID_DOOR_HEAD_HEIGHT");
  if (windowSillHeight < 0.3 || windowSillHeight > 2.5) errors.push("INVALID_WINDOW_SILL_HEIGHT");
  if (windowHeadHeight <= windowSillHeight + 0.3 || windowHeadHeight > 4) errors.push("INVALID_WINDOW_HEAD_HEIGHT");
  const topByFloor = building.floors.map((_, index) => building.floors[index + 1]?.elevation ?? roofElevation);
  for (let index = 0; index < building.floors.length; index += 1) {
    const floor = building.floors[index]!;
    const height = topByFloor[index]! - floor.elevation;
    if (height < 0.5 || height > 10) errors.push(`INVALID_STORY_HEIGHT:${floor.id}`);
    for (const opening of floor.geometry.openings) {
      const head = opening.kind === "door" ? doorHeadHeight : windowHeadHeight;
      if (head >= height - 0.05) errors.push(`OPENING_HEAD_EXCEEDS_STORY:${floor.id}:${opening.id}`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const lines = [
    "# Qattan AI concept wall solids; meters, Z up",
    "# Separate wall pieces; no stairs, structural analysis or code compliance",
  ];
  let vertex = 1;
  let solids = 0;
  let openings = 0;
  for (let index = 0; index < building.floors.length; index += 1) {
    const floor = building.floors[index]!;
    const bottom = floor.elevation;
    const top = topByFloor[index]!;
    for (const wall of floor.geometry.walls) {
      const length = wallLength(wall);
      const cuts = floor.geometry.openings.filter((opening) => opening.wallId === wall.id)
        .sort((a, b) => a.offset - b.offset);
      let cursor = 0;
      const add = (from: number, to: number, z0: number, z1: number) => {
        if (to - from < 0.000001 || z1 - z0 < 0.000001) return;
        const name = `${floor.id}_${wall.id}_piece-${++solids}`;
        lines.push(prismObj({ wall, start: from, end: to, bottom: z0, top: z1, name }, vertex));
        vertex += 8;
      };
      for (const opening of cuts) {
        add(cursor, opening.offset, bottom, top);
        if (opening.kind === "window") add(opening.offset, opening.offset + opening.width, bottom, bottom + windowSillHeight);
        add(opening.offset, opening.offset + opening.width, bottom + (opening.kind === "door" ? doorHeadHeight : windowHeadHeight), top);
        cursor = opening.offset + opening.width;
        openings += 1;
      }
      add(cursor, length, bottom, top);
    }
  }
  return { ok: true, obj: lines.join("\n") + "\n", solids, openings };
}
