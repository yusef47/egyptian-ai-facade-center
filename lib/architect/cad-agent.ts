import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import sharp from "sharp";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { FREECAD_HARNESS } from "./cad-agent-harness";

const PROJECTS = "/vercel/sandbox/cad-projects";
const RUNTIME = "/vercel/sandbox/cad-runtime";
const READY = `${RUNTIME}/ready`;
const IMAGE = "vercel/sandbox/universal:latest";
const FREECAD_URL = "https://github.com/FreeCAD/FreeCAD/releases/download/1.1.3/FreeCAD_1.1.3-Linux-x86_64-py311.AppImage";
const FREECAD_SHA256 = "3a853eb69ee595f779f2255dbf80a765926981d8ff68903cefee4dfb03a8f5ef";
const CAD_ID = /^[a-z][a-z0-9_-]{1,39}$/i;

export const CAD_AGENT = { maxBrief: 1500, maxCode: 14000, maxSteps: 4, maxSvg: 500_000 } as const;
export type CadInput = { projectId: string; instruction: string; siteWidth: number; siteDepth: number; step: number; executionError?: string };
export type CadAction = { python: string; summary: string; done: boolean };
export type CadLayer = "SITE" | "WALL" | "BEAM" | "DOOR" | "WINDOW" | "STAIR" | "FURNITURE" | "DIMENSION" | "COLUMN" | "TEXT" | "HATCH" | "OTHER";
export type CadFurnitureKind = "bed" | "bed-single" | "bed-double" | "sofa" | "sofa-2-seat" | "sofa-3-seat" | "armchair" | "dining-table" | "dining-table-4" | "dining-table-6" | "desk" | "wardrobe" | "kitchen-counter" | "kitchen-island" | "refrigerator" | "cooker" | "kitchen-sink" | "sink" | "bath-vanity" | "toilet" | "bathtub" | "shower" | "chair" | "car-compact" | "car-sedan" | "car-suv" | "generic-block";
export type CadCommand =
  | { op: "line"; id: string; from: [number, number]; to: [number, number]; layer?: "WALL" | "DIMENSION" }
  | { op: "polyline"; id: string; points: [number, number][]; closed: boolean; layer: CadLayer }
  | { op: "circle"; id: string; center: [number, number]; radius: number; layer: CadLayer }
  | { op: "arc"; id: string; center: [number, number]; radius: number; startAngle: number; endAngle: number; layer: CadLayer }
  | { op: "wall"; id: string; from: [number, number]; to: [number, number]; thickness: number }
  | { op: "beam"; id: string; from: [number, number]; to: [number, number]; width: number }
  | { op: "opening"; id: string; wallId: string; offset: number; kind: "DOOR" | "WINDOW"; width: number; swingSide?: 1 | -1 }
  | { op: "room"; id: string; name: string; at: [number, number] }
  | { op: "dimension"; id: string; from: [number, number]; to: [number, number]; offset: number }
  | { op: "move"; id: string; delta: [number, number] }
  | { op: "rotate"; id: string; center: [number, number]; angle: number }
  | { op: "copy"; id: string; sourceId: string; delta: [number, number] }
  | { op: "offset"; id: string; sourceId: string; distance: number }
  | { op: "set-layer"; id: string; layer: CadLayer }
  | { op: "hatch"; id: string; targetId: string; pattern: "diagonal" | "cross" | "tile"; spacing: number; angle: number }
  | { op: "stair"; id: string; kind: string; at: [number, number]; width: number; depth: number; angle?: number; treads: number }
  | { op: "furniture"; id: string; kind: CadFurnitureKind; at: [number, number]; width: number; depth: number; angle?: number }
  | { op: "column"; id: string; kind: string; at: [number, number]; width: number; depth: number; angle?: number }
  | { op: "delete"; id: string };
export type CadRequirementReview = { requirement: string; status: "met" | "unresolved"; evidenceIds: string[]; evidence: string };
export type CadCommandAction = { commands: CadCommand[]; summary: string; selfReview: string[]; requiredElements: CadRequirementReview[]; unresolvedItems: string[]; done: boolean };
export type CadCommandRejection = { category: string; commandIndex?: number; op?: string; schemaFields?: string[] };
export type CadInspection = { ok: boolean; error?: string; objects: { id?: string; label: string; type: string; layer: string; semantic?: string; kind?: string; text?: string; positionMm?: number[]; boundsMm?: number[]; wallStartMm?: number[]; wallEndMm?: number[]; wallThicknessMm?: number; wallOpenings?: string[]; hostWallId?: string; openingOffsetMm?: number; openingWidthMm?: number; lineStartMm?: number[]; lineEndMm?: number[]; polylinePointsMm?: number[][]; closed?: boolean; hatchHostId?: string }[]; objectIds?: string[]; counts: Record<string, number>; warnings: string[]; unverifiedChecks?: string[]; segments: number; siteMm: number[] };
export type CadBoundsViolation = { code: "OUTSIDE_SITE"; id: string; label: string; boundsMm: [number, number, number, number]; siteMm: [number, number]; extremeBounds?: boolean };

export function parseCadBoundsFailure(error: string): CadBoundsViolation[] | null {
  const prefix = "CAD_BOUNDS_ERROR:";
  if (!error.startsWith(prefix)) return null;
  let raw: unknown;
  try { raw = JSON.parse(error.slice(prefix.length)); } catch { return null; }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) return null;
  const layers = new Set(["SITE", "WALL", "BEAM", "DOOR", "WINDOW", "STAIR", "FURNITURE", "DIMENSION", "COLUMN", "TEXT", "HATCH", "OTHER"]);
  const violations: CadBoundsViolation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (record.code !== "OUTSIDE_SITE" || typeof record.id !== "string" || !CAD_ID.test(record.id) || typeof record.label !== "string" || !layers.has(record.label.slice(0, record.label.indexOf("_"))) || !record.label.endsWith(`_${record.id}`) || !Array.isArray(record.boundsMm) || record.boundsMm.length !== 4 || !record.boundsMm.every((value) => typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 1e300) || (record.extremeBounds !== undefined && typeof record.extremeBounds !== "boolean") || !Array.isArray(record.siteMm) || record.siteMm.length !== 2 || !record.siteMm.every((value) => typeof value === "number" && Number.isFinite(value) && value >= 3_000 && value <= 100_000)) return null;
    const rawBounds = record.boundsMm as number[];
    const extremeBounds = record.extremeBounds === true || rawBounds.some((value) => Math.abs(value) > 1_000_000);
    const bounds = rawBounds.map((value) => Math.max(-1_000_000, Math.min(1_000_000, value)));
    if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return null;
    violations.push({ code: "OUTSIDE_SITE", id: record.id, label: record.label, boundsMm: bounds as CadBoundsViolation["boundsMm"], siteMm: record.siteMm as CadBoundsViolation["siteMm"], ...(extremeBounds ? { extremeBounds: true } : {}) });
  }
  return violations;
}

export class CadGeometryBoundsError extends Error {
  constructor(readonly violations: CadBoundsViolation[]) {
    const details = violations.map((item) => `${item.label} (id=${item.id}, boundsMm=[${item.boundsMm.join(",")}], siteMm=[0,0,${item.siteMm.join(",")}])`).join("; ");
    const unstable = violations.some((item) => item.extremeBounds) ? " At least one object's bounds are numerically extreme; delete and recreate that ID with simple geometry instead of reusing or transforming it." : "";
    super(`CAD validation failed: geometry outside the site boundary: ${details}. Keep the full geometry inside the site, including wall thicknesses, door swing arcs, dimensions, and rotated symbols.${unstable}`);
    this.name = "CadGeometryBoundsError";
  }
}

export function cadAgentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.QATTAN_BLENDER_LAB_ENABLED === "1" && !!resolveArchitectTextModel(env) && !!env.OPENROUTER_API_KEY?.trim();
}

export function parseCadInput(raw: unknown): CadInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.projectId !== "string" || !/^[0-9a-f]{24}$/.test(v.projectId)) return null;
  if (typeof v.instruction !== "string" || !v.instruction.trim() || v.instruction.length > CAD_AGENT.maxBrief) return null;
  if (typeof v.siteWidth !== "number" || !Number.isFinite(v.siteWidth) || v.siteWidth < 3 || v.siteWidth > 100) return null;
  if (typeof v.siteDepth !== "number" || !Number.isFinite(v.siteDepth) || v.siteDepth < 3 || v.siteDepth > 100) return null;
  if (!Number.isInteger(v.step) || (v.step as number) < 0 || (v.step as number) >= CAD_AGENT.maxSteps) return null;
  if (v.executionError !== undefined && (typeof v.executionError !== "string" || v.executionError.length > 1500)) return null;
  return { projectId: v.projectId, instruction: v.instruction.trim(), siteWidth: v.siteWidth, siteDepth: v.siteDepth, step: v.step as number, executionError: v.executionError as string | undefined };
}

export function parseCadAction(text: string): CadAction | null {
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  if (typeof value.python !== "string" || !value.python.trim() || value.python.length > CAD_AGENT.maxCode) return null;
  if (typeof value.summary !== "string" || !value.summary.trim() || value.summary.length > 500) return null;
  if (typeof value.done !== "boolean") return null;
  return { python: value.python, summary: value.summary.trim(), done: value.done };
}

const CAD_LAYERS = new Set<CadLayer>(["SITE", "WALL", "BEAM", "DOOR", "WINDOW", "STAIR", "FURNITURE", "DIMENSION", "COLUMN", "TEXT", "HATCH", "OTHER"]);
const CAD_FURNITURE_KINDS = new Set<CadFurnitureKind>(["bed", "bed-single", "bed-double", "sofa", "sofa-2-seat", "sofa-3-seat", "armchair", "dining-table", "dining-table-4", "dining-table-6", "desk", "wardrobe", "kitchen-counter", "kitchen-island", "refrigerator", "cooker", "kitchen-sink", "sink", "bath-vanity", "toilet", "bathtub", "shower", "chair", "car-compact", "car-sedan", "car-suv", "generic-block"]);
function point(value: unknown): value is [number, number] { return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100_000); }
function cadSchemaIssues(value: Record<string, unknown>): string[] {
  const issues: string[] = [];
  const add = (field: string, reason: string) => { if (issues.length < 12) issues.push(`${field}:${reason}`); };
  if (!Array.isArray(value.commands)) add("commands", value.commands === undefined ? "missing" : "expected_array");
  else if (value.commands.length < 1 || value.commands.length > 80) add("commands", "count_out_of_range_1_80");
  if (value.summary !== undefined && typeof value.summary !== "string") add("summary", "expected_string");
  else if (typeof value.summary === "string" && value.summary.length > 500) add("summary", "max_length_500");
  if (value.selfReview !== undefined) {
    if (!Array.isArray(value.selfReview)) add("selfReview", "expected_array");
    else {
      if (value.selfReview.length > 8) add("selfReview", "max_items_8");
      value.selfReview.forEach((item, index) => { if (typeof item !== "string" || item.length > 240) add(`selfReview[${index}]`, "expected_string_max_240"); });
    }
  }
  if (value.requiredElements !== undefined) {
    if (!Array.isArray(value.requiredElements)) add("requiredElements", "expected_array");
    else {
      if (value.requiredElements.length > 12) add("requiredElements", "max_items_12");
      value.requiredElements.forEach((raw, index) => {
        const field = `requiredElements[${index}]`;
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) { add(field, "expected_object"); return; }
        const item = raw as Record<string, unknown>;
        if (typeof item.requirement !== "string" || item.requirement.trim().length < 3 || item.requirement.length > 120) add(`${field}.requirement`, "expected_string_length_3_120");
        if (item.status !== "met" && item.status !== "unresolved") add(`${field}.status`, "expected_met_or_unresolved");
        if (!Array.isArray(item.evidenceIds) && !(item.status === "unresolved" && item.evidenceIds === undefined)) add(`${field}.evidenceIds`, "expected_array");
        else {
          const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
          if (evidenceIds.length > 8 || (item.status === "met" && evidenceIds.length < 1)) add(`${field}.evidenceIds`, "count_out_of_range_for_status");
          evidenceIds.forEach((id, evidenceIndex) => { if (typeof id !== "string" || !CAD_ID.test(id)) add(`${field}.evidenceIds[${evidenceIndex}]`, "invalid_cad_id"); });
        }
        if (item.status === "met" && (typeof item.evidence !== "string" || !item.evidence.trim())) add(`${field}.evidence`, "required_for_met");
        if (item.evidence !== undefined && (typeof item.evidence !== "string" || item.evidence.length > 200)) add(`${field}.evidence`, "expected_string_max_200");
      });
    }
  }
  if (value.unresolvedItems !== undefined) {
    if (!Array.isArray(value.unresolvedItems)) add("unresolvedItems", "expected_array");
    else {
      if (value.unresolvedItems.length > 12) add("unresolvedItems", "max_items_12");
      value.unresolvedItems.forEach((item, index) => { if (typeof item !== "string" || item.trim().length < 3 || item.length > 160) add(`unresolvedItems[${index}]`, "expected_string_length_3_160"); });
    }
  }
  if (value.done !== undefined && typeof value.done !== "boolean") add("done", "expected_boolean");
  return issues;
}
function transformFitsSite(objects: CadInspection["objects"], id: string, maxX: number, maxY: number, transform: { delta: [number, number] } | { center: [number, number]; angle: number }): boolean {
  const angle = "angle" in transform ? transform.angle * Math.PI / 180 : 0;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const targets = objects.filter((object) => object.id === id || object.hostWallId === id || object.hatchHostId === id);
  if (!targets.some((object) => object.id === id)) return false;
  for (const object of targets) {
    let points: [number, number][];
    const bounds = object.boundsMm;
    if (bounds && bounds.length === 4 && bounds.every((n) => Number.isFinite(n)) && bounds[0] <= bounds[2] && bounds[1] <= bounds[3]) {
      points = [[bounds[0], bounds[1]], [bounds[0], bounds[3]], [bounds[2], bounds[1]], [bounds[2], bounds[3]]];
    } else if (object.polylinePointsMm?.length && object.polylinePointsMm.every((point) => point.length >= 2 && point.slice(0, 2).every((n) => Number.isFinite(n)))) {
      points = object.polylinePointsMm.map((point) => [point[0], point[1]]);
    } else if (object.wallStartMm?.length === 2 && object.wallEndMm?.length === 2 && [...object.wallStartMm, ...object.wallEndMm].every((n) => Number.isFinite(n))) {
      const pad = (object.wallThicknessMm ?? 0) / 2;
      points = [[Math.min(object.wallStartMm[0], object.wallEndMm[0]) - pad, Math.min(object.wallStartMm[1], object.wallEndMm[1]) - pad], [Math.min(object.wallStartMm[0], object.wallEndMm[0]) - pad, Math.max(object.wallStartMm[1], object.wallEndMm[1]) + pad], [Math.max(object.wallStartMm[0], object.wallEndMm[0]) + pad, Math.min(object.wallStartMm[1], object.wallEndMm[1]) - pad], [Math.max(object.wallStartMm[0], object.wallEndMm[0]) + pad, Math.max(object.wallStartMm[1], object.wallEndMm[1]) + pad]];
    } else if (object.lineStartMm?.length === 2 && object.lineEndMm?.length === 2 && [...object.lineStartMm, ...object.lineEndMm].every((n) => Number.isFinite(n))) {
      points = [[object.lineStartMm[0], object.lineStartMm[1]], [object.lineEndMm[0], object.lineEndMm[1]]];
    } else if (object.positionMm && object.positionMm.length >= 2 && object.positionMm.slice(0, 2).every((n) => Number.isFinite(n))) {
      points = [[object.positionMm[0], object.positionMm[1]]];
    } else return false;
    const transformed = points.map(([x, y]) => {
      if ("delta" in transform) return [x + transform.delta[0], y + transform.delta[1]] as [number, number];
      const dx = x - transform.center[0], dy = y - transform.center[1];
      return [transform.center[0] + dx * cos - dy * sin, transform.center[1] + dx * sin + dy * cos] as [number, number];
    });
    if (transformed.some(([x, y]) => x < -1 || x > maxX + 1 || y < -1 || y > maxY + 1)) return false;
  }
  return true;
}
export function parseCadCommandAction(text: string, siteWidth: number, siteDepth: number, inspection: CadInspection | null = null, rejection?: CadCommandRejection): CadCommandAction | null {
  if (rejection) { rejection.category = "invalid_json"; delete rejection.commandIndex; delete rejection.op; delete rejection.schemaFields; }
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (rejection) rejection.category = "invalid_top_level_schema";
  const value = parsed as Record<string, unknown>;
  const schemaIssues = cadSchemaIssues(value);
  if (schemaIssues.length) { if (rejection) rejection.schemaFields = schemaIssues; return null; }
  const actionCommands = value.commands as unknown[];
  const actionSummary = typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : "تم تحديث عناصر الرسم";
  const selfReview = Array.isArray(value.selfReview) ? value.selfReview as string[] : [];
  const unresolvedItems = Array.isArray(value.unresolvedItems) ? value.unresolvedItems as string[] : [];
  const rawRequiredElements = Array.isArray(value.requiredElements) ? value.requiredElements : [];
  const requiredElements: CadRequirementReview[] = [];
  for (const rawRequirement of rawRequiredElements) {
    if (!rawRequirement || typeof rawRequirement !== "object" || Array.isArray(rawRequirement)) return null;
    const item = rawRequirement as Record<string, unknown>;
    if (typeof item.requirement !== "string" || item.requirement.trim().length < 3 || item.requirement.length > 120 || (item.status !== "met" && item.status !== "unresolved") || (!Array.isArray(item.evidenceIds) && !(item.status === "unresolved" && item.evidenceIds === undefined)) || (item.status === "met" && (!Array.isArray(item.evidenceIds) || item.evidenceIds.length < 1)) || (Array.isArray(item.evidenceIds) && (item.evidenceIds.length > 8 || !item.evidenceIds.every((id) => typeof id === "string" && CAD_ID.test(id)))) || (item.status === "met" && (typeof item.evidence !== "string" || !item.evidence.trim())) || (item.evidence !== undefined && (typeof item.evidence !== "string" || item.evidence.length > 200))) return null;
    requiredElements.push({ requirement: item.requirement.trim(), status: item.status, evidenceIds: (Array.isArray(item.evidenceIds) ? item.evidenceIds : []) as string[], evidence: typeof item.evidence === "string" && item.evidence.trim() ? item.evidence.trim() : "Not evaluated yet" });
  }
  if (value.done && (requiredElements.length === 0 || unresolvedItems.length > 0)) { if (rejection) { rejection.category = "invalid_completion_contract"; rejection.schemaFields = ["done", "requiredElements", "unresolvedItems"]; } return null; }
  const maxX = siteWidth * 1000, maxY = siteDepth * 1000;
  const commands: CadCommand[] = [];
  const ids = new Set<string>();
  const inspectedObjects = inspection?.objects ?? [];
  const knownIds = new Set(inspectedObjects.map((object) => object.id).filter((id): id is string => Boolean(id)));
  const closedIds = new Set(inspectedObjects.filter((object) => object.closed || (object.wallStartMm && object.wallEndMm)).map((object) => object.id).filter((id): id is string => Boolean(id)));
  const linearIds = new Set(inspectedObjects.filter((object) => (object.wallStartMm && object.wallEndMm) || (object.lineStartMm && object.lineEndMm)).map((object) => object.id).filter((id): id is string => Boolean(id)));
  const objectById = new Map(inspectedObjects.filter((object) => object.id).map((object) => [object.id!, object]));
  let hatchCount = 0;
  const walls = new Map<string, { length: number; from: [number, number]; to: [number, number] }>();
  for (const object of inspection?.objects ?? []) if (object.id && object.wallStartMm && object.wallEndMm) walls.set(object.id, { length: Math.hypot(object.wallEndMm[0] - object.wallStartMm[0], object.wallEndMm[1] - object.wallStartMm[1]), from: object.wallStartMm as [number, number], to: object.wallEndMm as [number, number] });
  if (rejection) rejection.category = "invalid_command_contract";
  for (const [commandIndex, raw] of actionCommands.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (rejection) { rejection.commandIndex = commandIndex; rejection.op = typeof c.op === "string" && ["delete", "polyline", "circle", "arc", "move", "rotate", "copy", "offset", "set-layer", "hatch", "line", "wall", "beam", "opening", "room", "dimension", "stair", "furniture", "column"].includes(c.op) ? c.op : "unknown"; }
    if (typeof c.id !== "string" || !CAD_ID.test(c.id) || ids.has(c.id)) return null;
    ids.add(c.id);
    if (c.op === "delete") { commands.push({ op: "delete", id: c.id }); knownIds.delete(c.id); closedIds.delete(c.id); linearIds.delete(c.id); walls.delete(c.id); continue; }
    if (c.op === "polyline") {
      if (!Array.isArray(c.points) || c.points.length < 2 || c.points.length > 64 || !c.points.every(point) || typeof c.closed !== "boolean" || typeof c.layer !== "string" || !CAD_LAYERS.has(c.layer as CadLayer) || c.points.some(([x,y]) => x < 0 || x > maxX || y < 0 || y > maxY)) return null;
      commands.push({ op: "polyline", id: c.id, points: c.points, closed: c.closed, layer: c.layer as CadLayer }); knownIds.add(c.id); if (c.closed) closedIds.add(c.id); else closedIds.delete(c.id); continue;
    }
    if (c.op === "circle") {
      if (!point(c.center) || typeof c.radius !== "number" || !Number.isFinite(c.radius) || c.radius < 20 || c.radius > Math.min(maxX,maxY) || typeof c.layer !== "string" || !CAD_LAYERS.has(c.layer as CadLayer) || c.center[0]-c.radius < 0 || c.center[0]+c.radius > maxX || c.center[1]-c.radius < 0 || c.center[1]+c.radius > maxY) return null;
      commands.push({ op: "circle", id: c.id, center: c.center, radius: c.radius, layer: c.layer as CadLayer }); knownIds.add(c.id); continue;
    }
    if (c.op === "arc") {
      if (!point(c.center) || typeof c.radius !== "number" || !Number.isFinite(c.radius) || c.radius < 20 || c.radius > Math.min(maxX,maxY) || typeof c.startAngle !== "number" || typeof c.endAngle !== "number" || !Number.isFinite(c.startAngle) || !Number.isFinite(c.endAngle) || Math.abs(c.endAngle-c.startAngle) < 1 || Math.abs(c.endAngle-c.startAngle) > 180 || typeof c.layer !== "string" || !CAD_LAYERS.has(c.layer as CadLayer) || c.center[0]-c.radius < 0 || c.center[0]+c.radius > maxX || c.center[1]-c.radius < 0 || c.center[1]+c.radius > maxY) return null;
      commands.push({ op: "arc", id: c.id, center: c.center, radius: c.radius, startAngle: c.startAngle, endAngle: c.endAngle, layer: c.layer as CadLayer }); knownIds.add(c.id); continue;
    }
    if (c.op === "move") {
      if (!knownIds.has(c.id) || objectById.get(c.id)?.hostWallId || !point(c.delta) || Math.hypot(c.delta[0],c.delta[1]) > Math.hypot(maxX,maxY)) return null;
      if (!transformFitsSite(inspectedObjects, c.id, maxX, maxY, { delta: c.delta })) { if (rejection) rejection.category = "transform_outside_site"; return null; }
      commands.push({ op: "move", id: c.id, delta: c.delta }); continue;
    }
    if (c.op === "rotate") {
      if (!knownIds.has(c.id) || objectById.get(c.id)?.hostWallId || !point(c.center) || c.center[0] < 0 || c.center[0] > maxX || c.center[1] < 0 || c.center[1] > maxY || typeof c.angle !== "number" || !Number.isFinite(c.angle) || Math.abs(c.angle) > 36_000) return null;
      if (!transformFitsSite(inspectedObjects, c.id, maxX, maxY, { center: c.center, angle: c.angle })) { if (rejection) rejection.category = "transform_outside_site"; return null; }
      commands.push({ op: "rotate", id: c.id, center: c.center, angle: c.angle }); continue;
    }
    if (c.op === "copy") {
      const source = objectById.get(String(c.sourceId));
      if (!CAD_ID.test(String(c.sourceId)) || c.sourceId === c.id || !knownIds.has(String(c.sourceId)) || (source?.hostWallId || (source?.wallOpenings?.length ?? 0) > 0) || !point(c.delta) || Math.hypot(c.delta[0],c.delta[1]) > Math.hypot(maxX,maxY)) return null;
      commands.push({ op: "copy", id: c.id, sourceId: c.sourceId as string, delta: c.delta }); knownIds.add(c.id); continue;
    }
    if (c.op === "offset") {
      if (!CAD_ID.test(String(c.sourceId)) || !knownIds.has(String(c.sourceId)) || !linearIds.has(String(c.sourceId)) || (objectById.get(String(c.sourceId))?.wallOpenings?.length ?? 0) > 0 || typeof c.distance !== "number" || !Number.isFinite(c.distance) || Math.abs(c.distance) < 20 || Math.abs(c.distance) > 5000) return null;
      commands.push({ op: "offset", id: c.id, sourceId: c.sourceId as string, distance: c.distance }); knownIds.add(c.id); continue;
    }
    if (c.op === "set-layer") {
      if (!knownIds.has(c.id) || typeof c.layer !== "string" || !CAD_LAYERS.has(c.layer as CadLayer)) return null;
      commands.push({ op: "set-layer", id: c.id, layer: c.layer as CadLayer }); continue;
    }
    if (c.op === "hatch") {
      if (typeof c.targetId !== "string" || !CAD_ID.test(c.targetId) || c.targetId === c.id || !closedIds.has(c.targetId) || (c.pattern !== "diagonal" && c.pattern !== "cross" && c.pattern !== "tile") || typeof c.spacing !== "number" || !Number.isFinite(c.spacing) || c.spacing < 300 || c.spacing > 5000 || typeof c.angle !== "number" || !Number.isFinite(c.angle) || Math.abs(c.angle) > 36_000 || ++hatchCount > 2) return null;
      commands.push({ op: "hatch", id: c.id, targetId: c.targetId, pattern: c.pattern, spacing: c.spacing, angle: c.angle }); knownIds.add(c.id); continue;
    }
    if (c.op === "line" || c.op === "wall" || c.op === "beam") {
      if (!point(c.from) || !point(c.to) || Math.hypot(c.from[0]-c.to[0], c.from[1]-c.to[1]) < 100 || [...c.from, ...c.to].some((n, i) => n < 0 || n > (i % 2 ? maxY : maxX))) return null;
      if (c.op === "wall") { if (typeof c.thickness !== "number" || !Number.isFinite(c.thickness) || c.thickness < 80 || c.thickness > 500) return null; walls.set(c.id, { length: Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]), from: c.from, to: c.to }); commands.push({ op: "wall", id: c.id, from: c.from, to: c.to, thickness: c.thickness }); knownIds.add(c.id); linearIds.add(c.id); closedIds.add(c.id); }
      else if (c.op === "beam") { if (typeof c.width !== "number" || !Number.isFinite(c.width) || c.width < 80 || c.width > 1000) return null; commands.push({ op: "beam", id: c.id, from: c.from, to: c.to, width: c.width }); knownIds.add(c.id); }
      else { if (c.layer !== undefined && c.layer !== "WALL" && c.layer !== "DIMENSION") return null; commands.push({ op: "line", id: c.id, from: c.from, to: c.to, layer: c.layer }); knownIds.add(c.id); linearIds.add(c.id); }
      continue;
    }
    if (c.op === "opening") {
      const wall = typeof c.wallId === "string" ? walls.get(c.wallId) : undefined;
      if ((c.kind !== "DOOR" && c.kind !== "WINDOW") || typeof c.wallId !== "string" || !CAD_ID.test(c.wallId) || !wall || typeof c.offset !== "number" || !Number.isFinite(c.offset) || typeof c.width !== "number" || !Number.isFinite(c.width) || c.width < 400 || c.width > 4000 || c.offset < 50 || c.offset + c.width > wall.length - 50 || (c.swingSide !== undefined && c.swingSide !== 1 && c.swingSide !== -1)) return null;
      const dx = (wall.to[0] - wall.from[0]) / wall.length, dy = (wall.to[1] - wall.from[1]) / wall.length;
      const midpointX = wall.from[0] + (wall.to[0] - wall.from[0]) * ((c.offset + c.width / 2) / wall.length);
      const midpointY = wall.from[1] + (wall.to[1] - wall.from[1]) * ((c.offset + c.width / 2) / wall.length);
      const towardSiteCenter = (maxX / 2 - midpointX) * -dy + (maxY / 2 - midpointY) * dx;
      const defaultSwingSide: 1 | -1 = towardSiteCenter >= 0 ? 1 : -1;
      commands.push({ op: "opening", id: c.id, wallId: c.wallId, offset: c.offset, kind: c.kind, width: c.width, swingSide: (c.swingSide as 1 | -1 | undefined) ?? defaultSwingSide }); knownIds.add(c.id); continue;
    }
    if (c.op === "room") {
      if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 60 || !point(c.at) || c.at[0] < 0 || c.at[0] > maxX || c.at[1] < 0 || c.at[1] > maxY) return null;
      commands.push({ op: "room", id: c.id, name: c.name.trim(), at: c.at }); knownIds.add(c.id); continue;
    }
    if (c.op === "dimension") {
      if (!point(c.from) || !point(c.to) || Math.hypot(c.from[0] - c.to[0], c.from[1] - c.to[1]) < 100 || [...c.from, ...c.to].some((n, i) => n < 0 || n > (i % 2 ? maxY : maxX)) || typeof c.offset !== "number" || !Number.isFinite(c.offset) || c.offset < 100 || c.offset > 3000) return null;
      commands.push({ op: "dimension", id: c.id, from: c.from, to: c.to, offset: c.offset }); knownIds.add(c.id); continue;
    }
    if (c.op === "stair" || c.op === "furniture" || c.op === "column") {
      if (c.op === "furniture" && (typeof c.kind !== "string" || !CAD_FURNITURE_KINDS.has(c.kind.toLowerCase() as CadFurnitureKind))) return null;
      if (typeof c.kind !== "string" || !/^[\w -]{1,40}$/.test(c.kind) || !point(c.at) || typeof c.width !== "number" || typeof c.depth !== "number" || !Number.isFinite(c.width) || !Number.isFinite(c.depth) || c.width < 100 || c.depth < 100 || c.width > maxX || c.depth > maxY || c.at[0] < 0 || c.at[0] + c.width > maxX || c.at[1] < 0 || c.at[1] + c.depth > maxY || (c.angle !== undefined && (typeof c.angle !== "number" || !Number.isFinite(c.angle) || Math.abs(c.angle) > 36_000))) return null;
      if (c.op === "stair") { if (c.treads !== undefined && (!Number.isInteger(c.treads) || (c.treads as number) < 3 || (c.treads as number) > 30)) return null; commands.push({ op: "stair", id: c.id, kind: c.kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0, treads: (c.treads as number | undefined) ?? 10 }); }
      else if (c.op === "furniture") {
        const kind = c.kind.toLowerCase() as CadFurnitureKind;
        if (kind.startsWith("car-") && (c.width < 1400 || c.width > 2600 || c.depth < 2800 || c.depth > 6000)) return null;
        commands.push({ op: "furniture", id: c.id, kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0 });
      }
      else commands.push({ op: "column", id: c.id, kind: c.kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0 });
      knownIds.add(c.id); continue;
    }
    return null;
  }
  if (rejection) { rejection.category = "valid"; delete rejection.commandIndex; delete rejection.op; }
  return { commands, summary: actionSummary.trim(), selfReview, requiredElements, unresolvedItems, done: value.done === true };
}

export function cadCompletionReady(action: Pick<CadCommandAction, "done" | "requiredElements" | "unresolvedItems">, inspection: Pick<CadInspection, "warnings"> & { objects: Pick<CadInspection["objects"][number], "id" | "semantic" | "text" | "hostWallId" | "wallStartMm" | "wallEndMm" | "boundsMm">[]; objectIds?: string[] }): boolean {
  const existingIds = new Set(inspection.objectIds ?? inspection.objects.map((object) => object.id).filter(Boolean));
  const byId = new Map(inspection.objects.filter((object) => object.id).map((object) => [object.id!, object]));
  const evidenceFits = (item: CadRequirementReview) => {
    if (!item.evidenceIds.every((id) => existingIds.has(id))) return false;
    const evidence = item.evidenceIds.map((id) => byId.get(id)).filter((object) => Boolean(object));
    const requirement = item.requirement.toLowerCase();
    const requires: [RegExp, (object: (typeof evidence)[number]) => boolean][] = [
      [/(room|apartment|flat|غرف|شقق|شقة)/i, (object) => object?.semantic === "room" && Boolean(object.text?.trim())],
      [/(door|entry|باب|مدخل)/i, (object) => object?.semantic === "opening" && object.text === "DOOR" && Boolean(object.hostWallId)],
      [/(window|نافذة|شباك)/i, (object) => object?.semantic === "opening" && object.text === "WINDOW" && Boolean(object.hostWallId)],
      [/(wall|partition|حائط|جدار)/i, (object) => object?.semantic === "wall" && Boolean(object.wallStartMm && object.wallEndMm)],
      [/(stair|staircase|سلم|درج)/i, (object) => object?.semantic === "stair" && Boolean(object.boundsMm)],
      [/(furniture|furnish|أثاث)/i, (object) => object?.semantic === "furniture" && Boolean(object.boundsMm)],
    ];
    const rule = requires.find(([pattern]) => pattern.test(requirement));
    if (!rule) return evidence.length > 0;
    const quantityWord = requirement.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i)?.[1]?.toLowerCase();
    const quantityNumber = Number(requirement.match(/\b(\d{1,2})\b/)?.[1] ?? 0);
    const words: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
    const minimum = Math.max(1, quantityNumber, quantityWord ? words[quantityWord] : 0);
    return evidence.filter(rule[1]).length >= minimum;
  };
  return action.done && action.unresolvedItems.length === 0 && action.requiredElements.length > 0 && action.requiredElements.every((item) => item.status === "met" && evidenceFits(item)) && inspection.warnings.length === 0;
}

/** Converts validated tool commands into host-authored FreeCAD Python. Model text is never executed. */
export function compileCadCommands(action: CadCommandAction): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = ["import math, json", "def _find(identifier):", "    return next((o for o in doc.Objects if getattr(o, 'CadAgentId', '') == identifier), None)", "def _rp(x,y,cx,cy,a):", "    return Vector(cx+(x-cx)*math.cos(a)-(y-cy)*math.sin(a),cy+(x-cx)*math.sin(a)+(y-cy)*math.cos(a),0)",
    "def _fpoly(points,cx,cy,a):", "    p=[_rp(x,y,cx,cy,a) for x,y in points]", "    return Part.makePolygon(p+[p[0]])", "def _frect(x,y,w,h,cx,cy,a):", "    return _fpoly([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],cx,cy,a)", "def _fcircle(x,y,r,cx,cy,a):", "    return Part.makeCircle(r,_rp(x,y,cx,cy,a))", "def _fellipse(x,y,rx,ry,cx,cy,a):", "    return _fpoly([(x+rx*math.cos(i*math.pi/8),y+ry*math.sin(i*math.pi/8)) for i in range(16)],cx,cy,a)",
    "def _hatch_polygon(points, spacing, angle, edges):", "    a=math.radians(angle); dx,dy=math.cos(a),math.sin(a); nx,ny=-dy,dx", "    projections=[p.x*nx+p.y*ny for p in points]; lo=math.floor(min(projections)/spacing); hi=math.ceil(max(projections)/spacing)", "    if hi-lo>500: raise RuntimeError('Hatch density exceeds the limit')", "    for k in range(lo,hi+1):", "        t=k*spacing; hits=[]", "        for i,p in enumerate(points):", "            q=points[(i+1)%len(points)]; u=p.x*nx+p.y*ny; v=q.x*nx+q.y*ny", "            if (u<=t<v) or (v<=t<u):", "                f=(t-u)/(v-u); x=p.x+f*(q.x-p.x); y=p.y+f*(q.y-p.y); hits.append((x*dx+y*dy,x,y))", "        hits.sort(key=lambda h:h[0])", "        for i in range(0,len(hits)-1,2):", "            h,j=hits[i],hits[i+1]", "            if math.hypot(j[1]-h[1],j[2]-h[2])>1: edges.append(Part.makeLine(Vector(h[1],h[2],0),Vector(j[1],j[2],0)))", "            if len(edges)>1200: raise RuntimeError('Hatch stroke limit exceeded')",
    "def _wall_shape(obj):", "    a=obj.CadWallStart; b=obj.CadWallEnd; d=b.sub(a); length=d.Length", "    if length < 100: raise RuntimeError('Wall is too short')", "    u=d; u.normalize(); n=Vector(-u.y,u.x,0); half=float(obj.CadWallThickness)/2", "    openings=sorted(json.loads(obj.CadOpenings),key=lambda o:o['offset'])", "    pieces=[]; cursor=0.0", "    for opening in openings:", "        left=float(opening['offset']); right=left+float(opening['width'])", "        if left < cursor+50 or right > length-50: raise RuntimeError('Wall openings overlap or exceed wall bounds')", "        if left-cursor >= 50: pieces.append((cursor,left))", "        cursor=right", "    if length-cursor >= 50: pieces.append((cursor,length))", "    faces=[]", "    for lo,hi in pieces:", "        p=a.add(u.multiply(lo)); q=a.add(u.multiply(hi)); side=n.multiply(half)", "        faces.append(Part.makePolygon([p.add(side),q.add(side),q.sub(side),p.sub(side),p.add(side)]))", "    obj.Shape=Part.makeCompound(faces)"];
  for (const c of action.commands) {
    if (c.op === "delete") {
      lines.push(`_obj=_find(${q(c.id)})`, "if _obj:", "    _host_id=getattr(_obj,'CadHostWall','')", "    if _host_id:", "        _host=_find(_host_id)", "        if _host:", "            _host.CadOpenings=json.dumps([o for o in json.loads(_host.CadOpenings) if o['id'] != _obj.CadAgentId])", "            _wall_shape(_host)", "    for _child in list(doc.Objects):", "        if getattr(_child,'CadHostWall','') == getattr(_obj,'CadAgentId','') or getattr(_child,'CadHatchHost','') == getattr(_obj,'CadAgentId',''):", "            doc.removeObject(_child.Name)", "    doc.removeObject(_obj.Name)");
      continue;
    }
    if (c.op === "move") {
      lines.push(`_obj=_find(${q(c.id)})`, "if not _obj: raise RuntimeError('Move target not found')", "if getattr(_obj,'CadHostWall',''): raise RuntimeError('Move attached openings with their host wall')", `_delta=Vector(${c.delta[0]},${c.delta[1]},0)`, "if hasattr(_obj,'Shape') and not _obj.Shape.isNull(): _obj.Shape.translate(_delta)", "if hasattr(_obj,'Position'): _obj.Position=_obj.Position.add(_delta)", "if hasattr(_obj,'CadWallStart'): _obj.CadWallStart=_obj.CadWallStart.add(_delta); _obj.CadWallEnd=_obj.CadWallEnd.add(_delta)", "if hasattr(_obj,'CadLineStart'): _obj.CadLineStart=_obj.CadLineStart.add(_delta); _obj.CadLineEnd=_obj.CadLineEnd.add(_delta)", "if hasattr(_obj,'CadPolylinePoints'): _obj.CadPolylinePoints=json.dumps([[p[0]+_delta.x,p[1]+_delta.y] for p in json.loads(_obj.CadPolylinePoints)])", "for _child in list(doc.Objects):", "    if getattr(_child,'CadHostWall','') == getattr(_obj,'CadAgentId','') or getattr(_child,'CadHatchHost','') == getattr(_obj,'CadAgentId',''):", "        if hasattr(_child,'Shape') and not _child.Shape.isNull(): _child.Shape.translate(_delta)", "        if hasattr(_child,'Position'): _child.Position=_child.Position.add(_delta)");
      continue;
    }
    if (c.op === "rotate") {
      lines.push(`_obj=_find(${q(c.id)})`, "if not _obj: raise RuntimeError('Rotate target not found')", "if getattr(_obj,'CadHostWall',''): raise RuntimeError('Rotate attached openings with their host wall')", `_center=Vector(${c.center[0]},${c.center[1]},0); _angle=${c.angle}`, "if hasattr(_obj,'Shape') and not _obj.Shape.isNull(): _obj.Shape.rotate(_center,Vector(0,0,1),_angle)", "if hasattr(_obj,'Position'): _obj.Position=_rp(_obj.Position.x,_obj.Position.y,_center.x,_center.y,math.radians(_angle))", "if hasattr(_obj,'CadWallStart'): _obj.CadWallStart=_rp(_obj.CadWallStart.x,_obj.CadWallStart.y,_center.x,_center.y,math.radians(_angle)); _obj.CadWallEnd=_rp(_obj.CadWallEnd.x,_obj.CadWallEnd.y,_center.x,_center.y,math.radians(_angle))", "if hasattr(_obj,'CadLineStart'): _obj.CadLineStart=_rp(_obj.CadLineStart.x,_obj.CadLineStart.y,_center.x,_center.y,math.radians(_angle)); _obj.CadLineEnd=_rp(_obj.CadLineEnd.x,_obj.CadLineEnd.y,_center.x,_center.y,math.radians(_angle))", "if hasattr(_obj,'CadPolylinePoints'): _obj.CadPolylinePoints=json.dumps([[_rp(p[0],p[1],_center.x,_center.y,math.radians(_angle)).x,_rp(p[0],p[1],_center.x,_center.y,math.radians(_angle)).y] for p in json.loads(_obj.CadPolylinePoints)])", "for _child in list(doc.Objects):", "    if getattr(_child,'CadHostWall','') == getattr(_obj,'CadAgentId','') or getattr(_child,'CadHatchHost','') == getattr(_obj,'CadAgentId',''):", "        if hasattr(_child,'Shape') and not _child.Shape.isNull(): _child.Shape.rotate(_center,Vector(0,0,1),_angle)", "        if hasattr(_child,'Position'): _child.Position=_rp(_child.Position.x,_child.Position.y,_center.x,_center.y,math.radians(_angle))");
      continue;
    }
    if (c.op === "copy") {
      lines.push(`_src=_find(${q(c.sourceId)})`, "if not _src: raise RuntimeError('Copy source not found')", "if getattr(_src,'CadHostWall','') or (hasattr(_src,'CadOpenings') and json.loads(_src.CadOpenings)): raise RuntimeError('Copy attached openings individually after creating a host wall')", `obj=doc.addObject('Part::Feature',${q(`CAD_${c.id}`)})`, "obj.addProperty('App::PropertyString','CadAgentId')", `obj.CadAgentId=${q(c.id)}`, "obj.Label=_src.Label.split('_',1)[0]+'_'+" + q(c.id), `_delta=Vector(${c.delta[0]},${c.delta[1]},0)`, "if hasattr(_src,'Shape') and not _src.Shape.isNull(): obj.Shape=_src.Shape.copy(); obj.Shape.translate(_delta)", "if hasattr(_src,'Text'):", "    obj.addProperty('App::PropertyString','Text'); obj.Text=_src.Text", "    obj.addProperty('App::PropertyVector','Position'); obj.Position=_src.Position.add(_delta)", "if hasattr(_src,'CadWallStart'):", "    obj.addProperty('App::PropertyVector','CadWallStart'); obj.CadWallStart=_src.CadWallStart.add(_delta)", "    obj.addProperty('App::PropertyVector','CadWallEnd'); obj.CadWallEnd=_src.CadWallEnd.add(_delta)", "    obj.addProperty('App::PropertyLength','CadWallThickness'); obj.CadWallThickness=_src.CadWallThickness", "    obj.addProperty('App::PropertyString','CadOpenings'); obj.CadOpenings='[]'", "if hasattr(_src,'CadLineStart'):", "    obj.addProperty('App::PropertyVector','CadLineStart'); obj.CadLineStart=_src.CadLineStart.add(_delta)", "    obj.addProperty('App::PropertyVector','CadLineEnd'); obj.CadLineEnd=_src.CadLineEnd.add(_delta)");
      continue;
    }
    if (c.op === "offset") {
      lines.push(`_src=_find(${q(c.sourceId)})`, "if not _src: raise RuntimeError('Offset source not found')", "if hasattr(_src,'CadWallStart'):", "    if json.loads(_src.CadOpenings): raise RuntimeError('Offset wall with openings is not supported')", "    _a=_src.CadWallStart; _b=_src.CadWallEnd; _thickness=_src.CadWallThickness", "elif hasattr(_src,'CadLineStart'):", "    _a=_src.CadLineStart; _b=_src.CadLineEnd", "else: raise RuntimeError('Offset supports straight lines and walls only')", "_d=_b.sub(_a); _d.normalize(); _n=Vector(-_d.y,_d.x,0).multiply(" + c.distance + ")", `obj=doc.addObject('Part::Feature',${q(`CAD_${c.id}`)})`, "obj.addProperty('App::PropertyString','CadAgentId')", `obj.CadAgentId=${q(c.id)}`, "obj.Label=_src.Label.split('_',1)[0]+'_'+" + q(c.id), "obj.Shape=_src.Shape.copy(); obj.Shape.translate(_n)", "if hasattr(_src,'CadWallStart'):", "    obj.addProperty('App::PropertyVector','CadWallStart'); obj.CadWallStart=_a.add(_n)", "    obj.addProperty('App::PropertyVector','CadWallEnd'); obj.CadWallEnd=_b.add(_n)", "    obj.addProperty('App::PropertyLength','CadWallThickness'); obj.CadWallThickness=_thickness", "    obj.addProperty('App::PropertyString','CadOpenings'); obj.CadOpenings='[]'", "else:", "    obj.addProperty('App::PropertyVector','CadLineStart'); obj.CadLineStart=_a.add(_n)", "    obj.addProperty('App::PropertyVector','CadLineEnd'); obj.CadLineEnd=_b.add(_n)");
      continue;
    }
    if (c.op === "set-layer") {
      lines.push(`_obj=_find(${q(c.id)})`, "if not _obj: raise RuntimeError('Layer target not found')", `else: _obj.Label=${q(`${c.layer}_${c.id}`)}`);
      continue;
    }
    if (c.op === "hatch") {
      lines.push(`_target=_find(${q(c.targetId)})`, "if not _target: raise RuntimeError('Hatch boundary not found')", "_polys=[]", "if hasattr(_target,'CadWallStart'):", "    _a=_target.CadWallStart; _b=_target.CadWallEnd; _d=_b.sub(_a); _length=_d.Length; _u=_d; _u.normalize(); _n=Vector(-_u.y,_u.x,0); _half=float(_target.CadWallThickness)/2", "    _openings=sorted(json.loads(_target.CadOpenings),key=lambda o:o['offset']); _cursor=0.0; _intervals=[]", "    for _opening in _openings:", "        _left=float(_opening['offset']); _right=_left+float(_opening['width'])", "        if _left>_cursor: _intervals.append((_cursor,_left))", "        _cursor=_right", "    if _cursor<_length: _intervals.append((_cursor,_length))", "    for _lo,_hi in _intervals:", "        if _hi-_lo>=50:", "            _p=_a.add(_u.multiply(_lo)); _q=_a.add(_u.multiply(_hi)); _s=_n.multiply(_half)", "            _polys.append([_p.add(_s),_q.add(_s),_q.sub(_s),_p.sub(_s)])", "elif hasattr(_target,'CadPolylinePoints') and getattr(_target,'CadPolylineClosed',False):", "    _polys.append([Vector(float(p[0]),float(p[1]),0) for p in json.loads(_target.CadPolylinePoints)])", "else: raise RuntimeError('Hatch supports walls and closed polylines only')", `obj=doc.addObject('Part::Feature',${q(`CAD_${c.id}`)})`, "obj.addProperty('App::PropertyString','CadAgentId')", `obj.CadAgentId=${q(c.id)}`, `obj.Label=${q(`HATCH_${c.id}`)}`, "obj.addProperty('App::PropertyString','CadSemantic'); obj.CadSemantic='hatch'", "obj.addProperty('App::PropertyString','CadHatchHost'); obj.CadHatchHost=" + q(c.targetId), "obj.addProperty('App::PropertyString','CadPattern'); obj.CadPattern=" + q(c.pattern), "obj.addProperty('App::PropertyLength','CadHatchSpacing'); obj.CadHatchSpacing=" + c.spacing, "obj.addProperty('App::PropertyFloat','CadHatchAngle'); obj.CadHatchAngle=" + c.angle, "_edges=[]", `_angles=[${c.angle}]` + (c.pattern === "diagonal" ? "" : `+[${c.angle + 90}]`), "for _poly in _polys:", "    for _angle in _angles: _hatch_polygon(_poly," + c.spacing + ",_angle,_edges)", "if not _edges: raise RuntimeError('Hatch produced no strokes inside its boundary')", "obj.Shape=Part.makeCompound(_edges)");
      continue;
    }
    const layer = c.op === "line" ? (c.layer ?? "WALL") : c.op === "wall" ? "WALL" : c.op === "beam" ? "BEAM" : c.op === "dimension" ? "DIMENSION" : c.op === "opening" ? c.kind : c.op === "room" ? "TEXT" : c.op === "stair" ? "STAIR" : c.op === "column" ? "COLUMN" : c.op === "polyline" || c.op === "circle" || c.op === "arc" ? c.layer : "FURNITURE";
    const objName = `CAD_${c.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    lines.push(`_target_old=_find(${q(c.id)})`, "if _target_old:", "    for _child in list(doc.Objects):", "        if getattr(_child,'CadHatchHost','') == getattr(_target_old,'CadAgentId',''):", "            doc.removeObject(_child.Name)");
    if (c.op === "opening") lines.push(`_old=_find(${q(c.id)})`, "if _old:", "    _old_host=_find(getattr(_old,'CadHostWall',''))", `    if _old_host and _old_host.CadAgentId != ${q(c.wallId)}:`, "        _old_host.CadOpenings=json.dumps([o for o in json.loads(_old_host.CadOpenings) if o['id'] != _old.CadAgentId])", "        _wall_shape(_old_host)", "    doc.removeObject(_old.Name)");
    else if (c.op === "wall") lines.push(`_old=_find(${q(c.id)})`, "_preserved=json.loads(_old.CadOpenings) if _old and hasattr(_old,'CadOpenings') else []", "if _old: doc.removeObject(_old.Name)");
    else lines.push(`_obj=_find(${q(c.id)})`, "if _obj: doc.removeObject(_obj.Name)");
    lines.push(`obj=doc.addObject('Part::Feature',${q(objName)})`, `obj.addProperty('App::PropertyString','CadAgentId')`, `obj.CadAgentId=${q(c.id)}`, `obj.Label=${q(`${layer}_${c.id}`)}`);
    const semantic = c.op === "room" ? "room" : c.op === "stair" ? "stair" : c.op === "furniture" ? "furniture" : c.op === "opening" ? "opening" : c.op === "wall" ? "wall" : c.op;
    lines.push(`obj.addProperty('App::PropertyString','CadSemantic'); obj.CadSemantic=${q(semantic)}`);
    if ("kind" in c) lines.push(`obj.addProperty('App::PropertyString','CadKind'); obj.CadKind=${q(c.kind)}`);
    if (c.op === "line") lines.push(`obj.addProperty('App::PropertyVector','CadLineStart'); obj.CadLineStart=Vector(${c.from[0]},${c.from[1]},0)`, `obj.addProperty('App::PropertyVector','CadLineEnd'); obj.CadLineEnd=Vector(${c.to[0]},${c.to[1]},0)`, "obj.Shape=Part.makeLine(obj.CadLineStart,obj.CadLineEnd)");
    else if (c.op === "polyline") lines.push(`_pts=[${c.points.map(([x,y]) => `Vector(${x},${y},0)`).join(",")}]`, `obj.Shape=Part.makePolygon(_pts+([_pts[0]] if ${c.closed ? "True" : "False"} else []))`, `obj.addProperty('App::PropertyString','CadPolylinePoints'); obj.CadPolylinePoints=${q(JSON.stringify(c.points))}`, `obj.addProperty('App::PropertyBool','CadPolylineClosed'); obj.CadPolylineClosed=${c.closed ? "True" : "False"}`);
    else if (c.op === "circle") lines.push(`obj.Shape=Part.makeCircle(${c.radius},Vector(${c.center[0]},${c.center[1]},0))`);
    else if (c.op === "arc") lines.push(`_center=Vector(${c.center[0]},${c.center[1]},0); _r=${c.radius}`, `_a1=math.radians(${c.startAngle}); _am=math.radians(${(c.startAngle + c.endAngle) / 2}); _a2=math.radians(${c.endAngle})`, "_p1=Vector(_center.x+_r*math.cos(_a1),_center.y+_r*math.sin(_a1),0); _pm=Vector(_center.x+_r*math.cos(_am),_center.y+_r*math.sin(_am),0); _p2=Vector(_center.x+_r*math.cos(_a2),_center.y+_r*math.sin(_a2),0)", "obj.Shape=Part.Arc(_p1,_pm,_p2).toShape()");
    else if (c.op === "wall") lines.push(`obj.addProperty('App::PropertyVector','CadWallStart'); obj.CadWallStart=Vector(${c.from[0]},${c.from[1]},0)`, `obj.addProperty('App::PropertyVector','CadWallEnd'); obj.CadWallEnd=Vector(${c.to[0]},${c.to[1]},0)`, `obj.addProperty('App::PropertyLength','CadWallThickness'); obj.CadWallThickness=${c.thickness}`, "obj.addProperty('App::PropertyString','CadOpenings'); obj.CadOpenings=json.dumps(_preserved)", "_wall_shape(obj)");
    else if (c.op === "beam") lines.push(`_a=Vector(${c.from[0]},${c.from[1]},0); _b=Vector(${c.to[0]},${c.to[1]},0)`, "_d=_b.sub(_a); _n=Vector(-_d.y,_d.x,0); _n.normalize(); _n=_n.multiply(" + c.width / 2 + ")", "obj.Shape=Part.makePolygon([_a.add(_n),_b.add(_n),_b.sub(_n),_a.sub(_n),_a.add(_n)])");
    else if (c.op === "dimension") lines.push(`_a=Vector(${c.from[0]},${c.from[1]},0); _b=Vector(${c.to[0]},${c.to[1]},0)`, "_d=_b.sub(_a); _length=_d.Length; _u=_d; _u.normalize(); _n=Vector(-_u.y,_u.x,0); _mid=_a.add(_b).multiply(0.5); _center=Vector(SITE_WIDTH_MM/2,SITE_DEPTH_MM/2,0); _toward=_center.sub(_mid)", "if _toward.x*_n.x+_toward.y*_n.y<0: _n=_n.multiply(-1)", `_shift=_n.multiply(${c.offset}); _a2=_a.add(_shift); _b2=_b.add(_shift); _out=_n.multiply(100)`, "_v=_b2.sub(_a2); _v.normalize(); _tick=_n.multiply(70)", "obj.Shape=Part.makeCompound([Part.makeLine(_a,_a2.add(_out)),Part.makeLine(_b,_b2.add(_out)),Part.makeLine(_a2,_b2),Part.makeLine(_a2.sub(_tick),_a2.add(_tick)),Part.makeLine(_b2.sub(_tick),_b2.add(_tick))])", "obj.addProperty('App::PropertyString','Text'); obj.Text=('%0.0f mm' % _length)", "obj.addProperty('App::PropertyVector','Position'); obj.Position=_a2.add(_b2).multiply(0.5).add(_out)");
    else if (c.op === "opening") {
      lines.push(`_host=_find(${q(c.wallId)})`, "if not _host: raise RuntimeError('Opening host wall not found')", "_openings=json.loads(_host.CadOpenings)", `_openings=[o for o in _openings if o['id']!=${q(c.id)}]`, `_openings.append({'id':${q(c.id)},'offset':${c.offset},'width':${c.width},'kind':${q(c.kind)}})`, "_host.CadOpenings=json.dumps(_openings)", "_wall_shape(_host)", "for _child in list(doc.Objects):", "    if getattr(_child,'CadHatchHost','') == getattr(_host,'CadAgentId',''):", "        doc.removeObject(_child.Name)", `obj.addProperty('App::PropertyString','CadHostWall'); obj.CadHostWall=${q(c.wallId)}`, `obj.addProperty('App::PropertyLength','CadOpeningOffset'); obj.CadOpeningOffset=${c.offset}`, `obj.addProperty('App::PropertyLength','CadOpeningWidth'); obj.CadOpeningWidth=${c.width}`, `obj.addProperty('App::PropertyString','Text'); obj.Text=${q(c.kind)}`, `obj.addProperty('App::PropertyVector','Position')`, "_dx=_host.CadWallEnd.x-_host.CadWallStart.x; _dy=_host.CadWallEnd.y-_host.CadWallStart.y; _length=math.hypot(_dx,_dy)", "if _length<1: raise RuntimeError('Opening host wall has invalid length')", "_ux=_dx/_length; _uy=_dy/_length", `_p0=Vector(_host.CadWallStart.x+_ux*${c.offset},_host.CadWallStart.y+_uy*${c.offset},0); _p1=Vector(_p0.x+_ux*${c.width},_p0.y+_uy*${c.width},0)`);
      if (c.kind === "DOOR") lines.push(`_hinge=_p0; _nx=-_uy*${c.swingSide ?? 1}; _ny=_ux*${c.swingSide ?? 1}; _open=Vector(_hinge.x+_nx*${c.width},_hinge.y+_ny*${c.width},0)`, `_arc_points=[Vector(_p0.x+_ux*${c.width}*math.cos(i*math.pi/32)+_nx*${c.width}*math.sin(i*math.pi/32),_p0.y+_uy*${c.width}*math.cos(i*math.pi/32)+_ny*${c.width}*math.sin(i*math.pi/32),0) for i in range(17)]`, "obj.Shape=Part.makeCompound([Part.makeLine(_hinge,_open),Part.makePolygon(_arc_points)])");
      else lines.push(`_nx=-_uy*40; _ny=_ux*40`, "obj.Shape=Part.makeCompound([Part.makeLine(Vector(_p0.x+_nx,_p0.y+_ny,0),Vector(_p1.x+_nx,_p1.y+_ny,0)),Part.makeLine(Vector(_p0.x-_nx,_p0.y-_ny,0),Vector(_p1.x-_nx,_p1.y-_ny,0)),Part.makeLine(Vector(_p0.x+_nx,_p0.y+_ny,0),Vector(_p0.x-_nx,_p0.y-_ny,0)),Part.makeLine(Vector(_p1.x+_nx,_p1.y+_ny,0),Vector(_p1.x-_nx,_p1.y-_ny,0))])");
      lines.push("obj.Position=Vector((_p0.x+_p1.x)/2,(_p0.y+_p1.y)/2,0)");
    }
    else if (c.op === "room") lines.push(`obj.addProperty('App::PropertyString','Text'); obj.Text=${q(c.name)}`, `obj.addProperty('App::PropertyVector','Position'); obj.Position=Vector(${c.at[0]},${c.at[1]},0)`);
    else if (c.op === "stair") lines.push(`_x=${c.at[0]}; _y=${c.at[1]}; _w=${c.width}; _h=${c.depth}; _a=math.radians(${c.angle ?? 0}); _cx=_x+_w/2; _cy=_y+_h/2`, "_edges=[Part.makePolygon([_rp(_x,_y,_cx,_cy,_a),_rp(_x+_w,_y,_cx,_cy,_a),_rp(_x+_w,_y+_h,_cx,_cy,_a),_rp(_x,_y+_h,_cx,_cy,_a),_rp(_x,_y,_cx,_cy,_a)])]", `for _i in range(1,${c.treads + 1}):`, "    _yy=_y+_h*_i/" + (c.treads + 1), "    _edges.append(Part.makeLine(_rp(_x+_w*.08,_yy,_cx,_cy,_a),_rp(_x+_w*.92,_yy,_cx,_cy,_a)))", "_edges.extend([Part.makeLine(_rp(_cx,_y+_h*.2,_cx,_cy,_a),_rp(_cx,_y+_h*.82,_cx,_cy,_a)),Part.makeLine(_rp(_cx,_y+_h*.82,_cx,_cy,_a),_rp(_cx-_w*.08,_y+_h*.70,_cx,_cy,_a)),Part.makeLine(_rp(_cx,_y+_h*.82,_cx,_cy,_a),_rp(_cx+_w*.08,_y+_h*.70,_cx,_cy,_a))])", "obj.Shape=Part.makeCompound(_edges)");
    else if (c.op === "furniture") {
      lines.push(`_x=${c.at[0]}; _y=${c.at[1]}; _w=${c.width}; _h=${c.depth}; _a=math.radians(${c.angle ?? 0}); _cx=_x+_w/2; _cy=_y+_h/2`, "_edges=[]");
      const kind = c.kind.toLowerCase();
      const r = (x: string, y: string, w: string, h: string) => `_edges.append(_frect(${x},${y},${w},${h},_cx,_cy,_a))`;
      if (kind.startsWith("bed")) lines.push(r("_x", "_y", "_w", "_h"), r("_x+_w*.08", "_y+_h*.08", "_w*.84", "_h*.66"), r("_x+_w*.06", "_y+_h*.79", "_w*.88", "_h*.16"), r("_x+_w*.12", "_y+_h*.68", "_w*.34", "_h*.10"), r("_x+_w*.54", "_y+_h*.68", "_w*.34", "_h*.10"), "_edges.append(Part.makeLine(_rp(_x+_w*.5,_y+_h*.08,_cx,_cy,_a),_rp(_x+_w*.5,_y+_h*.74,_cx,_cy,_a)))");
      else if (kind.startsWith("sofa") || kind === "armchair") lines.push(r("_x", "_y", "_w", "_h"), r("_x+_w*.08", "_y+_h*.08", "_w*.84", "_h*.84"), r("_x+_w*.08", "_y+_h*.68", "_w*.84", "_h*.22"), "_edges.append(Part.makeLine(_rp(_x+_w*.5,_y+_h*.10,_cx,_cy,_a),_rp(_x+_w*.5,_y+_h*.68,_cx,_cy,_a)))", "_edges.append(Part.makeLine(_rp(_x+_w*.08,_y+_h*.64,_cx,_cy,_a),_rp(_x+_w*.92,_y+_h*.64,_cx,_cy,_a)))", r("_x+_w*.02", "_y+_h*.08", "_w*.13", "_h*.60"), r("_x+_w*.85", "_y+_h*.08", "_w*.13", "_h*.60"));
      else if (kind.startsWith("dining-table")) {
        lines.push(r("_x+_w*.15", "_y+_h*.16", "_w*.70", "_h*.68"), r("_x+_w*.19", "_y+_h*.20", "_w*.62", "_h*.60"));
        const seats = kind.endsWith("8") ? 8 : kind.endsWith("6") ? 6 : 4;
        lines.push(...(seats >= 4 ? [r("_x+_w*.02", "_y+_h*.28", "_w*.11", "_h*.16"), r("_x+_w*.87", "_y+_h*.28", "_w*.11", "_h*.16"), r("_x+_w*.02", "_y+_h*.56", "_w*.11", "_h*.16"), r("_x+_w*.87", "_y+_h*.56", "_w*.11", "_h*.16")] : []));
        if (seats >= 6) lines.push(r("_x+_w*.28", "_y+_h*.02", "_w*.16", "_h*.11"), r("_x+_w*.56", "_y+_h*.02", "_w*.16", "_h*.11"), r("_x+_w*.28", "_y+_h*.87", "_w*.16", "_h*.11"), r("_x+_w*.56", "_y+_h*.87", "_w*.16", "_h*.11"));
      }
      else if (kind.startsWith("car-")) lines.push("_edges.append(_fpoly([(_x+_w*.18,_y),(_x+_w*.82,_y),(_x+_w*.96,_y+_h*.10),(_x+_w,_y+_h*.28),(_x+_w,_y+_h*.74),(_x+_w*.91,_y+_h*.93),(_x+_w*.78,_y+_h),(_x+_w*.22,_y+_h),(_x+_w*.09,_y+_h*.93),( _x,_y+_h*.74),( _x,_y+_h*.28),(_x+_w*.04,_y+_h*.10)],_cx,_cy,_a))", "_edges.append(_fpoly([(_x+_w*.22,_y+_h*.30),(_x+_w*.78,_y+_h*.30),(_x+_w*.85,_y+_h*.43),(_x+_w*.85,_y+_h*.65),(_x+_w*.15,_y+_h*.65),(_x+_w*.15,_y+_h*.43)],_cx,_cy,_a))", "_edges.extend([Part.makeLine(_rp(_x+_w*.18,_y+_h*.46,_cx,_cy,_a),_rp(_x+_w*.82,_y+_h*.46,_cx,_cy,_a)),Part.makeLine(_rp(_x+_w*.18,_y+_h*.63,_cx,_cy,_a),_rp(_x+_w*.82,_y+_h*.63,_cx,_cy,_a)),Part.makeLine(_rp(_x+_w*.2,_y+_h*.28,_cx,_cy,_a),_rp(_x+_w*.8,_y+_h*.28,_cx,_cy,_a)),Part.makeLine(_rp(_x+_w*.2,_y+_h*.68,_cx,_cy,_a),_rp(_x+_w*.8,_y+_h*.68,_cx,_cy,_a))])", "_edges.extend([_frect(_x+_w*.02,_y+_h*.22,_w*.08,_h*.13,_cx,_cy,_a),_frect(_x+_w*.02,_y+_h*.72,_w*.08,_h*.13,_cx,_cy,_a),_frect(_x+_w*.90,_y+_h*.22,_w*.08,_h*.13,_cx,_cy,_a),_frect(_x+_w*.90,_y+_h*.72,_w*.08,_h*.13,_cx,_cy,_a)])", "_edges.extend([Part.makeLine(_rp(_x+_w*.18,_y+_h*.08,_cx,_cy,_a),_rp(_x+_w*.82,_y+_h*.08,_cx,_cy,_a)),Part.makeLine(_rp(_x+_w*.18,_y+_h*.92,_cx,_cy,_a),_rp(_x+_w*.82,_y+_h*.92,_cx,_cy,_a))])");
      else if (kind === "toilet") lines.push(r("_x+_w*.30", "_y+_h*.03", "_w*.40", "_h*.23"), "_edges.append(_fellipse(_x+_w*.5,_y+_h*.62,_w*.29,_h*.34,_cx,_cy,_a))", "_edges.append(_fellipse(_x+_w*.5,_y+_h*.62,_w*.17,_h*.21,_cx,_cy,_a))");
      else if (kind === "bathtub") lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(_fellipse(_x+_w*.5,_y+_h*.5,_w*.40,_h*.43,_cx,_cy,_a))", "_edges.append(_frect(_x+_w*.42,_y+_h*.06,_w*.16,_h*.08,_cx,_cy,_a))");
      else if (kind === "shower") lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(_fpoly([(_x+_w*.15,_y+_h*.15),(_x+_w*.85,_y+_h*.15),(_x+_w*.85,_y+_h*.85),(_x+_w*.15,_y+_h*.85)],_cx,_cy,_a))", "_edges.append(_fcircle(_cx,_cy,min(_w,_h)*.07,_cx,_cy,_a))", "_edges.append(Part.makeLine(_rp(_x+_w*.15,_y+_h*.15,_cx,_cy,_a),_rp(_x+_w*.85,_y+_h*.85,_cx,_cy,_a)))");
      else if (kind === "kitchen-counter" || kind === "kitchen-island") lines.push(r("_x", "_y", "_w", "_h"), r("_x+_w*.05", "_y+_h*.08", "_w*.27", "_h*.84"), r("_x+_w*.36", "_y+_h*.08", "_w*.27", "_h*.84"), r("_x+_w*.67", "_y+_h*.08", "_w*.27", "_h*.84"), "_edges.append(_fellipse(_x+_w*.18,_y+_h*.5,_w*.07,_h*.20,_cx,_cy,_a))", "_edges.extend([_fcircle(_x+_w*.77,_y+_h*.34,min(_w,_h)*.035,_cx,_cy,_a),_fcircle(_x+_w*.87,_y+_h*.34,min(_w,_h)*.035,_cx,_cy,_a),_fcircle(_x+_w*.77,_y+_h*.66,min(_w,_h)*.035,_cx,_cy,_a),_fcircle(_x+_w*.87,_y+_h*.66,min(_w,_h)*.035,_cx,_cy,_a)])");
      else if (kind === "cooker") lines.push(r("_x", "_y", "_w", "_h"), "_edges.extend([_fcircle(_x+_w*.30,_y+_h*.30,min(_w,_h)*.12,_cx,_cy,_a),_fcircle(_x+_w*.70,_y+_h*.30,min(_w,_h)*.12,_cx,_cy,_a),_fcircle(_x+_w*.30,_y+_h*.70,min(_w,_h)*.12,_cx,_cy,_a),_fcircle(_x+_w*.70,_y+_h*.70,min(_w,_h)*.12,_cx,_cy,_a)])");
      else if (kind === "kitchen-sink" || kind === "sink" || kind === "bath-vanity") lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(_fellipse(_x+_w*.5,_y+_h*.52,_w*.34,_h*.35,_cx,_cy,_a))", "_edges.append(_fcircle(_x+_w*.5,_y+_h*.16,min(_w,_h)*.035,_cx,_cy,_a))", "_edges.append(Part.makeLine(_rp(_x+_w*.5,_y+_h*.16,_cx,_cy,_a),_rp(_x+_w*.5,_y+_h*.34,_cx,_cy,_a)))");
      else if (kind === "refrigerator") lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(Part.makeLine(_rp(_x+_w*.08,_y+_h*.58,_cx,_cy,_a),_rp(_x+_w*.92,_y+_h*.58,_cx,_cy,_a)))", "_edges.append(Part.makeLine(_rp(_x+_w*.82,_y+_h*.18,_cx,_cy,_a),_rp(_x+_w*.82,_y+_h*.48,_cx,_cy,_a)))");
      else if (kind === "wardrobe") lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(Part.makeLine(_rp(_x+_w*.5,_y+_h*.05,_cx,_cy,_a),_rp(_x+_w*.5,_y+_h*.95,_cx,_cy,_a)))", "_edges.extend([_fcircle(_x+_w*.44,_y+_h*.5,min(_w,_h)*.025,_cx,_cy,_a),_fcircle(_x+_w*.56,_y+_h*.5,min(_w,_h)*.025,_cx,_cy,_a)])");
      else if (kind === "desk") lines.push(r("_x", "_y", "_w", "_h"), r("_x+_w*.1", "_y+_h*.08", "_w*.8", "_h*.56"), r("_x+_w*.32", "_y+_h*.73", "_w*.36", "_h*.17"));
      else if (kind === "chair" || kind === "armchair") lines.push(r("_x+_w*.12", "_y+_h*.08", "_w*.76", "_h*.30"), r("_x+_w*.10", "_y+_h*.38", "_w*.80", "_h*.54"));
      else lines.push(r("_x", "_y", "_w", "_h"), "_edges.append(Part.makeLine(_rp(_x,_y,_cx,_cy,_a),_rp(_x+_w,_y+_h,_cx,_cy,_a)))", "_edges.append(Part.makeLine(_rp(_x+_w,_y,_cx,_cy,_a),_rp(_x,_y+_h,_cx,_cy,_a)))");
      lines.push("obj.Shape=Part.makeCompound(_edges)");
    } else lines.push(`_x=${c.at[0]}; _y=${c.at[1]}; _w=${c.width}; _h=${c.depth}; _a=math.radians(${c.angle ?? 0})`, "_p=[Vector(_x,_y,0),Vector(_x+_w,_y,0),Vector(_x+_w,_y+_h,0),Vector(_x,_y+_h,0)]", "_center=Vector(_x+_w/2,_y+_h/2,0)", "_p=[_center.add(Vector((p.x-_center.x)*math.cos(_a)-(p.y-_center.y)*math.sin(_a),(p.x-_center.x)*math.sin(_a)+(p.y-_center.y)*math.cos(_a),0)) for p in _p]", "obj.Shape=Part.makePolygon(_p+[_p[0]])");
  }
  return lines.join("\n");
}

export function sandboxName(userId: string): string {
  return `qattan-cad-${createHash("sha256").update(userId).digest("hex").slice(0, 22)}`;
}

function projectRoot(projectId: string): string {
  if (!/^[0-9a-f]{24}$/.test(projectId)) throw new Error("Invalid CAD project ID");
  return `${PROJECTS}/${projectId}`;
}

export async function getCadSandbox(userId: string): Promise<Sandbox> {
  return Sandbox.getOrCreate({
    name: sandboxName(userId), image: IMAGE, timeout: 900_000,
    resources: { vcpus: 4 }, persistent: true, keepLastSnapshots: { count: 1 },
  });
}

const SETUP_SCRIPT = `#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="${RUNTIME}"
trap 'echo "FreeCAD setup failed; see setup.log" > "$ROOT/error"; rm -f "$ROOT/installing"' ERR
mkdir -p "$ROOT"
if [ -f "$ROOT/ready" ]; then rm -f "$ROOT/installing"; exit 0; fi
echo "Downloading official FreeCAD 1.1.3 AppImage" > "$ROOT/setup.log"
curl --fail --location --retry 2 --silent --show-error "${FREECAD_URL}" -o "$ROOT/FreeCAD.AppImage" 2>>"$ROOT/setup.log"
echo "${FREECAD_SHA256}  $ROOT/FreeCAD.AppImage" | sha256sum -c - >>"$ROOT/setup.log" 2>&1
chmod +x "$ROOT/FreeCAD.AppImage"
cd "$ROOT"
"$ROOT/FreeCAD.AppImage" --appimage-extract >>"$ROOT/setup.log" 2>&1
mv "$ROOT/squashfs-root" "$ROOT/freecad"
cat > "$ROOT/smoke.py" <<'PY'
import FreeCAD as App
import Part
import os
doc = App.newDocument('CadSmoke')
obj = doc.addObject('Part::Feature', 'Smoke')
obj.Shape = Part.makeLine(App.Vector(0, 0, 0), App.Vector(1000, 0, 0))
doc.recompute()
if len(obj.Shape.Edges) != 1: raise RuntimeError('FreeCAD geometry kernel did not run')
open('/vercel/sandbox/cad-runtime/smoke-ok','w').write('ok')
App.closeDocument(doc.Name)
PY
"$ROOT/freecad/AppRun" --console "$ROOT/smoke.py" >>"$ROOT/setup.log" 2>&1
test -f "$ROOT/smoke-ok"
rm -f "$ROOT/FreeCAD.AppImage" "$ROOT/installing" "$ROOT/error"
touch "$ROOT/ready"
`;

export async function setupCadSandbox(sandbox: Sandbox): Promise<"ready" | "installing" | "error"> {
  const status = await sandbox.runCommand("bash", ["-lc", `if [ -f ${READY} ]; then echo ready; elif [ -f ${RUNTIME}/error ]; then echo error; elif [ -f ${RUNTIME}/installing ]; then age=$(($(date +%s)-$(stat -c %Y ${RUNTIME}/installing))); if [ "$age" -gt 630 ]; then echo error; else echo installing; fi; else echo new; fi`]);
  const state = (await status.stdout()).trim();
  if (state === "ready" || state === "installing" || state === "error") return state;
  await sandbox.runCommand("mkdir", ["-p", RUNTIME]);
  await sandbox.writeFiles([{ path: `${RUNTIME}/setup.sh`, content: SETUP_SCRIPT }]);
  await sandbox.runCommand("touch", [`${RUNTIME}/installing`]);
  await sandbox.runCommand({ cmd: "bash", args: [`${RUNTIME}/setup.sh`], detached: true, timeoutMs: 600_000 });
  return "installing";
}

export async function retryCadSetup(sandbox: Sandbox): Promise<void> {
  await sandbox.runCommand("rm", ["-f", `${RUNTIME}/error`, `${RUNTIME}/installing`]);
}

export async function readCadInspection(sandbox: Sandbox, projectId: string): Promise<{ inspection: CadInspection | null; preview: string | null }> {
  const root = projectRoot(projectId);
  let savedInspection: CadInspection | null = null;
  let savedPreview: string | null = null;
  try {
    const [raw, svg] = await Promise.all([
      sandbox.readFileToBuffer({ path: `${root}/result.json` }),
      sandbox.readFileToBuffer({ path: `${root}/plan.svg` }),
    ]);
    if (raw?.length && raw.length <= 1_000_000) {
      const parsed = JSON.parse(raw.toString("utf8")) as CadInspection;
      if (parsed?.ok === true && Array.isArray(parsed.objects) && parsed.counts && Array.isArray(parsed.warnings)) savedInspection = parsed;
    }
    if (svg?.length && svg.length <= CAD_AGENT.maxSvg) savedPreview = svg.toString("utf8");
  } catch { /* Recover from stale, missing, or malformed saved inspection metadata below. */ }

  // FCStd is the source of truth. Rebuild inspection metadata from the saved document
  // before allowing the model to plan another edit, so it cannot mistake an existing
  // drawing for an empty project after an interrupted/failed stage.
  const projectCheck = await sandbox.runCommand({ cmd: "bash", args: ["-lc", `test -s '${root}/project.FCStd'`] });
  if (projectCheck.exitCode !== 0) {
    if (savedInspection || savedPreview) throw new Error("Saved CAD inspection exists but its FreeCAD document is missing");
    return { inspection: null, preview: null };
  }
  if (savedInspection && savedPreview) return { inspection: savedInspection, preview: savedPreview };
  try {
    const siteBuffer = await sandbox.readFileToBuffer({ path: `${root}/site.json` });
    if (!siteBuffer || siteBuffer.length > 2_000) throw new Error("site metadata unavailable");
    const site = JSON.parse(siteBuffer.toString("utf8")) as { width?: unknown; depth?: unknown };
    if (typeof site.width !== "number" || !Number.isFinite(site.width) || site.width < 3 || site.width > 100 || typeof site.depth !== "number" || !Number.isFinite(site.depth) || site.depth < 3 || site.depth > 100) throw new Error("site metadata invalid");
    const recovered = await runCadAction(sandbox, { projectId, instruction: "recover saved CAD inspection", siteWidth: site.width, siteDepth: site.depth, step: 0 }, { python: "pass", summary: "inspect saved document", done: false }, true);
    return recovered;
  } catch (error) {
    throw new Error("Saved CAD document could not be inspected; no new drawing step was run", { cause: error });
  }
}

export async function proposeCadAction(input: CadInput, inspection: CadInspection | null, preview: string | null, fetchFn: typeof fetch = fetch): Promise<CadAction> {
  const model = resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !key) throw new Error("CAD text model unavailable");
  const description = JSON.stringify({
    userBrief: input.instruction, siteMeters: [input.siteWidth, input.siteDepth], step: input.step + 1,
    maxSteps: CAD_AGENT.maxSteps, executionError: input.executionError,
    currentDrawing: inspection ? { counts: inspection.counts, warnings: inspection.warnings, objects: inspection.objects.slice(0, 75), segments: inspection.segments } : null,
  });
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [{ type: "text", text: description }];
  if (preview) {
    const png = await sharp(Buffer.from(preview)).resize({ width: 900, height: 900, fit: "inside" }).png().toBuffer();
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
  }
  const response = await fetchFn(OPENROUTER_ENDPOINT, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, temperature: 0.2, max_tokens: 12000, reasoning: { enabled: false }, messages: [
      { role: "system", content: `You are an autonomous architectural CAD operator. You control a REAL FreeCAD 1.1 document through an incremental Python tool call. Return ONLY JSON: {"python":"full Python action for THIS step","summary":"brief Arabic description of completed intended work","done":boolean}. The host opens the existing FCStd as variable doc; App, Part, Vector, add_label(text-name, text, x_mm, y_mm), SITE_WIDTH_MM and SITE_DEPTH_MM are available. All coordinates are MILLIMETERS: a 20m lot is 20000mm. Use doc.addObject('Part::Feature', 'WALL_Name') and set Shape to Part.makePolygon([Vector(x,y,0),...]); set Label prefixes SITE_, WALL_, DOOR_, WINDOW_, STAIR_, FURNITURE_, DIMENSION_, COLUMN_ so CAD layers can be inspected. You may use the broader FreeCAD and Part Python APIs to create/edit any geometry. If currentDrawing exists, EDIT and enrich the existing document; never duplicate its site or existing walls. Otherwise create the site and coherent spatial partitions first. On later steps use the supplied actual document inspection and CAD preview IMAGE to correct and enrich doors, windows, furniture, stairs and annotations. Draw actual geometry, not fake labels. Do not erase the whole document unless the user explicitly requested a new project. Do not write files, make network calls, or export: the host saves FCStd and exports editable DXF. Before returning, inspect your coordinates: site bounds, wall gaps, reachable doors, room sizes, collisions. Prefer small coherent additions over a single huge script. Set done=true only when the brief is satisfied and the drawing has architectural detail. A successful Python run is not proof of architectural compliance. Never claim Egyptian code approval. No Markdown.` },
      { role: "user", content },
    ] }),
    signal: AbortSignal.timeout(75_000),
  });
  if (!response.ok) throw new Error(`CAD model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("CAD model response too large");
  const payload = JSON.parse(raw) as Record<string, unknown>;
  const answer = extractChatText(payload);
  const action = answer && parseCadAction(answer);
  if (!action) {
    const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
    const message = choice?.message as Record<string, unknown> | undefined;
    const decoded = answer ? extractJsonPayload(answer) : null;
    const fields = decoded && typeof decoded === "object" && !Array.isArray(decoded) ? decoded as Record<string, unknown> : null;
    throw new Error(`CAD model returned no executable action (finish=${String(choice?.finish_reason ?? "missing")}, contentLength=${answer?.length ?? 0}, contentType=${typeof message?.content}, pythonLength=${typeof fields?.python === "string" ? fields.python.length : "missing"}, summaryLength=${typeof fields?.summary === "string" ? fields.summary.length : "missing"}, doneType=${typeof fields?.done})`);
  }
  return action;
}

export class CadCommandValidationError extends Error {
  constructor(readonly diagnostic: { category: string; attempt: number; finishReason: string; responseContentLength: number; commandIndex?: number; op?: string; schemaFields?: string[] }) {
    super("CAD model returned invalid structured drawing commands");
    this.name = "CadCommandValidationError";
  }
}

export async function proposeCadCommands(input: CadInput, inspection: CadInspection | null, preview: string | null, fetchFn: typeof fetch = fetch, attempt = 0): Promise<CadCommandAction> {
  const model = resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !key) throw new Error("CAD text model unavailable");
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [{ type: "text", text: JSON.stringify({ userBrief: input.instruction, siteMm: [input.siteWidth * 1000, input.siteDepth * 1000], stage: input.step + 1, maxStages: CAD_AGENT.maxSteps, executionError: input.executionError, currentDrawing: inspection ? { counts: inspection.counts, warnings: inspection.warnings, objects: inspection.objects.slice(0, 75), objectIds: inspection.objectIds?.slice(0, 500), segments: inspection.segments } : null }) }];
  if (preview) {
    const png = await sharp(Buffer.from(preview)).resize({ width: 900, height: 900, fit: "inside" }).png().toBuffer();
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
  }
  const thinking = model.startsWith("anthropic/") ? { max_tokens: 3_000 } : { effort: "medium" };
  const response = await fetchFn(OPENROUTER_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: attempt === 0 ? 10_000 : 7_000, reasoning: attempt === 0 ? thinking : (model.startsWith("anthropic/") ? { max_tokens: 1_500 } : { effort: "medium" }), messages: [
  { role: "system", content: `You are an architectural CAD operator. Return ONLY JSON with shape {"commands":[...],"summary":"brief Arabic stage report","selfReview":["specific check/result"],"requiredElements":[{"requirement":"a concrete user-brief requirement","status":"met"|"unresolved","evidenceIds":["existing-or-created-object-id"],"evidence":"what inspected geometry supports this"}],"unresolvedItems":["remaining brief or drawing issue"],"done":false}. Never return code. Coordinates and sizes are millimeters in a 0..siteMm rectangle. Wall endpoints describe the wall centerline, so inset boundary walls by half their thickness to keep the finished face on the lot edge. Available commands: {"op":"wall","id":"stable-id","from":[x,y],"to":[x,y],"thickness":200}; {"op":"beam","id":"stable-id","from":[x,y],"to":[x,y],"width":250} for a conceptual 2D beam footprint only, with no structural sizing or validation; {"op":"dimension","id":"stable-id","from":[x,y],"to":[x,y],"offset":400} to draw extension lines, measured dimension line and numeric millimeter label for that exact span; dimensions are placed toward the site center automatically, but check their full bounds; {"op":"line","id":"stable-id","from":[x,y],"to":[x,y],"layer":"DIMENSION"}; {"op":"polyline","id":"stable-id","points":[[x,y],...],"closed":true,"layer":"OTHER"} for bounded primitive outlines; {"op":"opening","id":"stable-id","wallId":"existing-wall-id","offset":1200,"kind":"DOOR"|"WINDOW","width":900,"swingSide":1}. Openings cut a gap from that wall and draw a door leaf/swing arc or double-line window symbol; offset is measured from its start centerline. The default door swing points toward the site center; use swingSide 1 or -1 only when the chosen swing and its full arc remain inside the site. The host wall must exist already or be added earlier in the same batch. {"op":"hatch","id":"stable-id","targetId":"closed-polyline-or-wall-id","pattern":"diagonal"|"cross"|"tile","spacing":400,"angle":45} creates clipped, editable pattern strokes on a dedicated HATCH layer; tile is an orthogonal grid. Hatch only material zones you mean to show; spacing is bounded and hatch strokes are not associative native HATCH entities. {"op":"room","id":"stable-id","name":"Living","at":[x,y]}; {"op":"stair","id":"stable-id","kind":"flight","at":[x,y],"width":1000,"depth":3000,"angle":0,"treads":12} draws a schematic single flight with treads and travel arrow. {"op":"furniture","id":"stable-id","kind":"bed|bed-single|bed-double|sofa|sofa-2-seat|sofa-3-seat|armchair|dining-table|dining-table-4|dining-table-6|desk|wardrobe|kitchen-counter|kitchen-island|refrigerator|cooker|kitchen-sink|sink|bath-vanity|toilet|bathtub|shower|chair|car-compact|car-sedan|car-suv|generic-block","at":[x,y],"width":1800,"depth":2000,"angle":0}. Cars are top-view symbols; set width to vehicle width (~1800mm) and depth to its length (~4300mm), then rotate via angle. Beds, seating, dining tables and chairs, kitchen/bath fixtures and vehicles are procedural 2D outline/detail symbols with no third-party asset pack. {"op":"column","id":"stable-id","kind":"...","at":[x,y],"width":300,"depth":300,"angle":0}. Stair, furniture, vehicle and column shapes are schematic plan symbols, not detailed objects. {"op":"delete","id":"existing-stable-id"}. Max 80 commands per stage and two hatch commands per stage. IDs must remain stable across stages; edit by reusing the same ID; remove with delete. Work in incremental stages: first make site perimeter and major partition walls; next openings and room labels; then room hatches, dimensioned plans, stairs/furniture/vehicles/columns/beams and corrections. Every complete object shape must remain inside the site, not just its insertion point. Preflight wall thickness, door swing arcs, dimension ticks, and the rotated extents of furniture, cars, and stairs against all four boundaries. Keep clearance where a symbol has nonzero extent. Before completion, review the inspection warnings and preview. Fill selfReview with concrete visual/geometry checks performed. Map the important requirements from the actual user brief into requiredElements, and cite IDs that exist in the final inspection; mark each met only when the inspection is evidence. Explicitly list every outstanding brief or drawing issue in unresolvedItems. Set done=true only when every required element is met, every cited ID exists, unresolvedItems is empty, and deterministic geometry warnings are empty. Room enclosure/access, structure, and code are NOT checked; never present this as architectural correctness or claim code compliance.` },
    { role: "user", content },
  ] }), signal: AbortSignal.timeout(attempt === 0 ? 90_000 : 55_000) });
  if (!response.ok) throw new Error(`CAD model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("CAD model response too large");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("CAD model response envelope invalid"); }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 32) : "missing";
  const answer = extractChatText(payload);
  const rejection: CadCommandRejection = { category: finishReason === "length" ? "response_truncated" : "missing_model_content" };
  const action = answer && finishReason !== "length" ? parseCadCommandAction(answer, input.siteWidth, input.siteDepth, inspection, rejection) : null;
  if (!action) {
    const diagnostic = { category: rejection.category, attempt: attempt + 1, finishReason, responseContentLength: answer?.length ?? 0, commandIndex: rejection.commandIndex, op: rejection.op, schemaFields: rejection.schemaFields };
    console.warn("[CAD_MODEL_OUTPUT_REJECTED]", JSON.stringify(diagnostic));
    if (attempt === 0) {
      const fields = rejection.schemaFields?.length ? ` Invalid schema fields: ${rejection.schemaFields.join(", ")}.` : "";
      const reason = `Previous CAD reply failed validation (${rejection.category}${rejection.commandIndex !== undefined ? `, command index ${rejection.commandIndex}` : ""}${rejection.op ? `, operation ${rejection.op}` : ""}${finishReason === "length" ? ", response was truncated" : ""}).${fields} Return a corrected complete JSON action. Preserve the user's design intent; change only invalid fields or commands. Keep all site, geometry, ID, and schema constraints.`;
      return proposeCadCommands({ ...input, executionError: reason }, inspection, preview, fetchFn, 1);
    }
    throw new CadCommandValidationError(diagnostic);
  }
  return action;
}

export async function runCadAction(sandbox: Sandbox, input: CadInput, action: CadAction, inspectOnly = false): Promise<{ inspection: CadInspection; preview: string }> {
  const root = projectRoot(input.projectId);
  await sandbox.runCommand("mkdir", ["-p", root]);
  const existing = await sandbox.runCommand("bash", ["-lc", `test -f '${root}/project.FCStd' && echo existing || echo new`]);
  const projectState = (await existing.stdout()).trim();
  if (projectState === "existing") {
    const siteFile = await sandbox.readFileToBuffer({ path: `${root}/site.json` });
    if (!siteFile) throw new Error("CAD site metadata is missing");
    const site = JSON.parse(siteFile.toString("utf8")) as { width: number; depth: number };
    if (site.width !== input.siteWidth || site.depth !== input.siteDepth) throw new Error("CAD site dimensions are fixed for this project; start a new project to change them");
  }
  await sandbox.writeFiles([
    { path: `${root}/harness.py`, content: FREECAD_HARNESS },
    { path: `${root}/action.py`, content: action.python },
  ]);
  if (projectState !== "existing") await sandbox.writeFiles([{ path: `${root}/site.json`, content: JSON.stringify({ width: input.siteWidth, depth: input.siteDepth }) }]);
  await sandbox.update({ networkPolicy: "deny-all" });
  const cmd = await sandbox.runCommand({ cmd: `${RUNTIME}/freecad/AppRun`, args: ["--console", `${root}/harness.py`], env: { QATTAN_CAD_PROJECT_ROOT: root, QATTAN_CAD_INSPECT_ONLY: inspectOnly ? "1" : "0" }, timeoutMs: 45_000 });
  const [raw, preview] = await Promise.all([
    sandbox.readFileToBuffer({ path: `${root}/result.json` }).catch(() => null),
    sandbox.readFileToBuffer({ path: `${root}/plan.svg` }).catch(() => null),
  ]);
  const inspection = raw?.length ? JSON.parse(raw.toString("utf8")) as CadInspection : null;
  if (cmd.exitCode !== 0 || !inspection?.ok) {
    const failureRaw = await sandbox.readFileToBuffer({ path: `${root}/failure.json` }).catch(() => null);
    let failure: { error?: unknown } | null = null;
    if (failureRaw?.length && failureRaw.length <= 2_000) {
      try { failure = JSON.parse(failureRaw.toString("utf8")) as { error?: unknown }; } catch { /* Use bounded process stderr below. */ }
    }
    const errorMessage = typeof failure?.error === "string" ? failure.error : inspection?.error;
    const boundsError = errorMessage && parseCadBoundsFailure(errorMessage);
    if (boundsError) throw new CadGeometryBoundsError(boundsError);
    const stderr = (await cmd.stderr()).slice(-900);
    throw new Error(`FreeCAD action failed: ${errorMessage ?? stderr ?? "unknown"}`);
  }
  if (!preview?.length || preview.length > CAD_AGENT.maxSvg) throw new Error("FreeCAD preview unavailable or too large");
  return { inspection, preview: preview.toString("utf8") };
}

export async function readCadDownload(sandbox: Sandbox, projectId: string, kind: "fcstd" | "dxf"): Promise<Buffer> {
  const root = projectRoot(projectId);
  const file = kind === "fcstd" ? `${root}/project.FCStd` : `${root}/plan.dxf`;
  const content = await sandbox.readFileToBuffer({ path: file });
  if (!content) throw new Error("CAD project file missing");
  return content;
}

export async function rollbackCadProject(sandbox: Sandbox, projectId: string): Promise<{ inspection: CadInspection; preview: string }> {
  const root = projectRoot(projectId);
  const history = `${root}/versions`;
  const command = `set -eu; mkdir -p '${history}'; cp '${root}/project.FCStd' '${history}/current.FCStd'; prior=$(find '${history}' -maxdepth 1 -type f -name 'v-*.FCStd' -printf '%T@ %p\\n' | sort -nr | sed -n '1s/^[^ ]* //p'); test -n "$prior"; cp "$prior" '${root}/project.FCStd'; rm -f "$prior"`;
  const result = await sandbox.runCommand("bash", ["-lc", command]);
  if (result.exitCode !== 0) throw new Error("No previous CAD version is available");
  const siteFile = await sandbox.readFileToBuffer({ path: `${root}/site.json` });
  if (!siteFile) throw new Error("CAD site metadata is missing");
  const site = JSON.parse(siteFile.toString("utf8")) as { width: number; depth: number };
  return runCadAction(sandbox, { projectId, instruction: "rollback inspection", siteWidth: site.width, siteDepth: site.depth, step: 0 }, { python: "pass", summary: "rollback", done: false }, true);
}
