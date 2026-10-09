import type { CompiledDesign } from "./building-proposal";
import { buildBuildingSlabObj } from "./slab-mesh";
import { buildBuildingWallObj, type WallMeshPreset } from "./wall-mesh";
import { buildBuildingStructureObj } from "./structure-mesh";
import { beamFootprint, openingFootprint } from "./building-structure";
import { findSpaceOverlaps } from "./validate";
import { buildBuildingStairObj } from "./stair-mesh";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;
const CLASH_EPSILON = 1e-6;

/** A beam under an upper slab must not occupy a lower-storey door/window void. */
function beamOpeningClashes(building: Building, preset: WallMeshPreset): string[] {
  const structure = building.proposal.structure;
  if (!structure) return [];
  const columns = new Map(structure.columns.map((column) => [column.id, column]));
  const errors: string[] = [];
  for (let floorIndex = 1; floorIndex < building.floors.length; floorIndex += 1) {
    const upper = building.floors[floorIndex]!;
    const lower = building.floors[floorIndex - 1]!;
    const wallById = new Map(lower.geometry.walls.map((wall) => [wall.id, wall]));
    for (const beam of structure.beams.filter((candidate) => candidate.floorId === upper.id)) {
      const from = columns.get(beam.fromColumnId)!;
      const to = columns.get(beam.toColumnId)!;
      const beamPlan = beamFootprint(beam, from.position, to.position);
      const beamTop = upper.elevation - preset.slabThickness;
      const beamBottom = beamTop - beam.depth;
      for (const opening of lower.geometry.openings) {
        const wall = wallById.get(opening.wallId);
        if (!wall) continue;
        const openingBottom = lower.elevation + (opening.kind === "door" ? 0 : preset.windowSillHeight);
        const openingTop = lower.elevation + (opening.kind === "door" ? preset.doorHeadHeight : preset.windowHeadHeight);
        if (beamBottom >= openingTop - CLASH_EPSILON || beamTop <= openingBottom + CLASH_EPSILON) continue;
        if (findSpaceOverlaps([beamPlan, openingFootprint(opening, wall)]).length) {
          errors.push(`BEAM_CROSSES_OPENING:${upper.id}:${beam.id}:${lower.id}:${opening.id}`);
        }
      }
    }
  }
  return errors;
}

export type BuildingModelObjResult =
  | { ok: true; obj: string; wallSolids: number; slabSolids: number; columnSolids: number; beamSolids: number; stairSolids: number; openings: number }
  | { ok: false; errors: string[] };

/** Combined, non-BIM coordination mesh. Every solid retains a semantic OBJ name. */
export function buildBuildingModelObj(building: Building, preset: WallMeshPreset): BuildingModelObjResult {
  const walls = buildBuildingWallObj(building, {
    roofElevation: building.floors.at(-1)!.elevation + preset.roofRise,
    doorHeadHeight: preset.doorHeadHeight,
    windowSillHeight: preset.windowSillHeight,
    windowHeadHeight: preset.windowHeadHeight,
  });
  const slabs = buildBuildingSlabObj(building, preset.slabThickness, walls.ok ? walls.solids * 8 + 1 : 1);
  if (!walls.ok || !slabs.ok) return {
    ok: false,
    errors: [...(walls.ok ? [] : walls.errors), ...(slabs.ok ? [] : slabs.errors)],
  };
  const clashes = beamOpeningClashes(building, preset);
  if (clashes.length) return { ok: false, errors: clashes };
  const structure = buildBuildingStructureObj(building, preset, walls.solids * 8 + slabs.vertices + 1);
  const stairs = buildBuildingStairObj(building, walls.solids * 8 + slabs.vertices + structure.vertices + 1);
  return {
    ok: true,
    obj: walls.obj + slabs.obj + structure.obj + stairs.obj,
    wallSolids: walls.solids,
    slabSolids: slabs.solids,
    columnSolids: structure.columns,
    beamSolids: structure.beams,
    stairSolids: stairs.solids,
    openings: walls.openings,
  };
}
