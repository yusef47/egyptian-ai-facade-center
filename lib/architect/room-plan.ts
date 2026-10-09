import type { Point2, ProjectGeometry, Space } from "./geometry";
import { polygonArea } from "./geometry";
import { buildDxfPlan, buildSvgPlan, type DxfOverlay } from "./export-plan";

/** Editable room program. IDs are stable so later model commands can address one room. */
export type RoomKind = "living" | "bedroom" | "kitchen" | "bathroom" | "office" | "storage";
export type UnitKey = "unit-a" | "unit-b";
export type RoomRequest = { id: string; kind: RoomKind; preferredArea: number };
export type RoomProgram = Record<UnitKey, RoomRequest[]>;
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };
export type PlanLine = { start: Point2; end: Point2; kind: "partition" | "door" };
export type RoomCell = {
  id: string;
  unit: UnitKey;
  kind: RoomKind;
  rect: Rect;
  area: number;
};
export type CorridorCell = { unit: UnitKey; rect: Rect; area: number };
export type RoomPlan = {
  rooms: RoomCell[];
  corridors: CorridorCell[];
  lines: PlanLine[];
};
export type RoomPlanResult =
  | { ok: true; plan: RoomPlan }
  | { ok: false; errors: string[] };
export type RoomAction =
  | { op: "add"; unit: UnitKey; kind: RoomKind; preferredArea?: number }
  | { op: "remove"; unit: UnitKey; roomId: string }
  | { op: "set"; unit: UnitKey; roomId: string; kind?: RoomKind; preferredArea?: number }
  | { op: "move"; unit: UnitKey; roomId: string; toIndex: number };

export const ROOM_KIND_INFO: Record<RoomKind, { ar: string; en: string; preferredArea: number; minArea: number; minRun: number }> = {
  living: { ar: "معيشة", en: "Living", preferredArea: 24, minArea: 14, minRun: 2.1 },
  bedroom: { ar: "نوم", en: "Bedroom", preferredArea: 16, minArea: 10, minRun: 2.1 },
  kitchen: { ar: "مطبخ", en: "Kitchen", preferredArea: 12, minArea: 7, minRun: 2.1 },
  bathroom: { ar: "حمام", en: "Bath", preferredArea: 7, minArea: 3, minRun: 1.5 },
  office: { ar: "مكتب", en: "Office", preferredArea: 12, minArea: 7, minRun: 2.1 },
  storage: { ar: "مخزن", en: "Store", preferredArea: 5, minArea: 3, minRun: 1.2 },
};

function isRoomKind(value: unknown): value is RoomKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROOM_KIND_INFO, value);
}

export function defaultRoomProgram(): RoomProgram {
  const requests = (): RoomRequest[] => [
    { id: "living-1", kind: "living", preferredArea: 24 },
    { id: "bedroom-1", kind: "bedroom", preferredArea: 16 },
    { id: "bedroom-2", kind: "bedroom", preferredArea: 16 },
    { id: "kitchen-1", kind: "kitchen", preferredArea: 12 },
    { id: "bathroom-1", kind: "bathroom", preferredArea: 7 },
  ];
  return { "unit-a": requests(), "unit-b": requests() };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Strictly parse client-supplied room state before it becomes model context. */
export function parseRoomProgram(value: unknown): RoomProgram | null {
  if (!record(value) || Object.keys(value).sort().join(",") !== "unit-a,unit-b") return null;
  const output: RoomProgram = { "unit-a": [], "unit-b": [] };
  for (const unit of ["unit-a", "unit-b"] as const) {
    const requests = value[unit];
    if (!Array.isArray(requests) || requests.length < 1 || requests.length > 12) return null;
    const ids = new Set<string>();
    for (const request of requests) {
      if (!record(request) || Object.keys(request).sort().join(",") !== "id,kind,preferredArea") return null;
      if (typeof request.id !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(request.id) || ids.has(request.id)) return null;
      if (!isRoomKind(request.kind)) return null;
      if (typeof request.preferredArea !== "number" || !Number.isFinite(request.preferredArea) || request.preferredArea <= 0 || request.preferredArea > 300) return null;
      ids.add(request.id);
      output[unit].push({ id: request.id, kind: request.kind as RoomKind, preferredArea: request.preferredArea });
    }
  }
  return output;
}

/** Validate the model's requested room edits; never execute raw model JSON. */
export function parseRoomActions(value: unknown): RoomAction[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) return null;
  const actions: RoomAction[] = [];
  for (const entry of value) {
    if (!record(entry) || (entry.unit !== "unit-a" && entry.unit !== "unit-b")) return null;
    const keys = Object.keys(entry);
    if (entry.op === "add") {
      if (keys.some((key) => !["op", "unit", "kind", "preferredArea"].includes(key))) return null;
      if (!isRoomKind(entry.kind)) return null;
      if (entry.preferredArea !== undefined && (typeof entry.preferredArea !== "number" || !Number.isFinite(entry.preferredArea) || entry.preferredArea <= 0 || entry.preferredArea > 300)) return null;
      actions.push({ op: "add", unit: entry.unit, kind: entry.kind as RoomKind, ...(entry.preferredArea === undefined ? {} : { preferredArea: entry.preferredArea as number }) });
    } else if (entry.op === "remove") {
      if (keys.some((key) => !["op", "unit", "roomId"].includes(key))) return null;
      if (typeof entry.roomId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(entry.roomId)) return null;
      actions.push({ op: "remove", unit: entry.unit, roomId: entry.roomId });
    } else if (entry.op === "set") {
      if (keys.some((key) => !["op", "unit", "roomId", "kind", "preferredArea"].includes(key))) return null;
      if (typeof entry.roomId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(entry.roomId)) return null;
      if (entry.kind === undefined && entry.preferredArea === undefined) return null;
      if (entry.kind !== undefined && !isRoomKind(entry.kind)) return null;
      if (entry.preferredArea !== undefined && (typeof entry.preferredArea !== "number" || !Number.isFinite(entry.preferredArea) || entry.preferredArea <= 0 || entry.preferredArea > 300)) return null;
      actions.push({
        op: "set", unit: entry.unit, roomId: entry.roomId,
        ...(entry.kind === undefined ? {} : { kind: entry.kind as RoomKind }),
        ...(entry.preferredArea === undefined ? {} : { preferredArea: entry.preferredArea as number }),
      });
    } else if (entry.op === "move") {
      if (keys.some((key) => !["op", "unit", "roomId", "toIndex"].includes(key))) return null;
      if (typeof entry.roomId !== "string" || !/^[a-z][a-z0-9-]{0,39}$/.test(entry.roomId)) return null;
      if (!Number.isInteger(entry.toIndex) || (entry.toIndex as number) < 0 || (entry.toIndex as number) > 11) return null;
      actions.push({ op: "move", unit: entry.unit, roomId: entry.roomId, toIndex: entry.toIndex as number });
    } else {
      return null;
    }
  }
  return actions;
}

export function applyRoomActions(
  current: RoomProgram,
  rawActions: unknown,
  options: Array<{ geometry: ProjectGeometry; coreSide: "east" | "west" }>,
): { ok: true; program: RoomProgram } | { ok: false; errors: string[] } {
  const actions = parseRoomActions(rawActions);
  const parsed = parseRoomProgram(current);
  if (!actions || !parsed) return { ok: false, errors: ["Invalid room actions or current program."] };
  for (const action of actions) {
    const list = parsed[action.unit];
    if (action.op === "add") {
      let number = 1;
      while (list.some((room) => room.id === "room-" + number)) number += 1;
      list.push({
        id: "room-" + number,
        kind: action.kind,
        preferredArea: action.preferredArea ?? ROOM_KIND_INFO[action.kind].preferredArea,
      });
    } else {
      const index = list.findIndex((room) => room.id === action.roomId);
      if (index < 0) return { ok: false, errors: ["Room ID was not found: " + action.roomId] };
      if (action.op === "remove") list.splice(index, 1);
      else if (action.op === "move") {
        if (action.toIndex >= list.length) return { ok: false, errors: ["Room destination is outside the unit program."] };
        const [moved] = list.splice(index, 1);
        list.splice(action.toIndex, 0, moved!);
      } else list[index] = { ...list[index]!, ...(action.kind ? { kind: action.kind } : {}), ...(action.preferredArea === undefined ? {} : { preferredArea: action.preferredArea }) };
    }
  }
  if (!parseRoomProgram(parsed)) return { ok: false, errors: ["The room program would become invalid."] };
  const errors = options.flatMap((option) => {
    const result = buildRoomPlan(option.geometry, parsed, option.coreSide);
    return result.ok ? [] : result.errors;
  });
  return errors.length ? { ok: false, errors } : { ok: true, program: parsed };
}

function bounds(space: Space): Rect {
  const xs = space.polygon.points.map((point) => point.x);
  const ys = space.polygon.points.map((point) => point.y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys),
  };
}

function area(rect: Rect): number {
  return (rect.maxX - rect.minX) * (rect.maxY - rect.minY);
}

function line(start: Point2, end: Point2, kind: PlanLine["kind"] = "partition"): PlanLine {
  return { start, end, kind };
}

function roomMinimumRun(request: RoomRequest, crossSpan: number): number {
  const info = ROOM_KIND_INFO[request.kind];
  return Math.max(info.minRun, info.minArea / crossSpan);
}

/**
 * Generate a connected room arrangement inside each existing unit cell.
 * The access corridor occupies a strip along the unit's existing entry wall.
 * Every room directly touches that corridor and receives its own door.
 * Room types/counts are supplied by the caller; the geometry is derived, not
 * copied from a stored apartment plan. This is an architectural concept
 * solver, not a code or accessibility compliance decision.
 */
export function buildRoomPlan(geometry: ProjectGeometry, program: RoomProgram, coreSide: "east" | "west"): RoomPlanResult {
  const errors: string[] = [];
  const rooms: RoomCell[] = [];
  const corridors: CorridorCell[] = [];
  const lines: PlanLine[] = [];
  const corridorWidth = 1.25;
  const doorWidth = 0.85;

  for (const unit of ["unit-a", "unit-b"] as const) {
    const space = geometry.spaces.find((candidate) => candidate.id.endsWith("-space-" + unit));
    const requests = program[unit];
    if (!space || !Array.isArray(requests)) {
      errors.push(unit + ": missing planning cell or room program");
      continue;
    }
    if (requests.length < 1 || requests.length > 12) {
      errors.push(unit + ": choose 1 to 12 rooms");
      continue;
    }
    const unique = new Set<string>();
    let valid = true;
    for (const request of requests) {
      if (!request || typeof request.id !== "string" ||
          !/^[a-z][a-z0-9-]{0,39}$/.test(request.id) || unique.has(request.id) || !isRoomKind(request.kind) ||
          !Number.isFinite(request.preferredArea) || request.preferredArea <= 0 || request.preferredArea > 300) {
        valid = false;
        break;
      }
      unique.add(request.id);
    }
    if (!valid) {
      errors.push(unit + ": invalid room request");
      continue;
    }

    const box = bounds(space);
    const width = box.maxX - box.minX;
    const depth = box.maxY - box.minY;
    if (Math.abs(area(box) - polygonArea(space.polygon)) > 0.001) {
      errors.push(unit + ": room solver currently needs a rectangular unit boundary");
      continue;
    }
    // Unit A is entered from the vertical core wall. Unit B is entered
    // through its north wall. Their corridors therefore have distinct axes.
    const vertical = unit === "unit-a";
    const run = vertical ? depth : width;
    const crossSpan = (vertical ? width : depth) - corridorWidth;
    if (crossSpan < 2.5) {
      errors.push(unit + ": too narrow for rooms and a circulation strip");
      continue;
    }
    const minimumRuns = requests.map((request) => roomMinimumRun(request, crossSpan));
    const minimumTotal = minimumRuns.reduce((sum, value) => sum + value, 0);
    if (minimumTotal > run + 1e-7) {
      errors.push(unit + ": requested rooms cannot fit along the available frontage");
      continue;
    }
    const weights = requests.map((request) => request.preferredArea);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const leftover = Math.max(0, run - minimumTotal);
    const spans = requests.map((_, index) => minimumRuns[index]! + leftover * weights[index]! / weightTotal);

    const corridor: Rect = vertical
      ? coreSide === "east"
        ? { minX: box.maxX - corridorWidth, maxX: box.maxX, minY: box.minY, maxY: box.maxY }
        : { minX: box.minX, maxX: box.minX + corridorWidth, minY: box.minY, maxY: box.maxY }
      : { minX: box.minX, maxX: box.maxX, minY: box.maxY - corridorWidth, maxY: box.maxY };
    const roomBlock: Rect = vertical
      ? coreSide === "east"
        ? { minX: box.minX, maxX: corridor.minX, minY: box.minY, maxY: box.maxY }
        : { minX: corridor.maxX, maxX: box.maxX, minY: box.minY, maxY: box.maxY }
      : { minX: box.minX, maxX: box.maxX, minY: box.minY, maxY: corridor.minY };

    const candidateRooms: RoomCell[] = [];
    const candidateLines: PlanLine[] = [];
    let cursor = vertical ? box.minY : box.minX;
    for (let index = 0; index < requests.length; index += 1) {
      const request = requests[index]!;
      const next = index === requests.length - 1 ? (vertical ? box.maxY : box.maxX) : cursor + spans[index]!;
      const rect: Rect = vertical
        ? { ...roomBlock, minY: cursor, maxY: next }
        : { ...roomBlock, minX: cursor, maxX: next };
      const actualArea = area(rect);
      if (actualArea + 1e-7 < ROOM_KIND_INFO[request.kind].minArea) {
        errors.push(unit + ": " + request.id + " falls below its minimum concept area");
      }
      candidateRooms.push({ id: unit + "-" + request.id, unit, kind: request.kind, rect, area: actualArea });

      if (index > 0) {
        candidateLines.push(vertical
          ? line({ x: roomBlock.minX, y: cursor }, { x: roomBlock.maxX, y: cursor })
          : line({ x: cursor, y: roomBlock.minY }, { x: cursor, y: roomBlock.maxY }));
      }
      const mid = (cursor + next) / 2;
      const near = mid - doorWidth / 2;
      const far = mid + doorWidth / 2;
      if (vertical) {
        const edgeX = coreSide === "east" ? corridor.minX : corridor.maxX;
        candidateLines.push(line({ x: edgeX, y: cursor }, { x: edgeX, y: near }));
        candidateLines.push(line({ x: edgeX, y: near }, { x: edgeX, y: far }, "door"));
        candidateLines.push(line({ x: edgeX, y: far }, { x: edgeX, y: next }));
      } else {
        const edgeY = corridor.minY;
        candidateLines.push(line({ x: cursor, y: edgeY }, { x: near, y: edgeY }));
        candidateLines.push(line({ x: near, y: edgeY }, { x: far, y: edgeY }, "door"));
        candidateLines.push(line({ x: far, y: edgeY }, { x: next, y: edgeY }));
      }
      cursor = next;
    }
    if (errors.some((error) => error.startsWith(unit + ":"))) continue;
    const covered = candidateRooms.reduce((sum, room) => sum + room.area, 0) + area(corridor);
    if (Math.abs(covered - polygonArea(space.polygon)) > 0.001) {
      errors.push(unit + ": generated rooms do not cover the planning cell");
      continue;
    }
    rooms.push(...candidateRooms);
    corridors.push({ unit, rect: corridor, area: area(corridor) });
    lines.push(...candidateLines);
  }
  return errors.length ? { ok: false, errors } : { ok: true, plan: { rooms, corridors, lines } };
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(value: number): string {
  return value.toFixed(2);
}

/** SVG room layer from the same metric coordinates as the base plan. */
export function buildRoomPlanSvg(geometry: ProjectGeometry, plan: RoomPlan, locale: "ar" | "en"): string {
  const siteMinX = Math.min(...geometry.site.polygon.points.map((point) => point.x));
  const siteMaxY = Math.max(...geometry.site.polygon.points.map((point) => point.y));
  const map = (point: Point2): Point2 => ({ x: point.x - siteMinX + 1, y: siteMaxY - point.y + 1 });
  const rectPoints = (rect: Rect): string => [
    { x: rect.minX, y: rect.minY }, { x: rect.maxX, y: rect.minY },
    { x: rect.maxX, y: rect.maxY }, { x: rect.minX, y: rect.maxY },
  ].map((point) => {
    const mapped = map(point);
    return fmt(mapped.x) + "," + fmt(mapped.y);
  }).join(" ");
  const fills: Record<RoomKind, string> = {
    living: "#e7f1ed", bedroom: "#dce9e8", kitchen: "#f7e6cc",
    bathroom: "#d9e9f5", office: "#eee3f3", storage: "#eeeae0",
  };
  const parts: string[] = ['<g id="room-plan" data-detail="concept-rooms">'];
  for (const corridor of plan.corridors) {
    parts.push('<polygon data-corridor="' + corridor.unit + '" points="' + rectPoints(corridor.rect) + '" fill="#f5f2e9"/>');
  }
  for (const room of plan.rooms) {
    const center = map({ x: (room.rect.minX + room.rect.maxX) / 2, y: (room.rect.minY + room.rect.maxY) / 2 });
    const label = ROOM_KIND_INFO[room.kind][locale];
    parts.push('<g data-room="' + escapeXml(room.id) + '"><polygon points="' + rectPoints(room.rect) + '" fill="' + fills[room.kind] + '"/>');
    parts.push('<text x="' + fmt(center.x) + '" y="' + fmt(center.y - 0.17) + '" text-anchor="middle" font-family="Cairo,Tahoma,sans-serif" font-size="0.47" font-weight="700" fill="#183038">' + escapeXml(label) + '</text>');
    parts.push('<text x="' + fmt(center.x) + '" y="' + fmt(center.y + 0.36) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="0.31" fill="#537078">' + fmt(room.area) + ' m²</text></g>');
  }
  for (const segment of plan.lines) {
    const start = map(segment.start);
    const end = map(segment.end);
    parts.push('<line x1="' + fmt(start.x) + '" y1="' + fmt(start.y) + '" x2="' + fmt(end.x) + '" y2="' + fmt(end.y) + '" stroke="' + (segment.kind === "door" ? "#bd7d2f" : "#23383c") + '" stroke-width="' + (segment.kind === "door" ? "0.17" : "0.13") + '"/>');
  }
  parts.push("</g>");
  return buildSvgPlan(geometry, { locale, showSpaceLabels: false }).replace('<g id="walls">', parts.join("") + '<g id="walls">');
}

/** Add interior partitions, door marks and room labels to the same AC1009 DXF. */
export function buildRoomPlanDxf(geometry: ProjectGeometry, plan: RoomPlan): string {
  const overlay: DxfOverlay = {
    layers: ["ROOM_PARTITIONS", "ROOM_DOORS", "ROOM_NAMES"],
    entities: [],
  };
  for (const segment of plan.lines) {
    overlay.entities.push({
      type: "line",
      layer: segment.kind === "door" ? "ROOM_DOORS" : "ROOM_PARTITIONS",
      start: segment.start,
      end: segment.end,
    });
  }
  for (const room of plan.rooms) {
    overlay.entities.push({
      type: "text",
      layer: "ROOM_NAMES",
      position: { x: (room.rect.minX + room.rect.maxX) / 2, y: (room.rect.minY + room.rect.maxY) / 2 },
      height: 0.3,
      text: ROOM_KIND_INFO[room.kind].en + " " + room.area.toFixed(2) + " m2",
    });
  }
  return buildDxfPlan(geometry, overlay);
}
