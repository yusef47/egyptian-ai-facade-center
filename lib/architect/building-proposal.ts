import type { Point2, ProjectGeometry } from "./geometry";
import {
  compileConceptProposal,
  parseConceptProposal,
  proposalMatchesSite,
  type ConceptProposal,
} from "./concept-proposal";
import { parseBuildingStructure, validateBuildingStructure, type BuildingStructure } from "./building-structure";
import { inspectVerticalCirculation, type VerticalCirculationReport } from "./vertical-circulation";
import { parseBuildingStairs, validateBuildingStairs, type BuildingStair } from "./building-stair";

/** A stack of independently authored floor plans sharing one vertical core. */
export type BuildingFloorProposal = {
  id: string;
  name: string;
  elevation: number;
  plan: ConceptProposal;
};
export type BuildingProposal = {
  kind: "building";
  version: 1;
  coreCellId: string;
  floors: BuildingFloorProposal[];
  /** Authored geometry for coordination only, never proof of structural adequacy. */
  structure?: BuildingStructure;
  /** Explicit concept stair flights; no automatic code or egress approval. */
  stairs?: BuildingStair[];
};
export type DesignProposal = ConceptProposal | BuildingProposal;
export type CompiledDesign =
  | { ok: true; kind: "floor"; proposal: ConceptProposal; geometry: ProjectGeometry }
  | { ok: true; kind: "building"; proposal: BuildingProposal; floors: Array<BuildingFloorProposal & { geometry: ProjectGeometry }>; circulation: VerticalCirculationReport }
  | { ok: false; errors: string[] };

const SAFE_ID = /^[a-z][a-z0-9-]{0,39}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const MAX_BUILDING_CHARS = 48_000;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysMatch(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === keys.sort().join(",");
}

/** Canonical ring equality permits a rotated start vertex or reversed winding. */
function ringKey(points: Point2[]): string {
  const labels = points.map((point) => `${point.x},${point.y}`);
  const variants: string[] = [];
  for (const sequence of [labels, [...labels].reverse()]) {
    for (let start = 0; start < sequence.length; start += 1) {
      variants.push([...sequence.slice(start), ...sequence.slice(0, start)].join("|"));
    }
  }
  return variants.sort()[0] ?? "";
}

/** Parse model and project-file data without trusting authored geometry. */
export function parseBuildingProposal(value: unknown): BuildingProposal | null {
  if (!record(value)) return null;
  const hasStructure = Object.prototype.hasOwnProperty.call(value, "structure");
  const hasStairs = Object.prototype.hasOwnProperty.call(value, "stairs");
  if (!keysMatch(value, ["kind", "version", "coreCellId", "floors",
    ...(hasStructure ? ["structure"] : []), ...(hasStairs ? ["stairs"] : [])])
      || value.kind !== "building" || value.version !== 1
      || typeof value.coreCellId !== "string" || !SAFE_ID.test(value.coreCellId)
      || !Array.isArray(value.floors) || value.floors.length < 2 || value.floors.length > 5) return null;
  // The complete saved design is sent back as chat context on every edit.
  // Keep that context bounded before it reaches the upstream model.
  try {
    if (JSON.stringify(value).length > MAX_BUILDING_CHARS) return null;
  } catch {
    return null;
  }
  const floors: BuildingFloorProposal[] = [];
  const ids = new Set<string>();
  for (const item of value.floors) {
    if (!record(item) || !keysMatch(item, ["id", "name", "elevation", "plan"])
        || typeof item.id !== "string" || !SAFE_ID.test(item.id) || ids.has(item.id)
        || typeof item.name !== "string" || item.name.trim().length < 1 || item.name.length > 80 || CONTROL.test(item.name)
        || typeof item.elevation !== "number" || !Number.isFinite(item.elevation)
        || item.elevation < -30 || item.elevation > 100) return null;
    const plan = parseConceptProposal(item.plan);
    if (!plan) return null;
    const elevation = Math.round(item.elevation * 1000) / 1000;
    if (floors.length > 0 && elevation <= floors[floors.length - 1]!.elevation) return null;
    ids.add(item.id);
    floors.push({ id: item.id, name: item.name.trim(), elevation, plan });
  }
  if (!floors.some((floor) => floor.elevation === 0)) return null;
  const structure = hasStructure ? parseBuildingStructure(value.structure) : null;
  if (hasStructure && !structure) return null;
  const stairs = hasStairs ? parseBuildingStairs(value.stairs) : null;
  if (hasStairs && !stairs) return null;
  return { kind: "building", version: 1, coreCellId: value.coreCellId, floors,
    ...(structure ? { structure } : {}), ...(stairs ? { stairs } : {}) };
}

/** Compile every floor and check a continuous core footprint across the stack. */
export function compileBuildingProposal(value: unknown): CompiledDesign {
  const proposal = parseBuildingProposal(value);
  if (!proposal) return { ok: false, errors: ["INVALID_BUILDING_PROPOSAL"] };
  const firstSite = ringKey(proposal.floors[0]!.plan.site);
  let coreFootprint: string | null = null;
  const floors: Array<BuildingFloorProposal & { geometry: ProjectGeometry }> = [];
  for (const floor of proposal.floors) {
    if (ringKey(floor.plan.site) !== firstSite) return { ok: false, errors: [`FLOOR_SITE_MISMATCH:${floor.id}`] };
    const core = floor.plan.cells.find((cell) => cell.id === proposal.coreCellId);
    if (!core || (core.kind !== "stair" && core.kind !== "core")) {
      return { ok: false, errors: [`VERTICAL_CORE_MISSING:${floor.id}`] };
    }
    const footprint = ringKey(core.points);
    if (coreFootprint !== null && footprint !== coreFootprint) {
      return { ok: false, errors: [`VERTICAL_CORE_MISALIGNED:${floor.id}`] };
    }
    coreFootprint = footprint;
    const compiled = compileConceptProposal(floor.plan, {
      accessRoots: floor.elevation === 0 ? ["outside"] : [proposal.coreCellId],
    });
    if (!compiled.ok) return { ok: false, errors: compiled.errors.map((error) => `${floor.id}:${error}`) };
    floors.push({
      ...floor,
      plan: compiled.proposal,
      geometry: {
        ...compiled.geometry,
        floor: { ...compiled.geometry.floor, id: floor.id, name: floor.name, elevation: floor.elevation },
      },
    });
  }
  if (proposal.structure) {
    const errors = validateBuildingStructure(proposal.structure, floors.map((floor) => ({
      id: floor.id,
      site: floor.plan.site,
      core: floor.plan.cells.find((cell) => cell.id === proposal.coreCellId)!.points,
      spaces: floor.plan.cells.map((cell) => cell.points),
      walls: floor.geometry.walls,
      openings: floor.geometry.openings,
    })));
    if (errors.length) return { ok: false, errors };
  }
  if (proposal.stairs) {
    const errors = validateBuildingStairs(proposal.stairs, floors.map((floor) => ({
      id: floor.id,
      elevation: floor.elevation,
      core: floor.plan.cells.find((cell) => cell.id === proposal.coreCellId)!.points,
      geometry: floor.geometry,
    })), proposal.coreCellId);
    if (errors.length) return { ok: false, errors };
  }
  return { ok: true, kind: "building", proposal, floors,
    circulation: inspectVerticalCirculation(floors, proposal.coreCellId, proposal.stairs) };
}

/** Dispatches saved/model proposals while preserving existing one-floor drafts. */
export function compileDesignProposal(value: unknown): CompiledDesign {
  if (record(value) && value.kind === "building") return compileBuildingProposal(value);
  const compiled = compileConceptProposal(value);
  return compiled.ok
    ? { ok: true, kind: "floor", proposal: compiled.proposal, geometry: compiled.geometry }
    : compiled;
}

export function designMatchesSite(proposal: DesignProposal, width: number, depth: number): boolean {
  return "floors" in proposal
    ? proposal.floors.every((floor) => proposalMatchesSite(floor.plan, width, depth))
    : proposalMatchesSite(proposal, width, depth);
}
