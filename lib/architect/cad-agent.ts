import { createHash } from "node:crypto";
import { Sandbox } from "@vercel/sandbox";
import sharp from "sharp";
import { extractChatText, extractJsonPayload, resolveArchitectTextModel } from "../architect-interpreter";
import { CONCEPT_BOARD_MODELS, getSelectedPanelDataUrl, parseSelectedConcept, type ArchitecturalConcept } from "./concept-board";
import { OPENROUTER_ENDPOINT } from "../openrouter-engine";
import { FREECAD_HARNESS } from "./cad-agent-harness";
import { cadPlanFocus, type CadPlanQualityIssue } from "./cad-plan-quality";

const PROJECTS = "/vercel/sandbox/cad-projects";
const RUNTIME = "/vercel/sandbox/cad-runtime";
const READY = `${RUNTIME}/ready`;
const IMAGE = "vercel/sandbox/universal:latest";
const FREECAD_URL = "https://github.com/FreeCAD/FreeCAD/releases/download/1.1.3/FreeCAD_1.1.3-Linux-x86_64-py311.AppImage";
const FREECAD_SHA256 = "3a853eb69ee595f779f2255dbf80a765926981d8ff68903cefee4dfb03a8f5ef";
const CAD_ID = /^[a-z][a-z0-9_-]{1,39}$/i;

export const CAD_AGENT = { maxBrief: 1500, maxCode: 14000, maxSteps: 6, maxSvg: 500_000 } as const;
export type CadInput = { projectId: string; instruction: string; siteWidth: number; siteDepth: number; step: number; executionError?: string; selectedConcept?: ArchitecturalConcept; conceptBoardDataUrl?: string };
export type CadAction = { python: string; summary: string; done: boolean };
export type CadLayer = "SITE" | "WALL" | "BEAM" | "DOOR" | "WINDOW" | "STAIR" | "FURNITURE" | "DIMENSION" | "COLUMN" | "TEXT" | "HATCH" | "SHAFT" | "OTHER";
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
  | { op: "shaft"; id: string; kind: "ventilation" | "service"; at: [number, number]; width: number; depth: number }
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
export type CadCommandRejectionReasonCode = "unsupported_furniture_kind" | "invalid_furniture_dimensions" | "furniture_outside_site" | "invalid_vehicle_scale" | "topology_phase_restriction" | "opening_invalid_kind" | "opening_host_wall_missing" | "opening_invalid_width" | "opening_invalid_offset" | "opening_invalid_swing" | "opening_overlap";
export type CadCommandRejection = { category: string; commandIndex?: number; op?: string; schemaFields?: string[]; reasonCode?: CadCommandRejectionReasonCode; hostWallLengthMm?: number; openingMaxOffsetMm?: number };
export type CadInspection = { ok: boolean; error?: string; objects: { id?: string; label: string; type: string; layer: string; semantic?: string; kind?: string; text?: string; positionMm?: number[]; boundsMm?: number[]; wallStartMm?: number[]; wallEndMm?: number[]; wallThicknessMm?: number; wallOpenings?: string[]; hostWallId?: string; openingOffsetMm?: number; openingWidthMm?: number; lineStartMm?: number[]; lineEndMm?: number[]; polylinePointsMm?: number[][]; closed?: boolean; hatchHostId?: string }[]; objectIds?: string[]; counts: Record<string, number>; warnings: string[]; qualityIssues?: CadPlanQualityIssue[]; unverifiedChecks?: string[]; wallBaselineReady?: boolean; wallBaselineIds?: string[]; wallCurrentIds?: string[]; wallBaselineCount?: number; wallCurrentCount?: number; wallChanges?: { id: string; kind: "deleted" | "modified"; beforeStartMm: number[]; beforeEndMm: number[]; afterStartMm?: number[]; afterEndMm?: number[] }[]; segments: number; siteMm: number[] };
export type CadBoundsViolation = { code: "OUTSIDE_SITE"; id: string; label: string; boundsMm: [number, number, number, number]; siteMm: [number, number]; extremeBounds?: boolean };

export function parseCadBoundsFailure(error: string): CadBoundsViolation[] | null {
  const prefix = "CAD_BOUNDS_ERROR:";
  if (!error.startsWith(prefix)) return null;
  let raw: unknown;
  try { raw = JSON.parse(error.slice(prefix.length)); } catch { return null; }
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 4) return null;
const layers = new Set(["SITE", "WALL", "BEAM", "DOOR", "WINDOW", "STAIR", "FURNITURE", "DIMENSION", "COLUMN", "TEXT", "HATCH", "SHAFT", "OTHER"]);
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
  let selectedConcept: ArchitecturalConcept | undefined;
  if (v.selectedConcept !== undefined) {
    const parsedConcept = parseSelectedConcept(v.selectedConcept);
    if (!parsedConcept) return null;
    selectedConcept = parsedConcept;
  }
  if (selectedConcept && (selectedConcept.siteWidthM !== v.siteWidth || selectedConcept.siteDepthM !== v.siteDepth)) return null;
  if (v.conceptBoardDataUrl !== undefined && (typeof v.conceptBoardDataUrl !== "string" || v.conceptBoardDataUrl.length > 2_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i.test(v.conceptBoardDataUrl))) return null;
  if (v.conceptBoardDataUrl !== undefined && !selectedConcept) return null;
  return { projectId: v.projectId, instruction: v.instruction.trim(), siteWidth: v.siteWidth, siteDepth: v.siteDepth, step: v.step as number, executionError: v.executionError as string | undefined, selectedConcept, conceptBoardDataUrl: v.conceptBoardDataUrl as string | undefined };
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

const CAD_LAYERS = new Set<CadLayer>(["SITE", "WALL", "BEAM", "DOOR", "WINDOW", "STAIR", "FURNITURE", "DIMENSION", "COLUMN", "TEXT", "HATCH", "SHAFT", "OTHER"]);
const CAD_FURNITURE_KINDS = new Set<CadFurnitureKind>(["bed", "bed-single", "bed-double", "sofa", "sofa-2-seat", "sofa-3-seat", "armchair", "dining-table", "dining-table-4", "dining-table-6", "desk", "wardrobe", "kitchen-counter", "kitchen-island", "refrigerator", "cooker", "kitchen-sink", "sink", "bath-vanity", "toilet", "bathtub", "shower", "chair", "car-compact", "car-sedan", "car-suv", "generic-block"]);
function point(value: unknown): value is [number, number] { return Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 100_000); }
function cadSchemaIssues(value: Record<string, unknown>, maxCommands = 80): string[] {
  const issues: string[] = [];
  const add = (field: string, reason: string) => { if (issues.length < 12) issues.push(`${field}:${reason}`); };
  if (!Array.isArray(value.commands)) add("commands", value.commands === undefined ? "missing" : "expected_array");
  else if (value.commands.length < 1 || value.commands.length > maxCommands) add("commands", `count_out_of_range_1_${maxCommands}`);
  if (value.summary !== undefined && typeof value.summary !== "string") add("summary", "expected_string");
  else if (typeof value.summary === "string" && value.summary.length > 500) add("summary", "max_length_500");
  if (value.selfReview !== undefined) {
    if (!Array.isArray(value.selfReview)) add("selfReview", "expected_array");
    else {
      if (value.selfReview.length > 8) add("selfReview", "max_items_8");
      value.selfReview.forEach((item, index) => { if (typeof item !== "string" || item.length > 240) add(`selfReview[${index}]`, "expected_string_max_240"); });
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
function normalizeCadRequirements(raw: unknown): { requiredElements: CadRequirementReview[]; reviewNeeded: boolean; pending: string[] } {
  if (raw === undefined) return { requiredElements: [], reviewNeeded: false, pending: [] };
  if (!Array.isArray(raw)) return { requiredElements: [], reviewNeeded: true, pending: ["Brief requirement evidence needs review"] };
  const requiredElements: CadRequirementReview[] = [];
  const pending: string[] = [];
  let reviewNeeded = raw.length > 12;
  if (reviewNeeded) pending.push("Additional brief requirements need review");
  for (const entry of raw.slice(0, 12)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      reviewNeeded = true;
      pending.push("Brief requirement metadata needs review");
      continue;
    }
    const item = entry as Record<string, unknown>;
    const validRequirement = typeof item.requirement === "string" && item.requirement.trim().length >= 3 && item.requirement.length <= 120;
    const requirement = validRequirement ? (item.requirement as string).trim() : "Brief requirement needs review";
    const validStatus = item.status === "met" || item.status === "unresolved";
    const evidenceIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : [];
    const validIds = evidenceIds.length <= 8 && evidenceIds.every((id) => typeof id === "string" && CAD_ID.test(id));
    const evidence = typeof item.evidence === "string" && item.evidence.trim().length > 0 && item.evidence.length <= 200 ? item.evidence.trim() : "Not evaluated yet";
    const claimedMet = item.status === "met";
    const provenMet = claimedMet && validRequirement && validStatus && validIds && evidenceIds.length > 0 && evidence !== "Not evaluated yet";
    const status: CadRequirementReview["status"] = provenMet ? "met" : "unresolved";
    const normalizedIds = validIds && (!claimedMet || provenMet) ? evidenceIds as string[] : [];
    requiredElements.push({ requirement, status, evidenceIds: normalizedIds, evidence: provenMet ? evidence : "Not evaluated yet" });
    if (status === "unresolved") {
      pending.push(`Evidence pending: ${requirement}`);
      if (claimedMet || !validRequirement || !validStatus || !validIds || (item.evidence !== undefined && evidence === "Not evaluated yet")) reviewNeeded = true;
    }
  }
  return { requiredElements, reviewNeeded, pending: [...new Set(pending)].slice(0, 12) };
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
export function parseCadCommandAction(text: string, siteWidth: number, siteDepth: number, inspection: CadInspection | null = null, rejection?: CadCommandRejection, maxCommands = 80, allowedOps?: ReadonlySet<CadCommand["op"]>, topologyPhase = false): CadCommandAction | null {
  if (rejection) { rejection.category = "invalid_json"; delete rejection.commandIndex; delete rejection.op; delete rejection.schemaFields; delete rejection.reasonCode; delete rejection.hostWallLengthMm; delete rejection.openingMaxOffsetMm; }
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  if (rejection) rejection.category = "invalid_top_level_schema";
  const value = parsed as Record<string, unknown>;
  const schemaIssues = cadSchemaIssues(value, maxCommands);
  if (schemaIssues.length) { if (rejection) rejection.schemaFields = schemaIssues; return null; }
  const actionCommands = value.commands as unknown[];
  const actionSummary = typeof value.summary === "string" && value.summary.trim() ? value.summary.trim() : "تم تحديث عناصر الرسم";
  const selfReview = Array.isArray(value.selfReview) ? value.selfReview as string[] : [];
  const unresolvedItems = Array.isArray(value.unresolvedItems) ? [...value.unresolvedItems as string[]] : [];
  const requirementReview = normalizeCadRequirements(value.requiredElements);
  const requiredElements = requirementReview.requiredElements;
  for (const pending of requirementReview.pending) if (!unresolvedItems.includes(pending) && unresolvedItems.length < 12) unresolvedItems.push(pending);
  const requestedDone = value.done === true;
  const maxX = siteWidth * 1000, maxY = siteDepth * 1000;
  const commands: CadCommand[] = [];
  const ids = new Set<string>();
  const inspectedObjects = inspection?.objects ?? [];
  const knownIds = new Set(inspectedObjects.map((object) => object.id).filter((id): id is string => Boolean(id)));
  const closedIds = new Set(inspectedObjects.filter((object) => object.closed || (object.wallStartMm && object.wallEndMm)).map((object) => object.id).filter((id): id is string => Boolean(id)));
  const linearIds = new Set(inspectedObjects.filter((object) => (object.wallStartMm && object.wallEndMm) || (object.lineStartMm && object.lineEndMm)).map((object) => object.id).filter((id): id is string => Boolean(id)));
  const objectById = new Map(inspectedObjects.filter((object) => object.id).map((object) => [object.id!, object]));
  const openingsByWall = new Map<string, { id: string; offset: number; width: number }[]>();
  for (const object of inspectedObjects) if (object.semantic === "opening" && object.hostWallId && typeof object.openingOffsetMm === "number" && typeof object.openingWidthMm === "number") {
    openingsByWall.set(object.hostWallId, [...(openingsByWall.get(object.hostWallId) ?? []), { id: object.id ?? "", offset: object.openingOffsetMm, width: object.openingWidthMm }]);
  }
  let hatchCount = 0;
  const walls = new Map<string, { length: number; from: [number, number]; to: [number, number] }>();
  for (const object of inspection?.objects ?? []) if (object.id && object.wallStartMm && object.wallEndMm) walls.set(object.id, { length: Math.hypot(object.wallEndMm[0] - object.wallStartMm[0], object.wallEndMm[1] - object.wallStartMm[1]), from: object.wallStartMm as [number, number], to: object.wallEndMm as [number, number] });
  if (rejection) rejection.category = "invalid_command_contract";
  for (const [commandIndex, raw] of actionCommands.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const c = raw as Record<string, unknown>;
    if (rejection) { rejection.commandIndex = commandIndex; rejection.op = typeof c.op === "string" && ["delete", "polyline", "circle", "arc", "move", "rotate", "copy", "offset", "set-layer", "hatch", "line", "wall", "beam", "opening", "room", "shaft", "dimension", "stair", "furniture", "column"].includes(c.op) ? c.op : "unknown"; }
    if (typeof c.id !== "string" || !CAD_ID.test(c.id) || ids.has(c.id)) return null;
    if (allowedOps && !allowedOps.has(c.op as CadCommand["op"])) { if (rejection) rejection.reasonCode = "topology_phase_restriction"; return null; }
    ids.add(c.id);
    if (c.op === "delete") { if (topologyPhase && !["wall", "opening", "room", "shaft", "stair"].includes(objectById.get(c.id)?.semantic ?? "")) { if (rejection) rejection.reasonCode = "topology_phase_restriction"; return null; } const deleted = objectById.get(c.id); if (deleted?.semantic === "opening" && deleted.hostWallId) openingsByWall.set(deleted.hostWallId, (openingsByWall.get(deleted.hostWallId) ?? []).filter((opening) => opening.id !== c.id)); commands.push({ op: "delete", id: c.id }); knownIds.delete(c.id); closedIds.delete(c.id); linearIds.delete(c.id); walls.delete(c.id); continue; }
    if (c.op === "polyline") {
      if (!Array.isArray(c.points) || c.points.length < 2 || c.points.length > 64 || !c.points.every(point) || typeof c.closed !== "boolean" || typeof c.layer !== "string" || !CAD_LAYERS.has(c.layer as CadLayer) || c.points.some(([x,y]) => x < 0 || x > maxX || y < 0 || y > maxY)) return null;
      if (c.closed) {
        const points = c.points as [number, number][];
        const unique = new Set(points.map(([x,y]) => `${x},${y}`));
        let twiceArea = 0;
        for (let i=0;i<points.length;i++) { const a=points[i], b=points[(i+1)%points.length]; twiceArea += a[0]*b[1]-b[0]*a[1]; }
        if (unique.size < 3 || Math.abs(twiceArea) < 2) return null;
      }
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
      if (topologyPhase && !["wall", "room", "shaft", "stair"].includes(objectById.get(c.id)?.semantic ?? "")) { if (rejection) rejection.reasonCode = "topology_phase_restriction"; return null; }
      if (!transformFitsSite(inspectedObjects, c.id, maxX, maxY, { delta: c.delta })) { if (rejection) rejection.category = "transform_outside_site"; return null; }
      commands.push({ op: "move", id: c.id, delta: c.delta }); continue;
    }
    if (c.op === "rotate") {
      if (!knownIds.has(c.id) || objectById.get(c.id)?.hostWallId || !point(c.center) || c.center[0] < 0 || c.center[0] > maxX || c.center[1] < 0 || c.center[1] > maxY || typeof c.angle !== "number" || !Number.isFinite(c.angle) || Math.abs(c.angle) > 36_000) return null;
      if (topologyPhase && !["wall", "room", "shaft", "stair"].includes(objectById.get(c.id)?.semantic ?? "")) { if (rejection) rejection.reasonCode = "topology_phase_restriction"; return null; }
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
      if (c.kind !== "DOOR" && c.kind !== "WINDOW") { if (rejection) rejection.reasonCode = "opening_invalid_kind"; return null; }
      if (typeof c.wallId !== "string" || !CAD_ID.test(c.wallId) || !wall) { if (rejection) rejection.reasonCode = "opening_host_wall_missing"; return null; }
      if (typeof c.width !== "number" || !Number.isFinite(c.width) || c.width < 400 || c.width > 4000) { if (rejection) rejection.reasonCode = "opening_invalid_width"; return null; }
      if (rejection) { rejection.hostWallLengthMm = wall.length; rejection.openingMaxOffsetMm = wall.length - c.width - 50; }
      if (typeof c.offset !== "number" || !Number.isFinite(c.offset) || c.offset < 50 || c.offset + c.width > wall.length - 50) { if (rejection) rejection.reasonCode = "opening_invalid_offset"; return null; }
      const openingOffset = c.offset as number, openingWidth = c.width as number;
      for (const [hostId, existing] of openingsByWall) openingsByWall.set(hostId, existing.filter((opening) => opening.id !== c.id));
      const hostOpenings = openingsByWall.get(c.wallId) ?? [];
      if (hostOpenings.some((opening) => openingOffset < opening.offset + opening.width - 1 && openingOffset + openingWidth > opening.offset + 1)) { if (rejection) rejection.reasonCode = "opening_overlap"; return null; }
      if (c.swingSide !== undefined && c.swingSide !== 1 && c.swingSide !== -1) { if (rejection) rejection.reasonCode = "opening_invalid_swing"; return null; }
      const dx = (wall.to[0] - wall.from[0]) / wall.length, dy = (wall.to[1] - wall.from[1]) / wall.length;
      const midpointX = wall.from[0] + (wall.to[0] - wall.from[0]) * ((c.offset + c.width / 2) / wall.length);
      const midpointY = wall.from[1] + (wall.to[1] - wall.from[1]) * ((c.offset + c.width / 2) / wall.length);
      const towardSiteCenter = (maxX / 2 - midpointX) * -dy + (maxY / 2 - midpointY) * dx;
      const defaultSwingSide: 1 | -1 = towardSiteCenter >= 0 ? 1 : -1;
      commands.push({ op: "opening", id: c.id, wallId: c.wallId, offset: openingOffset, kind: c.kind, width: openingWidth, swingSide: (c.swingSide as 1 | -1 | undefined) ?? defaultSwingSide }); hostOpenings.push({ id: c.id, offset: openingOffset, width: openingWidth }); openingsByWall.set(c.wallId, hostOpenings); knownIds.add(c.id); continue;
    }
    if (c.op === "room") {
      if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 60 || !point(c.at) || c.at[0] < 0 || c.at[0] > maxX || c.at[1] < 0 || c.at[1] > maxY) return null;
      commands.push({ op: "room", id: c.id, name: c.name.trim(), at: c.at }); knownIds.add(c.id); continue;
    }
    if (c.op === "shaft") {
      if ((c.kind !== "ventilation" && c.kind !== "service") || !point(c.at) || typeof c.width !== "number" || typeof c.depth !== "number" || !Number.isFinite(c.width) || !Number.isFinite(c.depth) || c.width < 400 || c.depth < 400 || c.width > 3000 || c.depth > 3000 || c.at[0] < 0 || c.at[1] < 0 || c.at[0]+c.width > maxX || c.at[1]+c.depth > maxY) return null;
      commands.push({ op: "shaft", id: c.id, kind: c.kind, at: c.at, width: c.width, depth: c.depth }); knownIds.add(c.id); continue;
    }
    if (c.op === "dimension") {
      if (!point(c.from) || !point(c.to) || Math.hypot(c.from[0] - c.to[0], c.from[1] - c.to[1]) < 100 || [...c.from, ...c.to].some((n, i) => n < 0 || n > (i % 2 ? maxY : maxX)) || typeof c.offset !== "number" || !Number.isFinite(c.offset) || c.offset < 100 || c.offset > 3000) return null;
      commands.push({ op: "dimension", id: c.id, from: c.from, to: c.to, offset: c.offset }); knownIds.add(c.id); continue;
    }
    if (c.op === "stair" || c.op === "furniture" || c.op === "column") {
      if (c.op === "furniture" && (typeof c.kind !== "string" || !CAD_FURNITURE_KINDS.has(c.kind.toLowerCase() as CadFurnitureKind))) { if (rejection) rejection.reasonCode = "unsupported_furniture_kind"; return null; }
      if (typeof c.kind !== "string" || !/^[\w -]{1,40}$/.test(c.kind) || !point(c.at) || typeof c.width !== "number" || typeof c.depth !== "number" || !Number.isFinite(c.width) || !Number.isFinite(c.depth) || c.width < 100 || c.depth < 100 || c.width > maxX || c.depth > maxY || (c.angle !== undefined && (typeof c.angle !== "number" || !Number.isFinite(c.angle) || Math.abs(c.angle) > 36_000))) { if (rejection && c.op === "furniture") rejection.reasonCode = "invalid_furniture_dimensions"; return null; }
      if (c.at[0] < 0 || c.at[0] + c.width > maxX || c.at[1] < 0 || c.at[1] + c.depth > maxY) { if (rejection && c.op === "furniture") rejection.reasonCode = "furniture_outside_site"; return null; }
      if (c.op === "stair") { if (c.treads !== undefined && (!Number.isInteger(c.treads) || (c.treads as number) < 3 || (c.treads as number) > 30)) return null; commands.push({ op: "stair", id: c.id, kind: c.kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0, treads: (c.treads as number | undefined) ?? 10 }); }
      else if (c.op === "furniture") {
        const kind = c.kind.toLowerCase() as CadFurnitureKind;
        if (kind.startsWith("car-") && (c.width < 1400 || c.width > 2600 || c.depth < 2800 || c.depth > 6000)) { if (rejection) rejection.reasonCode = "invalid_vehicle_scale"; return null; }
        commands.push({ op: "furniture", id: c.id, kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0 });
      }
      else commands.push({ op: "column", id: c.id, kind: c.kind, at: c.at, width: c.width, depth: c.depth, angle: (c.angle as number | undefined) ?? 0 });
      knownIds.add(c.id); continue;
    }
    return null;
  }
  const evidenceExists = requiredElements.every((item) => item.evidenceIds.every((id) => knownIds.has(id)));
  const done = requestedDone && requiredElements.length > 0 && requiredElements.every((item) => item.status === "met" && item.evidenceIds.length > 0) && unresolvedItems.length === 0 && !requirementReview.reviewNeeded && evidenceExists;
  if (requestedDone && !done && unresolvedItems.length < 12) unresolvedItems.push("Completion evidence is incomplete");
  if (rejection) { rejection.category = "valid"; delete rejection.commandIndex; delete rejection.op; }
  return { commands, summary: actionSummary.trim(), selfReview, requiredElements, unresolvedItems, done };
}

export function cadCompletionReady(action: Pick<CadCommandAction, "done" | "requiredElements" | "unresolvedItems">, inspection: Pick<CadInspection, "warnings" | "qualityIssues"> & { objects: Pick<CadInspection["objects"][number], "id" | "semantic" | "text" | "hostWallId" | "wallStartMm" | "wallEndMm" | "boundsMm">[]; objectIds?: string[]; wallBaselineReady?: boolean; wallBaselineIds?: string[]; wallCurrentIds?: string[]; wallChanges?: CadInspection["wallChanges"] }): boolean {
  const existingIds = new Set(inspection.objectIds ?? inspection.objects.map((object) => object.id).filter(Boolean));
  const byId = new Map(inspection.objects.filter((object) => object.id).map((object) => [object.id!, object]));
  const evidenceFits = (item: CadRequirementReview) => {
    if (!item.evidenceIds.every((id) => existingIds.has(id))) return false;
    const evidence = item.evidenceIds.map((id) => byId.get(id)).filter((object) => Boolean(object));
    const requirement = item.requirement.toLowerCase();
    const requiresUnchangedWalls = /(no|without|unchanged|preserv|not (?:move|delete)|لم|لا|دون|بدون|عدم)/i.test(requirement) && /(wall|walls|حائط|جدار)/i.test(requirement);
    if (requiresUnchangedWalls && (inspection.wallBaselineReady !== true || !inspection.wallChanges || inspection.wallChanges.length > 0 || !inspection.wallBaselineIds || !inspection.wallCurrentIds || inspection.wallBaselineIds.some((id) => !inspection.wallCurrentIds?.includes(id)))) return false;
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
  return action.done && action.unresolvedItems.length === 0 && action.requiredElements.length > 0 && action.requiredElements.every((item) => item.status === "met" && evidenceFits(item)) && inspection.warnings.length === 0 && (inspection.qualityIssues?.length ?? 0) === 0;
}

/** Converts validated tool commands into host-authored FreeCAD Python. Model text is never executed. */
export function compileCadCommands(action: CadCommandAction): string {
  const q = (s: string) => JSON.stringify(s);
  const lines = ["import math, json", "def _find(identifier):", "    return next((o for o in doc.Objects if getattr(o, 'CadAgentId', '') == identifier), None)", "def _rp(x,y,cx,cy,a):", "    return Vector(cx+(x-cx)*math.cos(a)-(y-cy)*math.sin(a),cy+(x-cx)*math.sin(a)+(y-cy)*math.cos(a),0)",
    "def _fpoly(points,cx,cy,a):", "    p=[_rp(x,y,cx,cy,a) for x,y in points]", "    return Part.makePolygon(p+[p[0]])", "def _frect(x,y,w,h,cx,cy,a):", "    return _fpoly([(x,y),(x+w,y),(x+w,y+h),(x,y+h)],cx,cy,a)", "def _fcircle(x,y,r,cx,cy,a):", "    return Part.makeCircle(r,_rp(x,y,cx,cy,a))", "def _fellipse(x,y,rx,ry,cx,cy,a):", "    return _fpoly([(x+rx*math.cos(i*math.pi/8),y+ry*math.sin(i*math.pi/8)) for i in range(16)],cx,cy,a)",
    "def _hatch_polygon(points, spacing, angle, edges):", "    a=math.radians(angle); dx,dy=math.cos(a),math.sin(a); nx,ny=-dy,dx", "    projections=[p.x*nx+p.y*ny for p in points]; pmin=min(projections); pmax=max(projections); span=pmax-pmin", "    if span<=1: return", "    phase=pmin+spacing/2.0", "    if phase>=pmax: phase=(pmin+pmax)/2.0", "    hi=int(math.floor((pmax-phase)/spacing))", "    if hi>500: raise RuntimeError('Hatch density exceeds the limit')", "    for k in range(hi+1):", "        t=phase+k*spacing; hits=[]", "        for i,p in enumerate(points):", "            q=points[(i+1)%len(points)]; u=p.x*nx+p.y*ny; v=q.x*nx+q.y*ny", "            if (u<=t<v) or (v<=t<u):", "                f=(t-u)/(v-u); x=p.x+f*(q.x-p.x); y=p.y+f*(q.y-p.y); hits.append((x*dx+y*dy,x,y))", "        hits.sort(key=lambda h:h[0])", "        if len(hits)%2: hits=hits[:-1]", "        for i in range(0,len(hits)-1,2):", "            h,j=hits[i],hits[i+1]", "            if math.hypot(j[1]-h[1],j[2]-h[2])>1: edges.append(Part.makeLine(Vector(h[1],h[2],0),Vector(j[1],j[2],0)))", "            if len(edges)>1200: raise RuntimeError('Hatch stroke limit exceeded')",
    "def _wall_shape(obj):", "    a=obj.CadWallStart; b=obj.CadWallEnd; dx=b.x-a.x; dy=b.y-a.y; length=math.hypot(dx,dy)", "    if length < 100: raise RuntimeError('Wall is too short')", "    ux=dx/length; uy=dy/length; nx=-uy; ny=ux; half=float(obj.CadWallThickness)/2", "    openings=sorted(json.loads(obj.CadOpenings),key=lambda o:o['offset'])", "    pieces=[]; cursor=0.0", "    for opening in openings:", "        left=float(opening['offset']); right=left+float(opening['width'])", "        if left < cursor+50 or right > length-50: raise RuntimeError('Wall openings overlap or exceed wall bounds')", "        if left-cursor >= 50: pieces.append((cursor,left))", "        cursor=right", "    if length-cursor >= 50: pieces.append((cursor,length))", "    faces=[]", "    for lo,hi in pieces:", "        x0=a.x+ux*lo; y0=a.y+uy*lo; x1=a.x+ux*hi; y1=a.y+uy*hi", "        faces.append(Part.makePolygon([Vector(x0+nx*half,y0+ny*half,0),Vector(x1+nx*half,y1+ny*half,0),Vector(x1-nx*half,y1-ny*half,0),Vector(x0-nx*half,y0-ny*half,0),Vector(x0+nx*half,y0+ny*half,0)]))", "    obj.Shape=Part.makeCompound(faces)"];
  // Rebuild walls from their stable semantic properties before applying a new
  // edit. This repairs documents saved with the former vector-aliasing path.
  lines.push("for _existing_wall in list(doc.Objects):", "    if hasattr(_existing_wall,'CadWallStart') and hasattr(_existing_wall,'CadWallEnd'):", "        _wall_shape(_existing_wall)");
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
      lines.push("for _old_hatch in list(doc.Objects):", `    if getattr(_old_hatch,'CadSemantic','') == 'hatch' and (getattr(_old_hatch,'CadAgentId','') == ${q(c.id)} or (getattr(_old_hatch,'CadHatchHost','') == ${q(c.targetId)} and getattr(_old_hatch,'CadPattern','') == ${q(c.pattern)})):`, "        doc.removeObject(_old_hatch.Name)");
      lines.push(`_target=_find(${q(c.targetId)})`, "if not _target: raise RuntimeError('Hatch boundary not found')", "_polys=[]; _target_kind='unknown'", "if hasattr(_target,'CadWallStart'):", "    _target_kind='wall'; _a=_target.CadWallStart; _b=_target.CadWallEnd; _dx=_b.x-_a.x; _dy=_b.y-_a.y; _length=math.hypot(_dx,_dy)", "    if _length<1: raise RuntimeError('Hatch wall has invalid length')", "    _ux=_dx/_length; _uy=_dy/_length; _nx=-_uy; _ny=_ux; _half=float(_target.CadWallThickness)/2", "    _openings=sorted(json.loads(_target.CadOpenings),key=lambda o:o['offset']); _cursor=0.0; _intervals=[]", "    for _opening in _openings:", "        _left=float(_opening['offset']); _right=_left+float(_opening['width'])", "        if _left>_cursor: _intervals.append((_cursor,_left))", "        _cursor=_right", "    if _cursor<_length: _intervals.append((_cursor,_length))", "    for _lo,_hi in _intervals:", "        if _hi-_lo>=50:", "            _x0=_a.x+_ux*_lo; _y0=_a.y+_uy*_lo; _x1=_a.x+_ux*_hi; _y1=_a.y+_uy*_hi", "            _polys.append([Vector(_x0+_nx*_half,_y0+_ny*_half,0),Vector(_x1+_nx*_half,_y1+_ny*_half,0),Vector(_x1-_nx*_half,_y1-_ny*_half,0),Vector(_x0-_nx*_half,_y0-_ny*_half,0)])", "elif hasattr(_target,'CadPolylinePoints') and getattr(_target,'CadPolylineClosed',False):", "    _target_kind='closed-polyline'; _polys.append([Vector(float(p[0]),float(p[1]),0) for p in json.loads(_target.CadPolylinePoints)])", "else: raise RuntimeError('Hatch supports walls and closed polylines only')", `obj=doc.addObject('Part::Feature',${q(`CAD_${c.id}`)})`, "obj.addProperty('App::PropertyString','CadAgentId')", `obj.CadAgentId=${q(c.id)}`, `obj.Label=${q(`HATCH_${c.id}`)}`, "obj.addProperty('App::PropertyString','CadSemantic'); obj.CadSemantic='hatch'", "obj.addProperty('App::PropertyString','CadHatchHost'); obj.CadHatchHost=" + q(c.targetId), "obj.addProperty('App::PropertyString','CadPattern'); obj.CadPattern=" + q(c.pattern), "obj.addProperty('App::PropertyLength','CadHatchSpacing'); obj.CadHatchSpacing=" + c.spacing, "obj.addProperty('App::PropertyFloat','CadHatchAngle'); obj.CadHatchAngle=" + c.angle, "_edges=[]", `_angles=[${c.angle}]` + (c.pattern === "diagonal" ? "" : `+[${c.angle + 90}]`), "for _poly in _polys:", "    for _angle in _angles: _hatch_polygon(_poly," + c.spacing + ",_angle,_edges)", "if not _edges:", "    _spans=[]", "    for _poly in _polys:", "        for _angle in _angles:", "            _r=math.radians(_angle); _nx=-math.sin(_r); _ny=math.cos(_r); _pr=[p.x*_nx+p.y*_ny for p in _poly]; _spans.append(round(max(_pr)-min(_pr),1) if _pr else 0)", `    raise RuntimeError('HATCH_EMPTY:target=${c.targetId};kind='+_target_kind+';polygons='+str(len(_polys))+';spans='+','.join(map(str,_spans)))`, "obj.Shape=Part.makeCompound(_edges)");
      continue;
    }
    const layer = c.op === "line" ? (c.layer ?? "WALL") : c.op === "wall" ? "WALL" : c.op === "beam" ? "BEAM" : c.op === "dimension" ? "DIMENSION" : c.op === "opening" ? c.kind : c.op === "room" ? "TEXT" : c.op === "shaft" ? "SHAFT" : c.op === "stair" ? "STAIR" : c.op === "column" ? "COLUMN" : c.op === "polyline" || c.op === "circle" || c.op === "arc" ? c.layer : "FURNITURE";
    const objName = `CAD_${c.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
    lines.push(`_target_old=_find(${q(c.id)})`, "if _target_old:", "    for _child in list(doc.Objects):", "        if getattr(_child,'CadHatchHost','') == getattr(_target_old,'CadAgentId',''):", "            doc.removeObject(_child.Name)");
    if (c.op === "opening") lines.push(`_old=_find(${q(c.id)})`, "if _old:", "    _old_host=_find(getattr(_old,'CadHostWall',''))", `    if _old_host and _old_host.CadAgentId != ${q(c.wallId)}:`, "        _old_host.CadOpenings=json.dumps([o for o in json.loads(_old_host.CadOpenings) if o['id'] != _old.CadAgentId])", "        _wall_shape(_old_host)", "    doc.removeObject(_old.Name)");
    else if (c.op === "wall") lines.push(`_old=_find(${q(c.id)})`, "_preserved=json.loads(_old.CadOpenings) if _old and hasattr(_old,'CadOpenings') else []", "if _old: doc.removeObject(_old.Name)");
    else lines.push(`_obj=_find(${q(c.id)})`, "if _obj: doc.removeObject(_obj.Name)");
    lines.push(`obj=doc.addObject('Part::Feature',${q(objName)})`, `obj.addProperty('App::PropertyString','CadAgentId')`, `obj.CadAgentId=${q(c.id)}`, `obj.Label=${q(`${layer}_${c.id}`)}`);
    const semantic = c.op === "room" ? "room" : c.op === "shaft" ? "shaft" : c.op === "stair" ? "stair" : c.op === "furniture" ? "furniture" : c.op === "opening" ? "opening" : c.op === "wall" ? "wall" : c.op;
    lines.push(`obj.addProperty('App::PropertyString','CadSemantic'); obj.CadSemantic=${q(semantic)}`);
    if ("kind" in c) lines.push(`obj.addProperty('App::PropertyString','CadKind'); obj.CadKind=${q(c.kind)}`);
    if (c.op === "line") lines.push(`obj.addProperty('App::PropertyVector','CadLineStart'); obj.CadLineStart=Vector(${c.from[0]},${c.from[1]},0)`, `obj.addProperty('App::PropertyVector','CadLineEnd'); obj.CadLineEnd=Vector(${c.to[0]},${c.to[1]},0)`, "obj.Shape=Part.makeLine(obj.CadLineStart,obj.CadLineEnd)");
    else if (c.op === "polyline") lines.push(`_pts=[${c.points.map(([x,y]) => `Vector(${x},${y},0)`).join(",")}]`, `obj.Shape=Part.makePolygon(_pts+([_pts[0]] if ${c.closed ? "True" : "False"} else []))`, `obj.addProperty('App::PropertyString','CadPolylinePoints'); obj.CadPolylinePoints=${q(JSON.stringify(c.points))}`, `obj.addProperty('App::PropertyBool','CadPolylineClosed'); obj.CadPolylineClosed=${c.closed ? "True" : "False"}`);
    else if (c.op === "circle") lines.push(`obj.Shape=Part.makeCircle(${c.radius},Vector(${c.center[0]},${c.center[1]},0))`);
    else if (c.op === "arc") lines.push(`_center=Vector(${c.center[0]},${c.center[1]},0); _r=${c.radius}`, `_a1=math.radians(${c.startAngle}); _am=math.radians(${(c.startAngle + c.endAngle) / 2}); _a2=math.radians(${c.endAngle})`, "_p1=Vector(_center.x+_r*math.cos(_a1),_center.y+_r*math.sin(_a1),0); _pm=Vector(_center.x+_r*math.cos(_am),_center.y+_r*math.sin(_am),0); _p2=Vector(_center.x+_r*math.cos(_a2),_center.y+_r*math.sin(_a2),0)", "obj.Shape=Part.Arc(_p1,_pm,_p2).toShape()");
    else if (c.op === "wall") lines.push(`obj.addProperty('App::PropertyVector','CadWallStart'); obj.CadWallStart=Vector(${c.from[0]},${c.from[1]},0)`, `obj.addProperty('App::PropertyVector','CadWallEnd'); obj.CadWallEnd=Vector(${c.to[0]},${c.to[1]},0)`, `obj.addProperty('App::PropertyLength','CadWallThickness'); obj.CadWallThickness=${c.thickness}`, "obj.addProperty('App::PropertyString','CadOpenings'); obj.CadOpenings=json.dumps(_preserved)", "_wall_shape(obj)");
    else if (c.op === "beam") lines.push(`_x1=${c.from[0]}; _y1=${c.from[1]}; _x2=${c.to[0]}; _y2=${c.to[1]}`, "_dx=_x2-_x1; _dy=_y2-_y1; _length=math.hypot(_dx,_dy); _nx=-_dy/_length*" + c.width / 2 + "; _ny=_dx/_length*" + c.width / 2, "obj.Shape=Part.makePolygon([Vector(_x1+_nx,_y1+_ny,0),Vector(_x2+_nx,_y2+_ny,0),Vector(_x2-_nx,_y2-_ny,0),Vector(_x1-_nx,_y1-_ny,0),Vector(_x1+_nx,_y1+_ny,0)])");
    else if (c.op === "dimension") lines.push(`_x1=${c.from[0]}; _y1=${c.from[1]}; _x2=${c.to[0]}; _y2=${c.to[1]}`, "_dx=_x2-_x1; _dy=_y2-_y1; _length=math.hypot(_dx,_dy); _ux=_dx/_length; _uy=_dy/_length; _nx=-_uy; _ny=_ux", "_mx=(_x1+_x2)/2; _my=(_y1+_y2)/2; _toward_x=SITE_WIDTH_MM/2-_mx; _toward_y=SITE_DEPTH_MM/2-_my", "if _toward_x*_nx+_toward_y*_ny<0: _nx=-_nx; _ny=-_ny", `_shift=${c.offset}; _ax=_x1+_nx*_shift; _ay=_y1+_ny*_shift; _bx=_x2+_nx*_shift; _by=_y2+_ny*_shift; _ox=_nx*100; _oy=_ny*100; _tx=_nx*70; _ty=_ny*70`, "obj.Shape=Part.makeCompound([Part.makeLine(Vector(_x1,_y1,0),Vector(_ax+_ox,_ay+_oy,0)),Part.makeLine(Vector(_x2,_y2,0),Vector(_bx+_ox,_by+_oy,0)),Part.makeLine(Vector(_ax,_ay,0),Vector(_bx,_by,0)),Part.makeLine(Vector(_ax-_tx,_ay-_ty,0),Vector(_ax+_tx,_ay+_ty,0)),Part.makeLine(Vector(_bx-_tx,_by-_ty,0),Vector(_bx+_tx,_by+_ty,0))])", "obj.addProperty('App::PropertyString','Text'); obj.Text=('%0.0f mm' % _length)", "obj.addProperty('App::PropertyVector','Position'); obj.Position=Vector((_ax+_bx)/2+_ox,(_ay+_by)/2+_oy,0)");
    else if (c.op === "opening") {
      lines.push(`_host=_find(${q(c.wallId)})`, "if not _host: raise RuntimeError('Opening host wall not found')", "_openings=json.loads(_host.CadOpenings)", `_openings=[o for o in _openings if o['id']!=${q(c.id)}]`, `_openings.append({'id':${q(c.id)},'offset':${c.offset},'width':${c.width},'kind':${q(c.kind)}})`, "_host.CadOpenings=json.dumps(_openings)", "_wall_shape(_host)", "for _child in list(doc.Objects):", "    if getattr(_child,'CadHatchHost','') == getattr(_host,'CadAgentId',''):", "        doc.removeObject(_child.Name)", `obj.addProperty('App::PropertyString','CadHostWall'); obj.CadHostWall=${q(c.wallId)}`, `obj.addProperty('App::PropertyLength','CadOpeningOffset'); obj.CadOpeningOffset=${c.offset}`, `obj.addProperty('App::PropertyLength','CadOpeningWidth'); obj.CadOpeningWidth=${c.width}`, `obj.addProperty('App::PropertyString','Text'); obj.Text=${q(c.kind)}`, `obj.addProperty('App::PropertyVector','Position')`, "_dx=_host.CadWallEnd.x-_host.CadWallStart.x; _dy=_host.CadWallEnd.y-_host.CadWallStart.y; _length=math.hypot(_dx,_dy)", "if _length<1: raise RuntimeError('Opening host wall has invalid length')", "_ux=_dx/_length; _uy=_dy/_length", `_p0=Vector(_host.CadWallStart.x+_ux*${c.offset},_host.CadWallStart.y+_uy*${c.offset},0); _p1=Vector(_p0.x+_ux*${c.width},_p0.y+_uy*${c.width},0)`);
      if (c.kind === "DOOR") lines.push(`_hinge=_p0; _nx=-_uy*${c.swingSide ?? 1}; _ny=_ux*${c.swingSide ?? 1}; _open=Vector(_hinge.x+_nx*${c.width},_hinge.y+_ny*${c.width},0)`, `_arc_points=[Vector(_p0.x+_ux*${c.width}*math.cos(i*math.pi/32)+_nx*${c.width}*math.sin(i*math.pi/32),_p0.y+_uy*${c.width}*math.cos(i*math.pi/32)+_ny*${c.width}*math.sin(i*math.pi/32),0) for i in range(17)]`, "obj.Shape=Part.makeCompound([Part.makeLine(_hinge,_open),Part.makePolygon(_arc_points)])");
      else lines.push(`_nx=-_uy*40; _ny=_ux*40`, "obj.Shape=Part.makeCompound([Part.makeLine(Vector(_p0.x+_nx,_p0.y+_ny,0),Vector(_p1.x+_nx,_p1.y+_ny,0)),Part.makeLine(Vector(_p0.x-_nx,_p0.y-_ny,0),Vector(_p1.x-_nx,_p1.y-_ny,0)),Part.makeLine(Vector(_p0.x+_nx,_p0.y+_ny,0),Vector(_p0.x-_nx,_p0.y-_ny,0)),Part.makeLine(Vector(_p1.x+_nx,_p1.y+_ny,0),Vector(_p1.x-_nx,_p1.y-_ny,0))])");
      lines.push("obj.Position=Vector((_p0.x+_p1.x)/2,(_p0.y+_p1.y)/2,0)");
    }
    else if (c.op === "room") lines.push(`obj.addProperty('App::PropertyString','Text'); obj.Text=${q(c.name)}`, `obj.addProperty('App::PropertyVector','Position'); obj.Position=Vector(${c.at[0]},${c.at[1]},0)`);
    else if (c.op === "shaft") lines.push(`_x=${c.at[0]}; _y=${c.at[1]}; _w=${c.width}; _h=${c.depth}`, "obj.Shape=Part.makeCompound([Part.makePolygon([Vector(_x,_y,0),Vector(_x+_w,_y,0),Vector(_x+_w,_y+_h,0),Vector(_x,_y+_h,0),Vector(_x,_y,0)]),Part.makeLine(Vector(_x,_y,0),Vector(_x+_w,_y+_h,0)),Part.makeLine(Vector(_x+_w,_y,0),Vector(_x,_y+_h,0))])", "obj.addProperty('App::PropertyString','Text'); obj.Text='VENT SHAFT' if obj.CadKind=='ventilation' else 'SERVICE SHAFT'", "obj.addProperty('App::PropertyVector','Position'); obj.Position=Vector(_x+_w/2,_y+_h/2,0)");
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
    currentDrawing: inspection ? { counts: inspection.counts, warnings: inspection.warnings, objects: inspection.objects.slice(0, 400), segments: inspection.segments } : null,
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
  constructor(readonly diagnostic: { category: string; attempt: number; finishReason: string; responseContentLength: number; commandIndex?: number; op?: string; schemaFields?: string[]; reasonCode?: CadCommandRejectionReasonCode }) {
    super("CAD model returned invalid structured drawing commands");
    this.name = "CadCommandValidationError";
  }
}

export class CadModelTimeoutError extends Error {
  constructor(readonly attempt: number) {
    super("CAD model request timed out");
    this.name = "CadModelTimeoutError";
  }
}

export function selectedConceptDrawingScope(selectedConcept: ArchitecturalConcept | undefined) {
  if (!selectedConcept) return null;
  return {
    mode: "draw_selected_concept_only" as const,
    selectedId: selectedConcept.id,
    instruction: "The user has already reviewed the concept alternatives and explicitly selected this one. Draw only this selected concept in CAD; do not generate or evaluate other alternatives and do not treat an earlier request to propose multiple concepts as a CAD drawing requirement.",
    preserve: "Keep every actual project requirement from the original user brief, including exact room counts, site dimensions, floor count, access, and other constraints. Use the structured selectedConcept as the chosen spatial direction, not as a replacement for those requirements.",
  };
}

export type CadArchitectureReview = {
  verdict: "ready" | "revise";
  summary: string;
  issues: { dimension: "program" | "room_logic" | "circulation" | "stair" | "privacy" | "daylight_ventilation" | "clearance" | "usability"; severity: "blocking" | "improvement"; objectIds: string[]; finding: string; proposedEdit: string }[];
  rubric: { dimension: string; status: "reviewed" | "unresolved"; evidenceIds: string[]; note: string }[];
};

/** A compact, bounded model context that preserves semantic geometry and stable IDs. */
export function compactCadInspection(inspection: CadInspection, limit = 100) {
  const priorityIds = new Set((inspection.qualityIssues ?? []).flatMap((issue) => issue.ids));
  const priority = (object: CadInspection["objects"][number]) => priorityIds.has(object.id ?? "") ? 0
    : ["wall", "opening", "room", "shaft", "stair", "furniture"].includes(object.semantic ?? "") ? 1 : 2;
  const ordered = [...inspection.objects].sort((a, b) => priority(a) - priority(b));
  const objects = ordered.slice(0, limit).map((object) => ({
    id: object.id,
    semantic: object.semantic,
    kind: object.kind,
    layer: object.layer,
    text: typeof object.text === "string" ? object.text.slice(0, 64) : undefined,
    boundsMm: object.boundsMm,
    positionMm: object.positionMm,
    wallStartMm: object.wallStartMm,
    wallEndMm: object.wallEndMm,
    wallThicknessMm: object.wallThicknessMm,
    wallOpenings: object.wallOpenings?.slice(0, 12),
    hostWallId: object.hostWallId,
    openingOffsetMm: object.openingOffsetMm,
    openingWidthMm: object.openingWidthMm,
    lineStartMm: object.lineStartMm,
    lineEndMm: object.lineEndMm,
    polylinePointsMm: object.polylinePointsMm?.slice(0, 16),
    closed: object.closed,
  }));
  return {
    counts: inspection.counts,
    objectCount: inspection.objects.length,
    listedObjectCount: objects.length,
    omittedObjectCount: Math.max(0, inspection.objects.length - objects.length),
    objectIds: [...new Set([
      ...priorityIds,
      ...(inspection.objectIds ?? inspection.objects.map((object) => object.id).filter((id): id is string => !!id)),
    ])].slice(0, 180),
    warnings: inspection.warnings.slice(0, 8).map((warning) => warning.slice(0, 200)),
    qualityIssues: [...(inspection.qualityIssues ?? [])].sort((a, b) => {
      const priority = (code: CadPlanQualityIssue["code"]) => ["program_count", "room_labels_missing", "duplicate_opening", "room_inaccessible", "wet_room_ventilation", "stair_fit"].includes(code) ? 0 : 1;
      return priority(a.code) - priority(b.code) || Number(b.severity === "blocking") - Number(a.severity === "blocking");
    }).slice(0, 10).map((issue) => ({ ...issue, message: issue.message.slice(0, 220) })),
    wallBaselineReady: inspection.wallBaselineReady,
    wallBaselineIds: inspection.wallBaselineIds?.slice(0, 80),
    wallCurrentIds: inspection.wallCurrentIds?.slice(0, 80),
    wallChanges: inspection.wallChanges?.slice(0, 12),
    segments: inspection.segments,
    objects,
  };
}

/** Smaller model context for CAD command writing; keeps editable topology and issue targets. */
export function compactCadCommandContext(inspection: CadInspection, topologyPhase: boolean, limit = 72) {
  const priorityIds = new Set((inspection.qualityIssues ?? []).flatMap((issue) => issue.ids));
  const topology = new Set(["wall", "opening", "room", "shaft", "stair"]);
  const selected = inspection.objects.filter((object) => topology.has(object.semantic ?? "") || priorityIds.has(object.id ?? "") || (!topologyPhase && object.semantic === "furniture"));
  const ordered = selected.sort((a, b) => Number(priorityIds.has(b.id ?? "")) - Number(priorityIds.has(a.id ?? "")) || Number(topology.has(b.semantic ?? "")) - Number(topology.has(a.semantic ?? "")));
  const objects = ordered.slice(0, limit).map((object) => ({
    id: object.id, s: object.semantic, k: object.kind, n: object.text?.slice(0, 48),
    b: object.boundsMm, p: object.positionMm, a: object.wallStartMm, z: object.wallEndMm,
    t: object.wallThicknessMm, h: object.hostWallId, o: object.openingOffsetMm, w: object.openingWidthMm,
    c: object.closed, q: object.wallOpenings?.slice(0, 8),
  }));
  const qualityIssues = [...(inspection.qualityIssues ?? [])].sort((a, b) => {
    const priority = (code: CadPlanQualityIssue["code"]) => ["program_count", "room_labels_missing", "duplicate_opening", "room_inaccessible", "wet_room_ventilation", "stair_fit"].includes(code) ? 0 : 1;
    return priority(a.code) - priority(b.code) || Number(b.severity === "blocking") - Number(a.severity === "blocking");
  }).slice(0, 8).map((issue) => ({ code: issue.code, ids: issue.ids.slice(0, 4), finding: issue.message.slice(0, 150) }));
  return {
    counts: inspection.counts, objectCount: inspection.objects.length, listedObjectCount: objects.length,
    omittedObjectCount: Math.max(0, inspection.objects.length - objects.length),
    objectIds: [...new Set([...priorityIds, ...(inspection.objectIds ?? inspection.objects.map((object) => object.id).filter((id): id is string => !!id))])].slice(0, 120),
    qualityIssues, warnings: inspection.warnings.slice(0, 3).map((warning) => warning.slice(0, 120)),
    wallBaselineIds: inspection.wallBaselineIds?.slice(0, 40), wallChanges: inspection.wallChanges?.slice(0, 8),
    segments: inspection.segments, objects,
  };
}

const CAD_REVIEW_DIMENSIONS = ["program", "room_logic", "circulation", "stair", "privacy", "daylight_ventilation", "clearance", "usability"] as const;

/** Keeps sound reviewer findings even if one optional rubric item is malformed; gaps always force revise. */
export function parseCadArchitectureReview(text: string, inspection: CadInspection): CadArchitectureReview | null {
  const parsed = extractJsonPayload(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const ids = new Set(inspection.objects.map((object) => object.id).filter((id): id is string => !!id));
  let incomplete = value.verdict !== "ready" && value.verdict !== "revise";
  const summary = typeof value.summary === "string" && value.summary.trim()
    ? value.summary.trim().slice(0, 400)
    : "The post-execution review was incomplete; another review is required.";
  if (typeof value.summary !== "string" || !value.summary.trim()) incomplete = true;
  const normalizeDimension = (raw: unknown): CadArchitectureReview["issues"][number]["dimension"] | null => {
    if (typeof raw !== "string") return null;
    const normalized = raw.trim().toLowerCase().replace(/[ -]+/g, "_");
    const aliases: Record<string, CadArchitectureReview["issues"][number]["dimension"]> = { roomlogic: "room_logic", daylightventilation: "daylight_ventilation", daylight_and_ventilation: "daylight_ventilation" };
    const dimension = aliases[normalized] ?? normalized;
    return (CAD_REVIEW_DIMENSIONS as readonly string[]).includes(dimension) ? dimension as CadArchitectureReview["issues"][number]["dimension"] : null;
  };
  const rawIssues = Array.isArray(value.issues) ? value.issues : [];
  if (!Array.isArray(value.issues) || rawIssues.length > 8) incomplete = true;
  const issues: CadArchitectureReview["issues"] = [];
  for (const raw of rawIssues.slice(0, 8)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { incomplete = true; continue; }
    const item = raw as Record<string, unknown>;
    const dimension = normalizeDimension(item.dimension);
    const severity = item.severity === "blocking" || item.severity === "improvement" ? item.severity : null;
    const finding = typeof item.finding === "string" ? item.finding.trim().slice(0, 280) : "";
    const proposedEdit = typeof item.proposedEdit === "string" ? item.proposedEdit.trim().slice(0, 280) : typeof item.edit === "string" ? item.edit.trim().slice(0, 280) : "";
    const rawIds = Array.isArray(item.objectIds) ? item.objectIds : Array.isArray(item.ids) ? item.ids : [];
    const objectIds = rawIds.filter((id): id is string => typeof id === "string" && ids.has(id)).slice(0, 8);
    if (!dimension || !severity || !finding || !proposedEdit || !Array.isArray(rawIds) || objectIds.length !== rawIds.length || rawIds.length > 8) { incomplete = true; continue; }
    issues.push({ dimension, severity, objectIds, finding, proposedEdit });
  }
  const rawRubric = Array.isArray(value.rubric) ? value.rubric : [];
  if (!Array.isArray(value.rubric) || rawRubric.length !== CAD_REVIEW_DIMENSIONS.length) incomplete = true;
  const byDimension = new Map<string, CadArchitectureReview["rubric"][number]>();
  for (const raw of rawRubric.slice(0, 16)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) { incomplete = true; continue; }
    const item = raw as Record<string, unknown>;
    const dimension = normalizeDimension(item.dimension);
    const status = item.status === "reviewed" || item.status === "unresolved" ? item.status : null;
    const note = typeof item.note === "string" ? item.note.trim().slice(0, 220) : "";
    const rawIds = Array.isArray(item.evidenceIds) ? item.evidenceIds : Array.isArray(item.ids) ? item.ids : [];
    const evidenceIds = rawIds.filter((id): id is string => typeof id === "string" && ids.has(id)).slice(0, 8);
    if (!dimension || !status || !note || !Array.isArray(rawIds) || evidenceIds.length !== rawIds.length || rawIds.length > 8 || byDimension.has(dimension)) { incomplete = true; continue; }
    const validStatus = status === "reviewed" && evidenceIds.length > 0 ? "reviewed" : "unresolved";
    if (validStatus !== status) incomplete = true;
    byDimension.set(dimension, { dimension, status: validStatus, evidenceIds: validStatus === "reviewed" ? evidenceIds : [], note });
  }
  const rubric: CadArchitectureReview["rubric"] = CAD_REVIEW_DIMENSIONS.map((dimension) => byDimension.get(dimension) ?? {
    dimension, status: "unresolved", evidenceIds: [], note: "This review dimension was missing or could not be validated; review it again.",
  });
  if (rubric.some((item) => item.status === "unresolved")) incomplete = true;
  const ready = value.verdict === "ready" && !incomplete && issues.length === 0;
  return {
    verdict: ready ? "ready" : "revise",
    summary: incomplete ? `${summary} Review is incomplete; unresolved dimensions need another review.`.slice(0, 400) : summary,
    issues, rubric,
  };
}

export async function critiqueCadPlan(input: CadInput, inspection: CadInspection, preview: string, fetchFn: typeof fetch = fetch): Promise<CadArchitectureReview | null> {
  const model = input.selectedConcept ? CONCEPT_BOARD_MODELS.text : resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const logFailure = (category: string, details: Record<string, unknown> = {}) => console.warn("[CAD_REVIEW_FAILED]", JSON.stringify({ category, ...details }));
  if (!model || !key) { logFailure("model_unavailable", { hasModel: Boolean(model), hasKey: Boolean(key) }); return null; }
  const context = compactCadInspection(inspection, 72);
  const rubric = [...CAD_REVIEW_DIMENSIONS];
  let png: Buffer;
  try { png = await sharp(Buffer.from(preview)).resize({ width: 1100, height: 900, fit: "inside" }).png().toBuffer(); }
  catch (error) { logFailure("preview_conversion_failed", { errorName: error instanceof Error ? error.name.slice(0, 40) : "unknown", previewBytes: Buffer.byteLength(preview) }); return null; }
  const payload = {
    model, temperature: 0, max_tokens: 7_000, reasoning: { effort: "medium" }, response_format: { type: "json_object" },
    messages: [
        { role: "system", content: `You are the final architectural plan reviewer for a concept the user selected. Inspect the ACTUAL post-execution preview image and complete semantic geometry metadata, not the previous design intent or the generator's pre-execution selfReview. Return only JSON: {"verdict":"ready"|"revise","summary":"...","issues":[{"dimension":"program|room_logic|circulation|stair|privacy|daylight_ventilation|clearance|usability","severity":"blocking|improvement","objectIds":["existing ID"],"finding":"...","proposedEdit":"a targeted change"}],"rubric":[{"dimension":"...","status":"reviewed|unresolved","evidenceIds":["existing ID"],"note":"..."}]}. Review each dimension: program means requested number/functions; room_logic means adjacencies/proportions; circulation means legible paths and access; stair means plausible connected placement; privacy means separation of public/private areas; daylight_ventilation means visible exterior windows or real shaft symbols; clearance means doors/windows/furniture relationships; usability means usable space without excessive fragmentation. For every reviewed dimension, cite at least one existing object ID as evidence; mark unresolved when the drawing cannot support a judgment. Keep the user's requested room counts and selected spatial concept. Look for duplicated/overcompartmentalized rooms, stairs disconnected from access, beds obstructing door swings or windows, missing exterior daylight, missing wet-room ventilation shaft/window, privacy and wasted/circulation area. Be concrete and cite inspected IDs. Do not invent code, structural, or Egyptian-regulation compliance. The room-access heuristic is not an egress certification. Mark revise for any serious program/spatial issue or unresolved rubric item; ready only if no issues remain. Limit issues to 8 and rubric to 8. Never output Python or CAD commands.` },
      { role: "user", content: [
        { type: "text", text: JSON.stringify({ brief: input.instruction, selectedConcept: input.selectedConcept ? { id: input.selectedConcept.id, strategy: input.selectedConcept.strategy, program: input.selectedConcept.program, zones: input.selectedConcept.zones } : null, reviewRubric: rubric, siteMm: inspection.siteMm, currentDrawing: context, instruction: "Review saved geometry after FreeCAD execution. Return concise findings with existing IDs; prioritize only the most important corrections." }) },
        { type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } },
      ] },
    ],
  };
  let response: Response;
  try { response = await fetchFn(OPENROUTER_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(45_000) }); }
  catch (error) { logFailure(error instanceof Error && error.name === "TimeoutError" ? "timeout" : "request_failed", { errorName: error instanceof Error ? error.name.slice(0, 40) : "unknown" }); return null; }
  if (!response.ok) { logFailure("http_error", { status: response.status }); return null; }
  let raw: string;
  try { raw = await response.text(); } catch (error) { logFailure("response_read_failed", { errorName: error instanceof Error ? error.name.slice(0, 40) : "unknown" }); return null; }
  if (raw.length > 48_000) { logFailure("response_too_large", { responseContentLength: raw.length }); return null; }
  let envelope: Record<string, unknown>; try { envelope = JSON.parse(raw) as Record<string, unknown>; } catch { logFailure("invalid_envelope_json", { responseContentLength: raw.length }); return null; }
  const choice = Array.isArray(envelope.choices) ? envelope.choices[0] as Record<string, unknown> | undefined : undefined;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 32) : "missing";
  const usage = envelope.usage && typeof envelope.usage === "object" ? envelope.usage as Record<string, unknown> : {};
  const detail = usage.completion_tokens_details && typeof usage.completion_tokens_details === "object" ? usage.completion_tokens_details as Record<string, unknown> : {};
  const count = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
  const usageSummary = { promptTokens: count(usage.prompt_tokens), completionTokens: count(usage.completion_tokens), reasoningTokens: count(detail.reasoning_tokens) };
  const message = choice?.message && typeof choice.message === "object" ? choice.message as Record<string, unknown> : {};
  const contentLength = typeof message.content === "string" ? message.content.length : 0;
  if (finishReason === "length") { logFailure("response_truncated", { finishReason, responseContentLength: contentLength, usage: usageSummary }); return null; }
  const answer = extractChatText(envelope); if (!answer) { logFailure("missing_content", { finishReason, usage: usageSummary }); return null; }
  const review = parseCadArchitectureReview(answer, inspection);
  if (!review) { logFailure("invalid_review_json", { finishReason, responseContentLength: answer.length, usage: usageSummary }); return null; }
  if (review.summary.includes("Review is incomplete")) logFailure("partial_review_normalized", { finishReason, responseContentLength: answer.length, usage: usageSummary, unresolvedDimensions: review.rubric.filter((item) => item.status === "unresolved").map((item) => item.dimension) });
  return review;
}

export async function proposeCadCommands(input: CadInput, inspection: CadInspection | null, preview: string | null, fetchFn: typeof fetch = fetch, attempt = 0): Promise<CadCommandAction> {
  const model = input.selectedConcept ? CONCEPT_BOARD_MODELS.text : resolveArchitectTextModel();
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!model || !key) throw new Error("CAD text model unavailable");
  const selectedPilot = Boolean(input.selectedConcept);
  const commandLimit = selectedPilot ? (attempt > 0 ? 3 : 5) : 80;
  const planFocus = selectedPilot ? cadPlanFocus(inspection?.qualityIssues ?? [], input.instruction, inspection) : null;
  const allowedOps = planFocus ? new Set(planFocus.allowedOps as CadCommand["op"][]) : undefined;
  const currentDrawing = inspection ? selectedPilot ? compactCadCommandContext(inspection, planFocus?.phase === "topology") : {
    counts: inspection.counts, warnings: inspection.warnings, wallBaselineReady: inspection.wallBaselineReady,
    wallBaselineIds: inspection.wallBaselineIds, wallCurrentIds: inspection.wallCurrentIds, wallBaselineCount: inspection.wallBaselineCount,
    wallCurrentCount: inspection.wallCurrentCount, wallChanges: inspection.wallChanges,
    objects: inspection.objects.slice(0, 400), objectIds: inspection.objectIds?.slice(0, 500), segments: inspection.segments,
  } : null;
  const content: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [{ type: "text", text: JSON.stringify({ userBrief: input.instruction, selectedConcept: input.selectedConcept ?? null, selectedConceptDrawingScope: selectedConceptDrawingScope(input.selectedConcept), selectedConceptBoardReference: input.selectedConcept && !inspection ? { image: "the following selected A/B/C crop is visual inspiration only; do not infer metric dimensions from pixels", conceptId: input.selectedConcept.id, strategy: input.selectedConcept.strategy } : null, siteMm: [input.siteWidth * 1000, input.siteDepth * 1000], stage: input.step + 1, maxStages: CAD_AGENT.maxSteps, commandLimit, executionError: input.executionError, architecturalFocus: planFocus, currentDrawing }) }];
  if (input.selectedConcept && input.conceptBoardDataUrl && !inspection) {
    const panel = await getSelectedPanelDataUrl(input.conceptBoardDataUrl, input.selectedConcept.id);
    if (panel) content.push({ type: "image_url", image_url: { url: panel } });
  }
  if (preview) {
    const png = await sharp(Buffer.from(preview)).resize({ width: 900, height: 900, fit: "inside" }).png().toBuffer();
    content.push({ type: "image_url", image_url: { url: `data:image/png;base64,${png.toString("base64")}` } });
  }
  const thinking = model.startsWith("anthropic/") ? { max_tokens: 3_000 } : { effort: "medium" };
  const retryIsTruncation = attempt > 0 && input.executionError?.includes("Truncated CAD reply");
  const maxTokens = selectedPilot ? 6_000 : attempt === 0 ? 10_000 : 7_000;
  const retryReasoning = model.startsWith("anthropic/") ? { max_tokens: 1_500 } : { effort: "medium" };
  const selectedReasoning = model.startsWith("anthropic/") ? { effort: "low" } : { effort: "minimal" };
  const selectedWriterPrompt = `You are Sonnet planning structured CAD edits for the selected concept. Return ONLY JSON: {"commands":[...],"summary":"short Arabic update","done":false}. Do not return code. If done=true, add requiredElements with existing evidence IDs and unresolvedItems:[]. Otherwise omit selfReview, requiredElements, and unresolvedItems. Plan from the user's complete brief, selected concept, actual saved plan preview, drawing objects, and post-execution reviewer findings. Attached concept/plan images are visual references, never metric inputs. Coordinates are millimeters in 0..siteMm; wall endpoints are centerlines and boundary walls must be inset by half thickness. Preserve stable IDs, site geometry, requested room counts, and conceptual status. Every opening host wall must exist in the inspection or earlier in this same ordered batch; choose offset >=50 mm with offset + width <= measured host-wall length - 50 mm; width is 400..4000 mm; kind is uppercase DOOR or WINDOW; swingSide is 1, -1, or omitted. If a host wall is too short, select another wall or omit the opening. If executionError is present, correct that exact validation issue first while retaining the entire command batch; never assume a rejected batch partially executed. When executionError begins POST-EXECUTION REPAIR PRIORITIES, treat its ordered, ID-grounded findings as the highest-priority task: delete a duplicate opening by ID, move or redraw a named isolated stair using its existing ID, and repair named access topology before furniture. Do not add another entry door unless the reviewer says an entry is missing. Max ${commandLimit} commands. Allowed operations: ${planFocus?.allowedOps.join(", ") ?? "all validated operations"}. Phase=${planFocus?.phase ?? "normal"}; focus=${planFocus?.blockingCodes.join(", ") || "review findings and user priorities"}. Use compact commands; no prose in command objects. Schemas: wall {op,id,from:[x,y],to:[x,y],thickness}; opening {op,id,wallId,offset,kind:DOOR|WINDOW,width,swingSide}; room {op,id,name,at:[x,y]}; shaft {op,id,kind:ventilation|service,at:[x,y],width,depth}; stair {op,id,kind,at:[x,y],width,depth,angle,treads}; furniture {op,id,kind,at:[x,y],width,depth,angle}; move {op,id,delta:[dx,dy]}; rotate {op,id,center:[x,y],angle}; delete {op,id}. Other schemas: dimension {op,id,from:[x,y],to:[x,y],offset}; hatch {op,id,targetId,pattern:diagonal|cross|tile,spacing,angle}; line {op,id,from:[x,y],to:[x,y],layer}; polyline {op,id,points:[[x,y],...],closed,layer}; circle {op,id,center:[x,y],radius,layer}; arc {op,id,center:[x,y],radius,startAngle,endAngle,layer}; beam {op,id,from:[x,y],to:[x,y],width}; column {op,id,at:[x,y],width,depth,angle}; copy {op,id,sourceId,delta:[dx,dy]}; offset {op,id,sourceId,distance}; set-layer {op,id,layer}. Furniture kind: bed, bed-single, bed-double, sofa, sofa-2-seat, sofa-3-seat, armchair, dining-table, dining-table-4, dining-table-6, desk, wardrobe, kitchen-counter, kitchen-island, refrigerator, cooker, kitchen-sink, sink, bath-vanity, toilet, bathtub, shower, chair, car-compact, car-sedan, car-suv, generic-block. Furniture symbols and shafts are schematic; do not claim code or structural compliance. Resolve architecture before cosmetics when topology blockers remain. Keep output short: at most ${attempt ? 3 : 5} concise commands and a brief summary.${attempt ? " This is the one bounded repair attempt; return a complete minimal JSON response." : ""}`;
  const usageStats = (usage: unknown) => {
    if (!usage || typeof usage !== "object") return undefined;
    const stats = usage as Record<string, unknown>;
    const details = stats.completion_tokens_details && typeof stats.completion_tokens_details === "object" ? stats.completion_tokens_details as Record<string, unknown> : {};
    const integer = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined;
    const completionTokens = integer(stats.completion_tokens);
    const reasoningTokens = integer(details.reasoning_tokens);
    return { promptTokens: integer(stats.prompt_tokens), completionTokens, reasoningTokens, visibleTokens: completionTokens !== undefined && reasoningTokens !== undefined ? Math.max(0, completionTokens - reasoningTokens) : undefined };
  };
  let response: Response;
  try {
    response = await fetchFn(OPENROUTER_ENDPOINT, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, reasoning: selectedPilot ? selectedReasoning : attempt === 0 ? thinking : retryReasoning, ...(selectedPilot ? { response_format: { type: "json_object" } } : {}), messages: [
  { role: "system", content: selectedPilot ? selectedWriterPrompt : `You are an architectural CAD operator. Return ONLY JSON with shape {"commands":[...],"summary":"brief Arabic stage report","selfReview":["specific check/result"],"requiredElements":[{"requirement":"a concrete user-brief requirement","status":"met"|"unresolved","evidenceIds":["existing-or-created-object-id"],"evidence":"what inspected geometry supports this"}],"unresolvedItems":["remaining brief or drawing issue"],"done":false}. Never return code. Requirement review is advisory during intermediate drawing: do not omit otherwise valid commands because evidence is not available yet. Mark unverified items unresolved with evidenceIds:[] and done=false; mark met only when evidence IDs exist in inspection or are created in this batch. Coordinates and sizes are millimeters in a 0..siteMm rectangle. If selectedConcept is present, it is the chosen spatial direction: respect its strategy, zone adjacencies, and circulation while producing actual CAD geometry; the selected panel image is visual reference only, not metric input. The user's requested program takes priority over decorative choices. Wall endpoints describe the wall centerline, so inset boundary walls by half their thickness to keep the finished face on the lot edge. Available commands: {"op":"wall","id":"stable-id","from":[x,y],"to":[x,y],"thickness":200}; {"op":"beam","id":"stable-id","from":[x,y],"to":[x,y],"width":250} for a conceptual 2D beam footprint only, with no structural sizing or validation; {"op":"dimension","id":"stable-id","from":[x,y],"to":[x,y],"offset":400} to draw extension lines, measured dimension line and numeric millimeter label for that exact span; dimensions are placed toward the site center automatically, but check their full bounds; {"op":"line","id":"stable-id","from":[x,y],"to":[x,y],"layer":"DIMENSION"}; {"op":"polyline","id":"stable-id","points":[[x,y],...],"closed":true,"layer":"OTHER"} for bounded primitive outlines; {"op":"opening","id":"stable-id","wallId":"existing-wall-id","offset":1200,"kind":"DOOR"|"WINDOW","width":900,"swingSide":1}. Openings cut a gap from that wall and draw a door leaf/swing arc or double-line window symbol; offset is measured from its start centerline. The default door swing points toward the site center; use swingSide 1 or -1 only when the chosen swing and its full arc remain inside the site. The host wall must exist already or be added earlier in the same batch. {"op":"hatch","id":"stable-id","targetId":"closed-polyline-or-wall-id","pattern":"diagonal"|"cross"|"tile","spacing":400,"angle":45} creates clipped, editable pattern strokes on a dedicated HATCH layer; tile is an orthogonal grid. Hatch only material zones you mean to show; spacing is bounded and hatch strokes are not associative native HATCH entities. {"op":"room","id":"stable-id","name":"Living","at":[x,y]}; {"op":"shaft","id":"stable-id","kind":"ventilation"|"service","at":[x,y],"width":900,"depth":900} draws a clearly labeled, bounded shaft footprint for vertical ventilation or services; place it beside internal bathrooms/kitchens when no direct exterior window is feasible. It is a 2D planning symbol, not proof of a code-compliant duct or stack. {"op":"stair","id":"stable-id","kind":"flight","at":[x,y],"width":1000,"depth":3000,"angle":0,"treads":12} draws a schematic single flight with treads and travel arrow. {"op":"furniture","id":"stable-id","kind":"bed|bed-single|bed-double|sofa|sofa-2-seat|sofa-3-seat|armchair|dining-table|dining-table-4|dining-table-6|desk|wardrobe|kitchen-counter|kitchen-island|refrigerator|cooker|kitchen-sink|sink|bath-vanity|toilet|bathtub|shower|chair|car-compact|car-sedan|car-suv|generic-block","at":[x,y],"width":1800,"depth":2000,"angle":0}. Cars are top-view symbols; set width to vehicle width (~1800mm) and depth to its length (~4300mm), then rotate via angle. Beds, seating, dining tables and chairs, kitchen/bath fixtures and vehicles are procedural 2D outline/detail symbols with no third-party asset pack. {"op":"column","id":"stable-id","kind":"...","at":[x,y],"width":300,"depth":300,"angle":0}. Stair, furniture, vehicle and column shapes are schematic plan symbols, not detailed objects. {"op":"delete","id":"existing-stable-id"}. Max ${commandLimit} commands${selectedPilot ? " for this focused stage" : " per stage"} and two hatch commands per stage. ${selectedPilot ? "Do not redesign the whole plan in one reply. Inspect the current preview, fix only the one or two highest-priority architectural issues with a small batch, and leave lower-priority improvements unresolved for later stages. On a critique retry, return at most 3 targeted commands and preserve stable IDs and existing walls unless the finding specifically requires changing them." : "IDs must remain stable across stages; edit by reusing the same ID; remove with delete. Work in incremental stages."} Preserve the requested program count; avoid duplicated/unnamed rooms and reserve useful circulation. Review stair location, privacy, daylight and wet-room ventilation, furniture clearance, and usable room proportions. Every complete object shape must remain inside the site. Preflight rotated extents of furniture, cars, and stairs against all four site boundaries. Before completion, review the inspection warnings and preview. Fill selfReview with at most 3 concrete checks. Mark met requirements only when existing evidence IDs support them; list open requirements concisely. Set done=true only when all requirements have evidence and no unresolved issue remains. Planning checks are heuristics, not professional or code certification.` },
    ...(input.selectedConcept ? [{ role: "system" as const, content: `The selectedConceptDrawingScope in the user payload is authoritative for scope. The concept comparison was already completed: draw only the selected ID and do not treat an earlier request for three alternatives as a CAD requirement. Preserve every actual room/program count, site, floor, access, and other project requirement from userBrief. Architectural phase=${planFocus?.phase ?? "topology"}; currently allowed operations=${planFocus?.allowedOps.join(", ") ?? "topology only"}. ${planFocus?.phase === "topology" ? `Resolve these high-priority checks before furniture or decorative edits: ${(planFocus.blockingCodes.length ? planFocus.blockingCodes : ["room_labels_missing"]).join(", ")}. The saved preview and post-execution critique are authoritative. Re-plan the smallest necessary connected topology, including walls, hosted openings, room labels, stair, and ventilation/service shafts. You may delete or move walls, openings, rooms, shafts, or stairs when required; preserve stable IDs where objects remain. Do not add, move, or delete furniture, hatch, dimensions, generic lines, or other decorative objects in this phase. Do not choose easy furniture edits while these checks remain.` : "Topology blockers have cleared in deterministic checks. Improve furniture placement and other drawing detail now, still using reviewer feedback and the saved preview."}` }] : []),
    { role: "user", content },
  ] }), signal: AbortSignal.timeout(attempt === 0 ? 90_000 : retryIsTruncation && selectedPilot ? 35_000 : 55_000) });
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) throw new CadModelTimeoutError(attempt + 1);
    throw error;
  }
  if (!response.ok) throw new Error(`CAD model request failed (${response.status})`);
  const raw = await response.text();
  if (raw.length > 100_000) throw new Error("CAD model response too large");
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("CAD model response envelope invalid"); }
  const choice = Array.isArray(payload.choices) ? payload.choices[0] as Record<string, unknown> | undefined : undefined;
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 32) : "missing";
  const answer = extractChatText(payload);
  const rejection: CadCommandRejection = { category: finishReason === "length" ? "response_truncated" : "missing_model_content" };
  const action = answer && finishReason !== "length" ? parseCadCommandAction(answer, input.siteWidth, input.siteDepth, inspection, rejection, commandLimit, allowedOps, planFocus?.phase === "topology") : null;
  if (!action) {
    const diagnostic = { category: rejection.category, attempt: attempt + 1, finishReason, responseContentLength: answer?.length ?? 0, usage: usageStats(payload.usage), commandIndex: rejection.commandIndex, op: rejection.op, schemaFields: rejection.schemaFields, reasonCode: rejection.reasonCode, hostWallLengthMm: rejection.hostWallLengthMm, openingMaxOffsetMm: rejection.openingMaxOffsetMm };
    console.warn("[CAD_MODEL_OUTPUT_REJECTED]", JSON.stringify(diagnostic));
    if (attempt === 0) {
      const fields = rejection.schemaFields?.length ? ` Invalid schema fields: ${rejection.schemaFields.join(", ")}.` : "";
      const openingGuidance = rejection.op === "opening" && rejection.reasonCode ? ({
        opening_invalid_kind: "Set opening kind exactly to DOOR or WINDOW.",
        opening_host_wall_missing: "Use an existing wall ID from current drawing or a wall created earlier in this same command list; do not guess a host ID.",
        opening_invalid_width: "Set width from 400 to 4000 mm.",
        opening_invalid_offset: rejection.hostWallLengthMm !== undefined && rejection.openingMaxOffsetMm !== undefined
          ? rejection.openingMaxOffsetMm < 50
            ? `The host wall is ${Math.round(rejection.hostWallLengthMm)} mm long, too short for this width and 50 mm end clearances. Use another existing wall, reduce width, or omit the opening.`
            : `The host wall is ${Math.round(rejection.hostWallLengthMm)} mm long. For this opening width, offset must be 50..${Math.floor(rejection.openingMaxOffsetMm)} mm from the wall start.`
          : "Offset is measured from the host wall start; keep at least 50 mm clear at both ends.",
        opening_invalid_swing: "Set swingSide to 1 or -1, or omit it.",
        opening_overlap: "This opening overlaps another opening on the same host wall. Do not add a duplicate: delete the duplicate opening ID first if it should be removed, or choose a non-overlapping offset that preserves 50 mm wall returns.",
      } as Partial<Record<CadCommandRejectionReasonCode, string>>)[rejection.reasonCode] : undefined;
      const reason = rejection.reasonCode === "topology_phase_restriction" && selectedPilot
        ? `Topology phase restriction. Return a complete JSON action using only these operations: ${(planFocus?.allowedOps ?? []).join(", ")}. Address the program, access, ventilation, and stair findings before furniture or cosmetic edits. Do not simply repeat the rejected furniture/detail action. Preserve site bounds and the required room program.`
        : finishReason === "length" && selectedPilot
        ? `Previous Sonnet reply was truncated. Return a compact complete JSON action with at most 3 commands and the same stable-ID/site constraints. Include only necessary command fields and omit self-review metadata unless claiming done.`
        : `Previous CAD reply failed validation (${rejection.category}${rejection.commandIndex !== undefined ? `, command index ${rejection.commandIndex}` : ""}${rejection.op ? `, operation ${rejection.op}` : ""}${rejection.reasonCode ? `, reason ${rejection.reasonCode}` : ""}${finishReason === "length" ? ", response was truncated" : ""}).${fields}${openingGuidance ? ` ${openingGuidance}` : ""} Return corrected complete JSON. Keep all site, geometry, ID, and schema constraints.`;
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
