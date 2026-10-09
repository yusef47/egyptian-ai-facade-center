import type { Point2, ProjectGeometry, Space, Wall } from "./geometry";
import { GEOMETRY_MODEL_VERSION, polygonArea, wallLength } from "./geometry";
import { validateGeometry } from "./validate";

/**
 * A model may suggest cells and access links; it never authors walls, shared
 * references, SVG or DXF. This compiler creates those from the proposed
 * polygons and accepts the result only after deterministic topology checks.
 * It is a single-floor architectural concept, not an engineering approval.
 */
export const CONCEPT_PROPOSAL_VERSION = 2;
export const CONCEPT_CELL_KINDS = [
  "living", "bedroom", "kitchen", "bathroom", "corridor", "stair",
  "core", "office", "storage", "balcony", "service", "other",
] as const;
export type ConceptCellKind = typeof CONCEPT_CELL_KINDS[number];
export const CONCEPT_KIND_LABELS: Record<ConceptCellKind, { ar: string; en: string; fill: string }> = {
  living: { ar: "معيشة", en: "Living", fill: "#e6f0e8" },
  bedroom: { ar: "غرفة نوم", en: "Bedroom", fill: "#dfeaf2" },
  kitchen: { ar: "مطبخ", en: "Kitchen", fill: "#f5e9d5" },
  bathroom: { ar: "حمام", en: "Bathroom", fill: "#e3e8f5" },
  corridor: { ar: "ممر", en: "Corridor", fill: "#f0eee8" },
  stair: { ar: "سلم", en: "Stair", fill: "#ece4db" },
  core: { ar: "نواة", en: "Core", fill: "#dce9e7" },
  office: { ar: "مكتب", en: "Office", fill: "#eee7f3" },
  storage: { ar: "مخزن", en: "Storage", fill: "#eeeae0" },
  balcony: { ar: "شرفة", en: "Balcony", fill: "#e4f1ed" },
  service: { ar: "خدمات", en: "Service", fill: "#e8ebee" },
  other: { ar: "فراغ", en: "Space", fill: "#e8f1f1" },
};
export type ConceptCell = { id: string; name: string; kind: ConceptCellKind; points: Point2[] };
export type ConceptDoor = { from: string; to: string | "outside"; width: number; at: number };
/** The edge index refers to consecutive points of the named cell polygon. */
export type ConceptWindow = { space: string; edgeIndex: number; width: number; at: number };
export type ConceptProposal = {
  version: 2;
  site: Point2[];
  cells: ConceptCell[];
  doors: ConceptDoor[];
  /** Optional for saved v2 proposals created before window authoring existed. */
  windows?: ConceptWindow[];
};

export type ConceptProposalResult =
  | { ok: true; proposal: ConceptProposal; geometry: ProjectGeometry }
  | { ok: false; errors: string[] };

const SAFE_ID = /^[a-z][a-z0-9-]{0,39}$/;
const MAX_COORDINATE = 1000;
const PRECISION = 1000; // millimeter grid in meter coordinates
const EPSILON = 1e-7;

/** Free proposals currently share the workspace's full rectangular site. */
export function proposalMatchesSite(proposal: ConceptProposal, width: number, depth: number): boolean {
  const xs = proposal.site.map((point) => point.x);
  const ys = proposal.site.map((point) => point.y);
  return Math.abs(Math.min(...xs)) <= 0.001
    && Math.abs(Math.min(...ys)) <= 0.001
    && Math.abs(Math.max(...xs) - width) <= 0.001
    && Math.abs(Math.max(...ys) - depth) <= 0.001
    && Math.abs(polygonArea({ points: proposal.site }) - width * depth) <= 0.001;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function point(value: unknown): Point2 | null {
  if (!record(value) || !exactKeys(value, ["x", "y"])) return null;
  if (typeof value.x !== "number" || typeof value.y !== "number"
      || !Number.isFinite(value.x) || !Number.isFinite(value.y)
      || Math.abs(value.x) > MAX_COORDINATE || Math.abs(value.y) > MAX_COORDINATE) return null;
  return { x: Math.round(value.x * PRECISION) / PRECISION, y: Math.round(value.y * PRECISION) / PRECISION };
}

function points(value: unknown): Point2[] | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 64) return null;
  const parsed = value.map(point);
  return parsed.every((candidate): candidate is Point2 => candidate !== null) ? parsed : null;
}

/** A bounded schema for a freely proposed plan, separate from fixed layouts. */
export function parseConceptProposal(value: unknown): ConceptProposal | null {
  if (!record(value)
      || (value.version !== 1 && value.version !== CONCEPT_PROPOSAL_VERSION)) return null;
  const legacy = value.version === 1;
  const hasWindows = Object.prototype.hasOwnProperty.call(value, "windows");
  if (!exactKeys(value, hasWindows && !legacy
    ? ["version", "site", "cells", "doors", "windows"]
    : ["version", "site", "cells", "doors"])) return null;
  const site = points(value.site);
  if (!site || !Array.isArray(value.cells) || value.cells.length < 1 || value.cells.length > 30
      || !Array.isArray(value.doors) || value.doors.length > 40) return null;
  const cells: ConceptCell[] = [];
  const ids = new Set<string>();
  for (const item of value.cells) {
    if (!record(item) || !exactKeys(item, legacy ? ["id", "name", "points"] : ["id", "name", "kind", "points"])
        || typeof item.id !== "string" || !SAFE_ID.test(item.id)
        || item.id === "site" || item.id === "floor" || item.id === "outside" || item.id.startsWith("cp-wall-")
        || item.id.startsWith("cp-door-") || ids.has(item.id)
        || typeof item.name !== "string" || item.name.trim().length < 1 || item.name.length > 80
        || /[\u0000-\u001f\u007f]/.test(item.name)
        || (!legacy && !CONCEPT_CELL_KINDS.includes(item.kind as ConceptCellKind))) return null;
    const polygon = points(item.points);
    if (!polygon) return null;
    ids.add(item.id);
    // Old saved free concepts had names only. Preserve them as "other" until
    // the user/model explicitly assigns a semantic kind; never guess from text.
    cells.push({ id: item.id, name: item.name.trim(), kind: legacy ? "other" : item.kind as ConceptCellKind, points: polygon });
  }
  const doors: ConceptDoor[] = [];
  for (const item of value.doors) {
    if (!record(item) || !exactKeys(item, ["from", "to", "width", "at"])
        || typeof item.from !== "string" || !ids.has(item.from)
        || typeof item.to !== "string" || (item.to !== "outside" && !ids.has(item.to))
        || item.to === item.from
        || typeof item.width !== "number" || !Number.isFinite(item.width)
        || item.width < 0.6 || item.width > 3
        || typeof item.at !== "number" || !Number.isFinite(item.at)
        || item.at < 0 || item.at > 1) return null;
    doors.push({ from: item.from, to: item.to, width: item.width, at: item.at });
  }
  let windows: ConceptWindow[] | undefined;
  if (hasWindows) {
    if (!Array.isArray(value.windows) || value.windows.length > 40) return null;
    windows = [];
    for (const item of value.windows) {
      if (!record(item) || !exactKeys(item, ["space", "edgeIndex", "width", "at"])
          || typeof item.space !== "string" || !ids.has(item.space)
          || !Number.isInteger(item.edgeIndex) || (item.edgeIndex as number) < 0
          || (item.edgeIndex as number) >= cells.find((cell) => cell.id === item.space)!.points.length
          || typeof item.width !== "number" || !Number.isFinite(item.width)
          || item.width < 0.4 || item.width > 6
          || typeof item.at !== "number" || !Number.isFinite(item.at)
          || item.at < 0 || item.at > 1) return null;
      windows.push({ space: item.space, edgeIndex: item.edgeIndex as number, width: item.width, at: item.at });
    }
  }
  return { version: CONCEPT_PROPOSAL_VERSION, site, cells, doors, ...(windows ? { windows } : {}) };
}

function onSegment(point: Point2, start: Point2, end: Point2): boolean {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length <= EPSILON) return false;
  const distance = Math.abs(dx * (point.y - start.y) - dy * (point.x - start.x)) / length;
  const projection = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (length * length);
  return distance <= EPSILON && projection >= -EPSILON && projection <= 1 + EPSILON;
}

function segmentKey(a: Point2, b: Point2): string {
  const label = (point: Point2): string => `${Math.round(point.x * PRECISION)},${Math.round(point.y * PRECISION)}`;
  return [label(a), label(b)].sort().join("|");
}

/**
 * Every polygon edge is split at all proposed vertices on it. The same
 * undirected fragment then becomes one wall referenced by both neighbors.
 */
export function compileConceptProposal(value: unknown, options: { accessRoots?: string[] } = {}): ConceptProposalResult {
  const proposal = parseConceptProposal(value);
  if (!proposal) return { ok: false, errors: ["INVALID_CONCEPT_PROPOSAL"] };
  const allVertices = proposal.cells.flatMap((cell) => cell.points);
  const walls: Wall[] = [];
  const bySegment = new Map<string, Wall>();
  const spaces: Space[] = [];

  for (const cell of proposal.cells) {
    const wallIds: string[] = [];
    for (let index = 0; index < cell.points.length; index += 1) {
      const start = cell.points[index]!;
      const end = cell.points[(index + 1) % cell.points.length]!;
      const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
      if (lengthSquared <= EPSILON * EPSILON) return { ok: false, errors: [`ZERO_LENGTH_EDGE:${cell.id}`] };
      const cuts = allVertices.filter((vertex) => onSegment(vertex, start, end))
        .map((vertex) => ({
          vertex,
          parameter: ((vertex.x - start.x) * (end.x - start.x)
            + (vertex.y - start.y) * (end.y - start.y)) / lengthSquared,
        }))
        .sort((a, b) => a.parameter - b.parameter);
      for (let cut = 1; cut < cuts.length; cut += 1) {
        const a = cuts[cut - 1]!.vertex;
        const b = cuts[cut]!.vertex;
        if (Math.hypot(b.x - a.x, b.y - a.y) <= EPSILON) continue;
        const key = segmentKey(a, b);
        let wall = bySegment.get(key);
        if (!wall) {
          wall = { id: `cp-wall-${walls.length + 1}`, start: a, end: b, thickness: 0.25, sharedWith: [] };
          walls.push(wall);
          bySegment.set(key, wall);
        }
        if (!wall.sharedWith.includes(cell.id)) wall.sharedWith.push(cell.id);
        if (!wallIds.includes(wall.id)) wallIds.push(wall.id);
      }
    }
    spaces.push({ id: cell.id, name: cell.name, polygon: { points: cell.points }, wallIds });
  }

  for (const wall of walls) {
    if (wall.sharedWith.length > 2) return { ok: false, errors: [`WALL_SHARED_BY_MORE_THAN_TWO_SPACES:${wall.id}`] };
    if (wall.sharedWith.length === 2) wall.thickness = 0.2;
  }

  const geometry: ProjectGeometry = {
    schemaVersion: GEOMETRY_MODEL_VERSION,
    units: "meters",
    site: { id: "site", polygon: { points: proposal.site } },
    floor: { id: "floor", name: "Concept floor", elevation: 0, spaceIds: spaces.map((space) => space.id) },
    spaces,
    walls,
    openings: [],
  };
  const topology = validateGeometry(geometry);
  if (!topology.valid) return {
    ok: false,
    errors: topology.issues.map((issue) => `${issue.code}:${issue.elementIds.join(",")}`),
  };

  for (let index = 0; index < proposal.doors.length; index += 1) {
    const door = proposal.doors[index]!;
    const candidates = walls.filter((wall) =>
      wall.sharedWith.includes(door.from)
      && (door.to === "outside"
        ? wall.sharedWith.length === 1
        : wall.sharedWith.includes(door.to)),
    ).sort((a, b) => wallLength(b) - wallLength(a) || a.id.localeCompare(b.id));
    const wall = candidates.find((candidate) => wallLength(candidate) >= door.width + 0.2);
    if (!wall) return { ok: false, errors: [`DOOR_HAS_NO_SUITABLE_WALL:${door.from}:${door.to}`] };
    geometry.openings.push({
      id: `cp-door-${index + 1}`,
      kind: "door",
      wallId: wall.id,
      offset: (wallLength(wall) - door.width) * door.at,
      width: door.width,
    });
  }

  for (let index = 0; index < (proposal.windows?.length ?? 0); index += 1) {
    const window = proposal.windows![index]!;
    const cell = proposal.cells.find((candidate) => candidate.id === window.space)!;
    const start = cell.points[window.edgeIndex]!;
    const end = cell.points[(window.edgeIndex + 1) % cell.points.length]!;
    const candidates = walls.filter((wall) =>
      wall.sharedWith.length === 1 && wall.sharedWith[0] === window.space
      && onSegment(wall.start, start, end) && onSegment(wall.end, start, end),
    ).sort((a, b) => wallLength(b) - wallLength(a) || a.id.localeCompare(b.id));
    const wall = candidates.find((candidate) => wallLength(candidate) >= window.width + 0.2);
    if (!wall) return { ok: false, errors: [`WINDOW_HAS_NO_EXTERIOR_WALL:${window.space}:${window.edgeIndex}`] };
    geometry.openings.push({
      id: `cp-window-${index + 1}`,
      kind: "window",
      wallId: wall.id,
      offset: (wallLength(wall) - window.width) * window.at,
      width: window.width,
    });
  }

  const validation = validateGeometry(geometry);
  if (!validation.valid) return {
    ok: false,
    errors: validation.issues.map((issue) => `${issue.code}:${issue.elementIds.join(",")}`),
  };

  // A drawn room that cannot be reached through a door is not a usable plan.
  // This checks graph access only; door swing, egress distance and code rules
  // require separate architectural review.
  const accessRoots = options.accessRoots ?? ["outside"];
  if (accessRoots.length < 1 || accessRoots.some((id) => id !== "outside" && !proposal.cells.some((cell) => cell.id === id))) {
    return { ok: false, errors: ["INVALID_ACCESS_ROOT"] };
  }
  const reachable = new Set<string>(accessRoots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const door of proposal.doors) {
      if (reachable.has(door.from) && !reachable.has(door.to)) {
        reachable.add(door.to);
        changed = true;
      } else if (reachable.has(door.to) && !reachable.has(door.from)) {
        reachable.add(door.from);
        changed = true;
      }
    }
  }
  const inaccessible = proposal.cells.filter((cell) => !reachable.has(cell.id));
  if (inaccessible.length) return {
    ok: false,
    errors: inaccessible.map((cell) => `SPACE_WITHOUT_ACCESS:${cell.id}`),
  };

  // Public circulation and bedrooms should not require crossing someone
  // else's private room. An en-suite bathroom or store may be reached via
  // a bedroom; the room program is not forced into one fixed arrangement.
  // This is a planning heuristic, not an egress or building-code check.
  const privateKinds = new Set<ConceptCellKind>(["bedroom", "bathroom", "storage"]);
  const kindById = new Map(proposal.cells.map((cell) => [cell.id, cell.kind]));
  for (const target of proposal.cells) {
    if (target.kind === "bathroom" || target.kind === "storage") continue;
    const visited = new Set<string>(accessRoots);
    const queue = [...accessRoots];
    while (queue.length > 0 && !visited.has(target.id)) {
      const from = queue.shift()!;
      for (const door of proposal.doors) {
        const next = door.from === from ? door.to : door.to === from ? door.from : null;
        if (!next || visited.has(next)) continue;
        if (next !== target.id && privateKinds.has(kindById.get(next) as ConceptCellKind)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    if (!visited.has(target.id)) return { ok: false, errors: [`ACCESS_THROUGH_PRIVATE_SPACE:${target.id}`] };
  }
  return { ok: true, proposal, geometry };
}
