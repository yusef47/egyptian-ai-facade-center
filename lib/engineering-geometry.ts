/**
 * Pure geometry model for Tool #9 — Engineering Multiview & 3D.
 *
 * The AI never draws the engineering drawing. It only READS the uploaded
 * orthographic views and returns structured JSON describing the part's solid
 * geometry (see lib/engineering-engine.ts). This module validates that JSON
 * and compiles it into an explicit CSG plan — one base block minus a list of
 * cut solids — which the browser-side Three.js CAD engine renders as precise
 * orthographic projections and a true 30-degree isometric.
 *
 * No Three.js / DOM / Node dependency lives here on purpose: the plan is plain
 * data, unit-testable, and safe to import from server and client code alike.
 *
 * COORDINATE CONVENTION (block space)
 *   x ∈ [0, width]   left  → right
 *   y ∈ [0, height]  bottom → top
 *   z ∈ [0, depth]   back  → front
 * Operations give the LEFT/BOTTOM/BACK corner of the material they remove
 * (the CENTRE for through_hole). The compiled plan is expressed in Three.js
 * space instead: the block is centred on the origin.
 */

export const ENGINEERING_OPERATION_TYPES = [
  "notch_top",
  "tunnel_bottom",
  "slot_side",
  "through_hole",
  "step",
  "chamfer",
  "incline",
] as const;

export type EngineeringOperationType = (typeof ENGINEERING_OPERATION_TYPES)[number];

/** Side/facing hint; x/y/z are accepted for hole axes. */
export type EngineeringAxis =
  | "left"
  | "right"
  | "front"
  | "back"
  | "top"
  | "bottom"
  | "x"
  | "y"
  | "z";

export type EngineeringBlock = { width: number; height: number; depth: number };

export type EngineeringOperation = {
  type: EngineeringOperationType;
  x?: number;
  y?: number;
  z?: number;
  width?: number;
  height?: number;
  depth?: number;
  diameter?: number;
  angle?: number;
  axis?: EngineeringAxis;
  atX?: number;
  /** Far end of an inclined face along X; defaults to the facing block edge. */
  endX?: number;
  fromY?: number;
  toY?: number;
};

export type EngineeringDimension = { label: string; position?: string; view?: string };

export type EngineeringGeometry = {
  block: EngineeringBlock;
  operations: EngineeringOperation[];
  dimensions: EngineeringDimension[];
  /** Short human label for the deduced part, when the analyzer provides one. */
  label?: string;
  /**
   * True when the drawing did not yield real block dimensions and the default
   * extents were substituted — the UI must say so rather than passing them off
   * as measured.
   */
  estimated?: boolean;
};

/** A single subtractive solid in the compiled plan (Three.js space). */
export type EngineeringCut =
  | {
      kind: "box";
      label: EngineeringOperationType;
      center: [number, number, number];
      size: [number, number, number];
      /** Rotation about the Z axis, in radians (inclines / chamfers). */
      rotationZ?: number;
    }
  | {
      kind: "cylinder";
      label: EngineeringOperationType;
      center: [number, number, number];
      radius: number;
      /** Length along the hole axis. */
      length: number;
      axis: "x" | "y" | "z";
    };

export type EngineeringSolidPlan = {
  block: EngineeringBlock;
  cuts: EngineeringCut[];
  dimensions: EngineeringDimension[];
  label?: string;
};

export const MAX_OPERATIONS = 24;
export const MAX_DIMENSIONS = 12;
const MAX_BLOCK_EXTENT = 5_000;
const MIN_BLOCK_EXTENT = 0.01;

/**
 * Safe fallback extents. When the analyzer returns a geometry object whose
 * block dimensions are missing or null we still render the part with these
 * extents (and flag the geometry as `estimated`) so a partially-readable
 * drawing degrades into "check the numbers" instead of a hard failure.
 */
export const DEFAULT_ENGINEERING_BLOCK: EngineeringBlock = { width: 64, height: 50, depth: 40 };

/** The four panels of the CAD board, in reading order. */
export const ENGINEERING_VIEWS = ["front", "side", "top", "isometric"] as const;
export type EngineeringView = (typeof ENGINEERING_VIEWS)[number];

export const ENGINEERING_VIEW_LABELS: Record<EngineeringView, { en: string; ar: string }> = {
  front: { en: "FRONT ELEVATION", ar: "المسقط الرأسي" },
  side: { en: "SIDE VIEW", ar: "المسقط الجانبي" },
  top: { en: "TOP PLAN", ar: "المسقط الأفقي" },
  isometric: { en: "ISOMETRIC PROJECTION", ar: "المنظور ثلاثي الأبعاد" },
};

const OPERATION_ALIASES: Record<string, EngineeringOperationType> = {
  notch_top: "notch_top",
  top_notch: "notch_top",
  notch: "notch_top",
  top_slot: "notch_top",
  u_notch: "notch_top",
  u_slot: "notch_top",
  tunnel_bottom: "tunnel_bottom",
  bottom_tunnel: "tunnel_bottom",
  tunnel: "tunnel_bottom",
  channel: "tunnel_bottom",
  channel_bottom: "tunnel_bottom",
  bottom_channel: "tunnel_bottom",
  bottom_slot: "tunnel_bottom",
  slot_side: "slot_side",
  side_slot: "slot_side",
  slot: "slot_side",
  side_cut: "slot_side",
  through_hole: "through_hole",
  hole: "through_hole",
  hole_through: "through_hole",
  bore: "through_hole",
  drilled_hole: "through_hole",
  step: "step",
  step_down: "step",
  shoulder: "step",
  rebate: "step",
  chamfer: "chamfer",
  bevel: "chamfer",
  corner_cut: "chamfer",
  incline: "incline",
  inclined: "incline",
  incline_cut: "incline",
  slope: "incline",
  sloped: "incline",
  angular_cut: "incline",
};

const AXIS_VALUES: EngineeringAxis[] = [
  "left",
  "right",
  "front",
  "back",
  "top",
  "bottom",
  "x",
  "y",
  "z",
];

function finiteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[\s_-]+/g, "");
}

/** Flat, case/underscore-insensitive view of a JSON object for tolerant lookup. */
function flattenRecord(record: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    const normalized = normalizeKey(key);
    if (!(normalized in flat)) flat[normalized] = value;
  }
  return flat;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = finiteNumber(record[normalizeKey(key)]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function clampExtent(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return min;
  return Math.min(Math.max(value, min), max);
}

function clampValue(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeBlock(raw: unknown): EngineeringBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const record = flattenRecord(raw as Record<string, unknown>);
  const widthRaw = firstNumber(record, ["width", "w", "length", "x"]);
  const heightRaw = firstNumber(record, ["height", "h", "y", "tall"]);
  const depthRaw = firstNumber(record, ["depth", "d", "z", "thickness"]);
  if (widthRaw === undefined && heightRaw === undefined && depthRaw === undefined) return null;

  const width = clampExtent(widthRaw ?? 60, MIN_BLOCK_EXTENT, MAX_BLOCK_EXTENT);
  const height = clampExtent(heightRaw ?? Math.min(width, 60), MIN_BLOCK_EXTENT, MAX_BLOCK_EXTENT);
  const depth = clampExtent(
    depthRaw ?? Math.min(width, height),
    MIN_BLOCK_EXTENT,
    MAX_BLOCK_EXTENT,
  );
  return { width, height, depth };
}

function normalizeOperation(raw: unknown): EngineeringOperation | null {
  if (!raw || typeof raw !== "object") return null;
  const record = flattenRecord(raw as Record<string, unknown>);
  const rawType = typeof record.type === "string" ? record.type : "";
  const key = rawType.trim().toLowerCase().replace(/[\s-]+/g, "_");
  // Accepts both the canonical names and the `cut_top_notch` style the drawing
  // vocabulary frequently uses.
  const type =
    OPERATION_ALIASES[key] ?? OPERATION_ALIASES[key.replace(/^(cut|remove|subtract)_/, "")];
  if (!type) return null;

  const rawAxis = typeof record.axis === "string" ? record.axis.trim().toLowerCase() : "";
  const axis = (AXIS_VALUES as string[]).includes(rawAxis)
    ? (rawAxis as EngineeringAxis)
    : undefined;

  const operation: EngineeringOperation = { type };
  const x = firstNumber(record, ["x"]);
  const y = firstNumber(record, ["y"]);
  const z = firstNumber(record, ["z"]);
  const width = firstNumber(record, ["width", "w"]);
  const height = firstNumber(record, ["height", "h"]);
  const depth = firstNumber(record, ["depth", "d"]);
  const diameter = firstNumber(record, ["diameter", "dia"]);
  const angle = firstNumber(record, ["angle", "degrees", "deg"]);
  const atX = firstNumber(record, ["atx", "startx", "planex"]);
  const endX = firstNumber(record, ["endx", "stopx", "planendx"]);
  const fromY = firstNumber(record, ["fromy", "starty", "highy"]);
  const toY = firstNumber(record, ["toy", "endy", "lowy"]);

  if (x !== undefined) operation.x = x;
  if (y !== undefined) operation.y = y;
  if (z !== undefined) operation.z = z;
  if (width !== undefined) operation.width = width;
  if (height !== undefined) operation.height = height;
  if (depth !== undefined) operation.depth = depth;
  if (diameter !== undefined) operation.diameter = diameter;
  if (angle !== undefined) operation.angle = angle;
  if (axis !== undefined) operation.axis = axis;
  if (atX !== undefined) operation.atX = atX;
  if (endX !== undefined) operation.endX = endX;
  if (fromY !== undefined) operation.fromY = fromY;
  if (toY !== undefined) operation.toY = toY;
  return operation;
}

/**
 * Lenient normalisation of the analyzer's JSON. Unknown operation types are
 * dropped, numbers are clamped into the block, and a missing bounding block
 * fails the whole parse (nothing can be rendered without it).
 */
export function normalizeEngineeringGeometry(raw: unknown): EngineeringGeometry | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const rawOperations = Array.isArray(record.operations)
    ? record.operations
    : Array.isArray(record.cuts)
      ? record.cuts
      : [];
  const rawDimensions = Array.isArray(record.dimensions) ? record.dimensions : [];

  // Block dimensions missing/null is recoverable: fall back to the default
  // extents and mark the result as estimated. A payload carrying NO geometry
  // signal at all is not recoverable — that is a failed reading, not a part.
  let estimated = false;
  let block = normalizeBlock(record.block ?? record.base ?? record.primitive);
  if (!block) {
    const hasSignal =
      [record.block, record.base, record.primitive].some(
        (candidate) => candidate !== undefined && candidate !== null,
      ) ||
      rawOperations.length > 0 ||
      rawDimensions.length > 0;
    if (!hasSignal) return null;
    block = { ...DEFAULT_ENGINEERING_BLOCK };
    estimated = true;
  }
  const operations: EngineeringOperation[] = [];
  for (const candidate of rawOperations) {
    if (operations.length >= MAX_OPERATIONS) break;
    const operation = normalizeOperation(candidate);
    if (operation) operations.push(operation);
  }

  const dimensions: EngineeringDimension[] = [];
  for (const candidate of rawDimensions) {
    if (dimensions.length >= MAX_DIMENSIONS) break;
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const rawLabel = entry.label ?? entry.value ?? entry.text;
    if (typeof rawLabel !== "string" && typeof rawLabel !== "number") continue;
    const label = String(rawLabel).trim().slice(0, 24);
    if (!label) continue;
    const dimension: EngineeringDimension = { label };
    if (typeof entry.position === "string") dimension.position = entry.position.slice(0, 24);
    if (typeof entry.view === "string") dimension.view = entry.view.trim().toLowerCase().slice(0, 16);
    dimensions.push(dimension);
  }

  const geometry: EngineeringGeometry = { block, operations, dimensions };
  if (estimated) geometry.estimated = true;
  const rawLabel = record.label ?? record.name ?? record.part;
  if (typeof rawLabel === "string" && rawLabel.trim()) {
    geometry.label = rawLabel.trim().slice(0, 120);
  }
  return geometry;
}

/** Overall width/height/depth as drawable dimension chips. */
export function defaultEngineeringDimensions(block: EngineeringBlock): EngineeringDimension[] {
  const format = (value: number) => String(Math.round(value * 100) / 100);
  return [
    { label: format(block.width), position: "bottom", view: "front" },
    { label: format(block.height), position: "left", view: "front" },
    { label: format(block.depth), position: "bottom", view: "top" },
  ];
}

/** True when the analyzer returned a usable block worth rendering. */
export function isRenderableGeometry(geometry: EngineeringGeometry | null): boolean {
  if (!geometry) return false;
  const { width, height, depth } = geometry.block;
  return width > 0 && height > 0 && depth > 0;
}

type BlockDims = {
  W: number;
  H: number;
  D: number;
  /** Distance past a touched face by which cuts are over-extended. */
  slack: number;
  /** How close to a face counts as "touching" it. */
  tol: number;
  /** Smallest cut extent CSG can resolve cleanly. */
  minExtent: number;
};

/** Extends an interval past any block face it coincides with (avoids coplanar CSG faces). */
function extendToBounds(
  interval: [number, number],
  lo: number,
  hi: number,
  dims: BlockDims,
): [number, number] {
  let [min, max] = interval;
  if (min - lo <= dims.tol) min = lo - dims.slack;
  if (hi - max <= dims.tol) max = hi + dims.slack;
  return [min, max];
}

function boxCut(
  label: EngineeringOperationType,
  ranges: { x: [number, number]; y: [number, number]; z: [number, number] },
  dims: BlockDims,
): EngineeringCut | null {
  const x = extendToBounds(ranges.x, 0, dims.W, dims);
  const y = extendToBounds(ranges.y, 0, dims.H, dims);
  const z = extendToBounds(ranges.z, 0, dims.D, dims);
  const size: [number, number, number] = [x[1] - x[0], y[1] - y[0], z[1] - z[0]];
  if (size.some((value) => !Number.isFinite(value) || value < dims.minExtent)) return null;
  return {
    kind: "box",
    label,
    center: [
      (x[0] + x[1]) / 2 - dims.W / 2,
      (y[0] + y[1]) / 2 - dims.H / 2,
      (z[0] + z[1]) / 2 - dims.D / 2,
    ],
    size,
  };
}

/** Depth range along Z: through (over-extended) unless an explicit pocket is given. */
function depthInterval(
  op: EngineeringOperation,
  dims: BlockDims,
): [number, number] {
  const through = op.depth === undefined || op.depth >= dims.D - dims.tol;
  if (through) return [0, dims.D];
  const depth = clampExtent(op.depth as number, dims.minExtent, dims.D);
  const z0 = clampValue(op.z ?? (dims.D - depth) / 2, 0, dims.D - depth);
  return [z0, z0 + depth];
}

/** Rotated half-space cut: removes everything above the plane through p1→p2. */
function planeCut(
  label: EngineeringOperationType,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  dims: BlockDims,
): EngineeringCut | null {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy);
  // Degenerate planes carry no geometry: a zero-length segment, a vertical cut
  // (that is a step, not a slope) and a flat one (that is a horizontal cut)
  // are all dropped rather than turned into an arbitrary volume.
  if (length < dims.minExtent || Math.abs(dy) < dims.tol || Math.abs(dx) < dims.tol) return null;
  const angle = Math.atan2(dy, dx);
  // Local +Y of the cutter is the plane normal, so the removed volume sits above it.
  const normalX = -Math.sin(angle);
  const normalY = Math.cos(angle);
  const thickness = Math.max(dims.W, dims.H, dims.D) * 4;
  const cx = (p1.x + p2.x) / 2 + normalX * (thickness / 2);
  const cy = (p1.y + p2.y) / 2 + normalY * (thickness / 2);
  return {
    kind: "box",
    label,
    center: [cx - dims.W / 2, cy - dims.H / 2, 0],
    size: [length * 4 + thickness, thickness, dims.D + dims.slack * 2],
    rotationZ: angle,
  };
}

function buildCut(op: EngineeringOperation, dims: BlockDims): EngineeringCut | null {
  const { W, H, D } = dims;
  switch (op.type) {
    case "notch_top":
    case "step": {
      // Material removed downward from the top face (a `step` may pin its
      // bottom edge explicitly with `y`).
      const width = clampExtent(op.width ?? W / 3, dims.minExtent, W);
      const x0 = clampValue(op.x ?? (W - width) / 2, 0, W - width);
      const height = clampExtent(op.height ?? H / 3, dims.minExtent, H);
      const y0 = clampValue(op.y ?? H - height, 0, H - dims.minExtent);
      return boxCut(op.type, { x: [x0, x0 + width], y: [y0, H], z: depthInterval(op, dims) }, dims);
    }
    case "tunnel_bottom": {
      // Clearance tunnel/channel cut upward from the bottom face.
      const width = clampExtent(op.width ?? W / 3, dims.minExtent, W);
      const x0 = clampValue(op.x ?? (W - width) / 2, 0, W - width);
      const height = clampExtent(op.height ?? H / 3, dims.minExtent, H);
      const y1 = clampValue(op.y ?? height, dims.minExtent, H);
      return boxCut(op.type, { x: [x0, x0 + width], y: [0, y1], z: depthInterval(op, dims) }, dims);
    }
    case "slot_side": {
      const axis = op.axis ?? "left";
      const height = clampExtent(op.height ?? H * 0.6, dims.minExtent, H);
      const y0 = clampValue(op.y ?? (H - height) / 2, 0, H - height);
      if (axis === "front" || axis === "back") {
        const span = clampExtent(op.width ?? W / 3, dims.minExtent, W);
        const x0 = clampValue(op.x ?? (W - span) / 2, 0, W - span);
        const penetration = clampExtent(op.depth ?? D / 3, dims.minExtent, D);
        const z: [number, number] =
          axis === "front" ? [D - penetration, D] : [0, penetration];
        return boxCut(op.type, { x: [x0, x0 + span], y: [y0, y0 + height], z }, dims);
      }
      const penetration = clampExtent(op.depth ?? op.width ?? W / 3, dims.minExtent, W);
      const x: [number, number] = axis === "right" ? [W - penetration, W] : [0, penetration];
      return boxCut(op.type, { x, y: [y0, y0 + height], z: depthInterval(op, dims) }, dims);
    }
    case "through_hole": {
      const maxDim = Math.max(W, H, D);
      const diameter = clampExtent(
        op.diameter ?? op.width ?? op.height ?? Math.min(W, H) * 0.25,
        dims.minExtent,
        maxDim,
      );
      const axis: "x" | "y" | "z" =
        op.axis === "x" || op.axis === "left" || op.axis === "right"
          ? "x"
          : op.axis === "y" || op.axis === "top" || op.axis === "bottom"
            ? "y"
            : "z";
      const span = axis === "x" ? W : axis === "y" ? H : D;
      const center: [number, number, number] = [
        clampValue(op.x ?? W / 2, 0, W) - W / 2,
        clampValue(op.y ?? H / 2, 0, H) - H / 2,
        clampValue(op.z ?? D / 2, 0, D) - D / 2,
      ];
      return {
        kind: "cylinder",
        label: op.type,
        center,
        radius: Math.max(diameter / 2, dims.minExtent / 2),
        length: span + dims.slack * 2,
        axis,
      };
    }
    case "incline": {
      const axis = op.axis === "right" ? "right" : "left";
      const atX = clampValue(op.atX ?? (axis === "right" ? W : 0), 0, W);
      const fromY = clampValue(op.fromY ?? H, 0, H);
      const toY = clampValue(op.toY ?? 0, 0, H);
      // The slope runs from (atX, fromY) to (endX, toY); `endX` may be given
      // explicitly, otherwise it falls to the edge the slope faces.
      const endX = clampValue(op.endX ?? (axis === "right" ? 0 : W), 0, W);
      return planeCut(op.type, { x: atX, y: fromY }, { x: endX, y: toY }, dims);
    }
    case "chamfer": {
      const size = clampExtent(
        op.width ?? op.depth ?? Math.min(W, H) * 0.15,
        dims.minExtent,
        Math.min(W, H) * 0.9,
      );
      const axis = op.axis === "right" ? "right" : "left";
      const p1 = axis === "right" ? { x: W, y: H - size } : { x: 0, y: H - size };
      const p2 = axis === "right" ? { x: W - size, y: H } : { x: size, y: H };
      return planeCut(op.type, p1, p2, dims);
    }
    default:
      return null;
  }
}

/**
 * Compiles normalised geometry into the CSG plan the CAD viewer consumes:
 * a solid base block minus every cut solid, in Three.js coordinates.
 */
export function buildEngineeringSolidPlan(geometry: EngineeringGeometry): EngineeringSolidPlan {
  const { width: W, height: H, depth: D } = geometry.block;
  const maxDim = Math.max(W, H, D);
  const dims: BlockDims = {
    W,
    H,
    D,
    slack: maxDim,
    tol: maxDim * 0.005,
    minExtent: maxDim * 0.005,
  };

  const cuts: EngineeringCut[] = [];
  for (const op of geometry.operations) {
    const cut = buildCut(op, dims);
    if (cut) cuts.push(cut);
  }

  return {
    block: geometry.block,
    cuts,
    dimensions:
      geometry.dimensions.length > 0
        ? geometry.dimensions
        : defaultEngineeringDimensions(geometry.block),
    label: geometry.label,
  };
}
