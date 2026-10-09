import type { Point2, ProjectGeometry, Space, Wall } from "./geometry";
import { GEOMETRY_MODEL_VERSION } from "./geometry";
import { validateGeometry } from "./validate";

/**
 * Deterministic concept layout generation for a rectangular site.
 *
 * SCOPE — this produces CONCEPT BLOCKS only: two residential planning cells
 * plus one shared access core, with junction-split walls, reciprocal
 * references, and doors connecting each unit to the core. It does NOT model
 * detailed rooms, structure, MEP, Egyptian building-code compliance, or a
 * construction-ready plan. All areas it reports are nominal planning areas
 * (see the area contract in geometry.ts).
 *
 * The layout is DERIVED from the brief (site origin, dimensions, core side,
 * unit area split) — not a scaled or mirrored copy of any fixture. Every
 * option is validated with validateGeometry() before it is returned; if an
 * option would be invalid, the generator returns a structured error instead
 * of fabricated geometry.
 */

/** Only this program shape is supported by the current slice. */
export type LayoutProgram = {
  /** Number of residential units. Only 2 is supported. */
  units: number;
  /** Access core arrangement. Only "shared" (one core for both units). */
  core: "shared";
};

export type CoreSide = "east" | "west";

export type LayoutBrief = {
  program: LayoutProgram;
  /** Lower-left corner of the rectangular site in meters. Default (0,0). */
  origin?: Point2;
  /** Site width along X, meters. */
  width: number;
  /** Site depth along Y, meters. */
  depth: number;
  /** Preferred side of the shared access core. */
  coreSide: CoreSide;
  /** Target share of the combined unit area assigned to Unit B, in (0,1). */
  unitSplit: number;
  /**
   * Stable ID prefix for all generated elements. Default "concept".
   * Safe identifier contract (validated at runtime): 1-64 characters,
   * ASCII letter first, then ASCII letters, digits, "_" or "-". Empty,
   * whitespace, quotes, angle brackets, and other unsafe values are
   * rejected with an INVALID_ID_PREFIX error.
   */
  idPrefix?: string;
};

export type LayoutErrorCode =
  | "INVALID_BRIEF"
  | "UNSUPPORTED_PROGRAM"
  | "INVALID_ID_PREFIX"
  | "INVALID_SITE_DIMENSIONS"
  | "INVALID_ORIGIN"
  | "SPLIT_OUT_OF_RANGE"
  | "SITE_TOO_SMALL"
  | "SPLIT_INFEASIBLE"
  | "NUMERICAL_OVERFLOW"
  | "GENERATED_OPTION_INVALID";

export type LayoutError = {
  code: LayoutErrorCode;
  message: string;
};

export type LayoutOption = {
  /** Stable unique option ID; element IDs are prefixed with it. */
  id: string;
  coreSide: CoreSide;
  /** Short explanation of this option's tradeoff. */
  summary: string;
  geometry: ProjectGeometry;
};

export type LayoutResult =
  | { ok: true; options: LayoutOption[] }
  | { ok: false; errors: LayoutError[] };

/** Core strip width along X, meters (concept constant). */
const CORE_WIDTH = 3;
/** Minimum unit width along X, meters. */
const MIN_UNIT_WIDTH = 3;
/** Minimum unit depth along Y, meters. */
const MIN_UNIT_DEPTH = 2.5;
/** Minimum core depth along Y, meters (stair needs headroom). */
const MIN_CORE_DEPTH = 2.5;
const DOOR_WIDTH = 1;

/**
 * Safe identifier contract for idPrefix (defense in depth before IDs reach
 * SVG attributes): 1-64 chars, ASCII letter first, then letters/digits/_/-.
 */
const ID_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Runtime guard so nested reads happen only on plain objects. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Stringifies an untrusted value for error messages without ever throwing
 * (template literals throw on symbols; JSON.stringify throws on cycles).
 */
function describeValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value.length > 40 ? `${value.slice(0, 40)}…` : value);
  }
  if (value === null || value === undefined) return String(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") return "function";
  try {
    const json = JSON.stringify(value);
    if (json === undefined) return "object";
    return json.length > 60 ? `${json.slice(0, 60)}…` : json;
  } catch {
    return "object";
  }
}

/** Narrows an untrusted value to a finite number or NaN. */
function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Solves for the Unit-B depth `s` such that Unit B's nominal area equals
 * `share` of the combined unit area:
 *   Unit A = (W - cw) * (D - s),  Unit B = W * s
 *   W*s = share * [(W - cw)*(D - s) + W*s]
 *   => s = share*(W - cw)*D / [W*(1 - share) + share*(W - cw)]
 */
function solveUnitBDepth(width: number, depth: number, share: number, coreWidth: number): number {
  return (share * (width - coreWidth) * depth)
    / (width * (1 - share) + share * (width - coreWidth));
}

/**
 * Builds ONE concept option directly from the brief's coordinates.
 * Geometry is computed for the requested core side; nothing is scaled from a
 * fixture.
 *
 * Topology (core east shown; west mirrors the sides, never the fixture):
 *
 *   y=D ┌──────────────┬──────┐
 *       │              │ CORE │   Unit A: x in [0, W-cw], y in [s, D]
 *       │   Unit A     │      │   Core:   x in [W-cw, W], y in [s, D]
 *  y=s  ├──────────────┼──────┤   Unit B: full width, y in [0, s]
 *       │         Unit B      │   Doors: A->core (vertical inner wall),
 *  y=0  └─────────────────────┘         B->core (mid-core), entry (north-core)
 */
function buildOption(brief: LayoutBrief, coreSide: CoreSide, optionId: string): LayoutOption {
  const origin = brief.origin ?? { x: 0, y: 0 };
  const width = brief.width;
  const depth = brief.depth;
  const coreWidth = CORE_WIDTH;
  const east = coreSide === "east";
  const unitBDepth = solveUnitBDepth(width, depth, brief.unitSplit, coreWidth);
  const coreX0 = east ? width - coreWidth : 0;
  const coreX1 = coreX0 + coreWidth;
  const innerCoreX = east ? coreX0 : coreX1;
  const unitAX0 = east ? 0 : coreWidth;
  const unitAX1 = east ? width - coreWidth : width;

  const x = (local: number): number => origin.x + local;
  const y = (local: number): number => origin.y + local;
  const point = (localX: number, localY: number): Point2 => ({ x: x(localX), y: y(localY) });

  const p = optionId;
  const ids = {
    site: `${p}-site`,
    floor: `${p}-floor`,
    unitA: `${p}-space-unit-a`,
    unitB: `${p}-space-unit-b`,
    core: `${p}-space-core`,
    south: `${p}-wall-south`,
    westLower: `${p}-wall-west-lower`,
    westUpper: `${p}-wall-west-upper`,
    eastLower: `${p}-wall-east-lower`,
    eastUpper: `${p}-wall-east-upper`,
    midLeft: `${p}-wall-mid-left`,
    midCore: `${p}-wall-mid-core`,
    midRight: `${p}-wall-mid-right`,
    northLeft: `${p}-wall-north-left`,
    northCore: `${p}-wall-north-core`,
    northRight: `${p}-wall-north-right`,
    coreInner: `${p}-wall-core-inner`,
    doorA: `${p}-door-unit-a`,
    doorB: `${p}-door-unit-b`,
    entry: `${p}-door-entry`,
  };

  const epsilon = 1e-9;
  const walls: Wall[] = [
    // Site perimeter, split at the mid junction y = s.
    { id: ids.south, start: point(0, 0), end: point(width, 0), thickness: 0.25, sharedWith: [ids.unitB] },
    { id: ids.westLower, start: point(0, 0), end: point(0, unitBDepth), thickness: 0.25, sharedWith: [ids.unitB] },
    { id: ids.westUpper, start: point(0, unitBDepth), end: point(0, depth), thickness: 0.25, sharedWith: [east ? ids.unitA : ids.core] },
    { id: ids.eastLower, start: point(width, 0), end: point(width, unitBDepth), thickness: 0.25, sharedWith: [ids.unitB] },
    { id: ids.eastUpper, start: point(width, unitBDepth), end: point(width, depth), thickness: 0.25, sharedWith: [east ? ids.core : ids.unitA] },
    // Mid wall y = s, split at the core junction x = coreX0 / coreX1.
    ...(coreX0 > epsilon
      ? [
          { id: ids.midLeft, start: point(0, unitBDepth), end: point(coreX0, unitBDepth), thickness: 0.2, sharedWith: [ids.unitB, ids.unitA] },
          { id: ids.northLeft, start: point(0, depth), end: point(coreX0, depth), thickness: 0.25, sharedWith: [ids.unitA] },
        ]
      : []),
    { id: ids.midCore, start: point(coreX0, unitBDepth), end: point(coreX1, unitBDepth), thickness: 0.2, sharedWith: [ids.unitB, ids.core] },
    { id: ids.northCore, start: point(coreX0, depth), end: point(coreX1, depth), thickness: 0.25, sharedWith: [ids.core] },
    ...(coreX1 < width - epsilon
      ? [
          { id: ids.midRight, start: point(coreX1, unitBDepth), end: point(width, unitBDepth), thickness: 0.2, sharedWith: [ids.unitB, ids.unitA] },
          { id: ids.northRight, start: point(coreX1, depth), end: point(width, depth), thickness: 0.25, sharedWith: [ids.unitA] },
        ]
      : []),
    // Vertical wall separating Unit A and the core (inner core edge).
    { id: ids.coreInner, start: point(innerCoreX, unitBDepth), end: point(innerCoreX, depth), thickness: 0.2, sharedWith: [ids.unitA, ids.core] },
  ];

  const midLeftWalls = coreX0 > epsilon ? [ids.midLeft] : [];
  const midRightWalls = coreX1 < width - epsilon ? [ids.midRight] : [];

  const spaces: Space[] = [
    {
      id: ids.unitA,
      name: "Unit A — concept cell",
      wallIds: [
        east ? ids.westUpper : ids.eastUpper,
        east ? ids.midLeft : ids.midRight,
        east ? ids.northLeft : ids.northRight,
        ids.coreInner,
      ],
      polygon: {
        points: [
          point(unitAX0, unitBDepth),
          point(unitAX1, unitBDepth),
          point(unitAX1, depth),
          point(unitAX0, depth),
        ],
      },
    },
    {
      id: ids.unitB,
      name: "Unit B — concept cell",
      wallIds: [
        ids.south,
        ids.westLower,
        ids.eastLower,
        ids.midCore,
        ...midLeftWalls,
        ...midRightWalls,
      ],
      polygon: {
        points: [
          point(0, 0),
          point(width, 0),
          point(width, unitBDepth),
          point(0, unitBDepth),
        ],
      },
    },
    {
      id: ids.core,
      name: "Shared access core",
      wallIds: [
        ids.northCore,
        ids.midCore,
        ids.coreInner,
        east ? ids.eastUpper : ids.westUpper,
      ],
      polygon: {
        points: [
          point(coreX0, unitBDepth),
          point(coreX1, unitBDepth),
          point(coreX1, depth),
          point(coreX0, depth),
        ],
      },
    },
  ];

  // Doors: each unit to the core, plus the exterior entrance through the core.
  const coreInnerLength = depth - unitBDepth;
  const openings = [
    { id: ids.doorA, kind: "door" as const, wallId: ids.coreInner, offset: coreInnerLength / 2 - DOOR_WIDTH / 2, width: DOOR_WIDTH },
    { id: ids.doorB, kind: "door" as const, wallId: ids.midCore, offset: (coreWidth - DOOR_WIDTH) / 2, width: DOOR_WIDTH },
    { id: ids.entry, kind: "door" as const, wallId: ids.northCore, offset: (coreWidth - DOOR_WIDTH) / 2, width: DOOR_WIDTH },
  ];

  const geometry: ProjectGeometry = {
    schemaVersion: GEOMETRY_MODEL_VERSION,
    units: "meters",
    site: {
      id: ids.site,
      polygon: {
        points: [
          point(0, 0),
          point(width, 0),
          point(width, depth),
          point(0, depth),
        ],
      },
    },
    floor: {
      id: ids.floor,
      name: "Concept floor",
      elevation: 0,
      spaceIds: [ids.unitA, ids.unitB, ids.core],
    },
    spaces,
    walls,
    openings,
  };

  const unitADepth = depth - unitBDepth;
  const unitAArea = (width - coreWidth) * unitADepth;
  const unitBArea = width * unitBDepth;
  const summary =
    `Core on the ${coreSide} side: Unit A is ${(width - coreWidth).toFixed(2)} m wide beside the core `
    + `(${unitAArea.toFixed(1)} m2 nominal planning area), Unit B keeps the full ${width.toFixed(2)} m frontage `
    + `at ${unitBDepth.toFixed(2)} m depth (${unitBArea.toFixed(1)} m2); the entrance is through the core's north wall. `
    + `Tradeoff: the ${coreSide} core shifts the entrance and which property-line facade Unit A shares.`;

  return { id: optionId, coreSide, summary, geometry };
}

/**
 * Generates at least two distinct, validated concept options for a feasible
 * brief, or returns explicit structured errors. Never returns invalid
 * geometry or a fabricated result.
 *
 * The public parameter type is LayoutBrief, but the value is treated as
 * UNKNOWN at runtime: program, coreSide, dimensions, origin, unitSplit, and
 * idPrefix are all validated before any nested property read or geometry
 * construction, so malformed input yields structured errors — never a throw
 * or a silently mislabeled option.
 */
export function generateLayout(brief: LayoutBrief): LayoutResult {
  const input: unknown = brief;
  const errors: LayoutError[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{
        code: "INVALID_BRIEF",
        message: `Brief must be an object (got ${describeValue(input)}).`,
      }],
    };
  }
  const raw = input;

  // Program: required object — read only after the record guard.
  if (!isRecord(raw.program)) {
    errors.push({
      code: "INVALID_BRIEF",
      message: `program is required and must be an object { units: 2, core: "shared" } (got ${describeValue(raw.program)}).`,
    });
  } else if (raw.program.units !== 2 || raw.program.core !== "shared") {
    errors.push({
      code: "UNSUPPORTED_PROGRAM",
      message: `Unsupported program: units=${describeValue(raw.program.units)}, core=${describeValue(raw.program.core)}. This slice supports exactly 2 units served by one shared core.`,
    });
  }

  // Core side: only "east" | "west" — anything else must not silently
  // produce an option labeled with an unsupported side.
  const coreSideValue = raw.coreSide;
  if (coreSideValue !== "east" && coreSideValue !== "west") {
    errors.push({
      code: "INVALID_BRIEF",
      message: `coreSide must be "east" or "west" (got ${describeValue(coreSideValue)}).`,
    });
  }

  const width = finiteNumber(raw.width);
  const depth = finiteNumber(raw.depth);
  if (!(width > 0) || !(depth > 0)) {
    errors.push({
      code: "INVALID_SITE_DIMENSIONS",
      message: `Site width and depth must be finite positive meters (got ${describeValue(raw.width)} x ${describeValue(raw.depth)}).`,
    });
  }

  let originX = 0;
  let originY = 0;
  if (raw.origin !== undefined) {
    const origin = raw.origin;
    const ox = isRecord(origin) ? finiteNumber(origin.x) : Number.NaN;
    const oy = isRecord(origin) ? finiteNumber(origin.y) : Number.NaN;
    if (!Number.isFinite(ox) || !Number.isFinite(oy)) {
      errors.push({
        code: "INVALID_ORIGIN",
        message: `Site origin must be a point { x, y } of finite numbers (got ${describeValue(origin)}).`,
      });
    } else {
      originX = ox;
      originY = oy;
    }
  }

  const unitSplit = finiteNumber(raw.unitSplit);
  if (!Number.isFinite(unitSplit) || unitSplit <= 0 || unitSplit >= 1) {
    errors.push({
      code: "SPLIT_OUT_OF_RANGE",
      message: `unitSplit must be strictly between 0 and 1 (got ${describeValue(raw.unitSplit)}).`,
    });
  }

  let prefix = "concept";
  if (raw.idPrefix !== undefined) {
    if (typeof raw.idPrefix !== "string" || !ID_PREFIX_PATTERN.test(raw.idPrefix)) {
      errors.push({
        code: "INVALID_ID_PREFIX",
        message: `idPrefix must be a safe identifier: 1-64 chars, ASCII letter first, then letters, digits, "_" or "-" (got ${describeValue(raw.idPrefix)}).`,
      });
    } else {
      prefix = raw.idPrefix;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  if (width < CORE_WIDTH + MIN_UNIT_WIDTH || depth < MIN_UNIT_DEPTH + MIN_CORE_DEPTH) {
    errors.push({
      code: "SITE_TOO_SMALL",
      message: `Site ${width} x ${depth} m cannot hold a ${CORE_WIDTH} m core beside a ${MIN_UNIT_WIDTH} m unit; minimum is ${CORE_WIDTH + MIN_UNIT_WIDTH} x ${MIN_UNIT_DEPTH + MIN_CORE_DEPTH} m.`,
    });
    return { ok: false, errors };
  }

  // Numerical overflow: origin + dimensions must stay in finite range.
  const maxX = originX + width;
  const maxY = originY + depth;
  if (!Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    errors.push({
      code: "NUMERICAL_OVERFLOW",
      message: `Site corners leave the finite coordinate range: origin (${originX}, ${originY}) + ${width} x ${depth} m yields (${describeValue(maxX)}, ${describeValue(maxY)}).`,
    });
    return { ok: false, errors };
  }

  const unitBDepth = solveUnitBDepth(width, depth, unitSplit, CORE_WIDTH);
  if (!Number.isFinite(unitBDepth)) {
    errors.push({
      code: "NUMERICAL_OVERFLOW",
      message: `Computed Unit B depth ${describeValue(unitBDepth)} is not finite for site ${width} x ${depth} m.`,
    });
    return { ok: false, errors };
  }
  const coreDepth = depth - unitBDepth;
  if (unitBDepth < MIN_UNIT_DEPTH || coreDepth < MIN_CORE_DEPTH) {
    errors.push({
      code: "SPLIT_INFEASIBLE",
      message: `unitSplit ${unitSplit} needs Unit B depth ${unitBDepth.toFixed(3)} m and core depth ${coreDepth.toFixed(3)} m; feasible Unit B depth is ${MIN_UNIT_DEPTH}..${(depth - MIN_CORE_DEPTH).toFixed(3)} m on this site.`,
    });
    return { ok: false, errors };
  }

  const coreSide = coreSideValue as CoreSide;
  // Geometry is constructed ONLY from this normalized, validated brief.
  const validatedBrief: LayoutBrief = {
    program: { units: 2, core: "shared" },
    origin: { x: originX, y: originY },
    width,
    depth,
    coreSide,
    unitSplit,
    idPrefix: prefix,
  };
  const sides: CoreSide[] = [coreSide, coreSide === "east" ? "west" : "east"];
  const options: LayoutOption[] = [];
  const optionErrors: LayoutError[] = [];
  for (let index = 0; index < sides.length; index += 1) {
    const optionId = `${prefix}-option-${index + 1}`;
    const option = buildOption(validatedBrief, sides[index]!, optionId);
    const validation = validateGeometry(option.geometry);
    if (!validation.valid) {
      optionErrors.push({
        code: "GENERATED_OPTION_INVALID",
        message: `Generated option "${optionId}" failed validation: ${
          validation.issues.map((issue) => `${issue.code}(${issue.elementIds.join("+")})`).join(", ")
        }`,
      });
      continue;
    }
    options.push(option);
  }
  if (optionErrors.length > 0) return { ok: false, errors: optionErrors };
  return { ok: true, options };
}
