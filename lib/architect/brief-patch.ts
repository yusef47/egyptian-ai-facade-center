import {
  generateLayout,
  type CoreSide,
  type LayoutBrief,
  type LayoutError,
  type LayoutResult,
} from "./generate";

/**
 * Conversational editing contract for the Architect Workspace.
 *
 * A BriefPatch describes ONLY the changes the current generator actually
 * supports: site width, site depth, Unit B area share, and preferred core
 * side. A single patch may change more than one field. The language model
 * (and the numeric control panel) both go through parseBriefPatch and
 * applyBriefPatch — nothing else may mutate the brief, and neither path can
 * ever write ProjectGeometry, wall coordinates, SVG, DXF, or code.
 *
 * applyBriefPatch is PURE: it validates the patch, merges it onto the
 * current brief, regenerates both options, and returns the new brief only
 * when generation succeeds. Callers undo by restoring the previous
 * WorkspaceBrief (the plan is derived from the brief, so restoring the
 * brief restores the plan).
 */

/** Contract version. A patch with any other version is rejected. */
export const BRIEF_PATCH_VERSION = 1;

/** The four (and only four) editable brief fields. */
export type BriefPatchField =
  | "siteWidth"
  | "siteDepth"
  | "unitBSharePercent"
  | "coreSide";

/** Stable internal ID prefix for generated options (safe identifier contract). */
export const WORKSPACE_ID_PREFIX = "concept-preview";

/** Fixed program for this slice — not editable via patches. */
const WORKSPACE_PROGRAM = { units: 2, core: "shared" } as const;

/**
 * Contract bounds applied to every incoming patch value (model output is
 * untrusted). These are deliberately tighter than what the generator can
 * technically accept: they keep proposals in a plausible residential range
 * so a hallucinated "width: 900" is rejected before it ever reaches
 * generation. Generation feasibility (SITE_TOO_SMALL / SPLIT_INFEASIBLE) is
 * still checked separately on the merged result.
 */
export const BRIEF_PATCH_BOUNDS = {
  siteWidth: { min: 3, max: 50 },
  siteDepth: { min: 6, max: 100 },
  unitBSharePercent: { min: 20, max: 80 },
} as const;

export type BriefPatch = {
  version: 1;
  siteWidth?: number;
  siteDepth?: number;
  unitBSharePercent?: number;
  coreSide?: CoreSide;
};

/** The editable slice of the workspace brief, in UI units. */
export type WorkspaceBrief = {
  siteWidth: number;
  siteDepth: number;
  /** Target share of combined unit area assigned to Unit B, in percent. */
  unitBSharePercent: number;
  coreSide: CoreSide;
};

export type ParsedBriefPatch =
  | { ok: true; patch: BriefPatch }
  | { ok: false; errors: string[] };

export type ApplyBriefPatchResult =
  | {
      ok: true;
      /** The merged, validated brief — safe to commit as new state. */
      brief: WorkspaceBrief;
      /** The regenerated, validated two-option layout for that brief. */
      result: Extract<LayoutResult, { ok: true }>;
    }
  | { ok: false; errors: LayoutError[] };

/** Patch failures surface on the same error channel as generator failures. */
function patchError(message: string): LayoutError {
  return { code: "INVALID_BRIEF", message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PATCH_FIELDS: readonly BriefPatchField[] = [
  "siteWidth",
  "siteDepth",
  "unitBSharePercent",
  "coreSide",
];

/**
 * Strictly validates an UNTRUSTED patch value.
 *
 * Rules: plain object, exact version, at least one editable field, no
 * unknown keys, numeric fields must be finite numbers inside the contract
 * bounds, coreSide must be exactly "east" or "west". Strings that look like
 * numbers are rejected — the model must emit real JSON numbers.
 */
export function parseBriefPatch(input: unknown): ParsedBriefPatch {
  if (!isRecord(input)) {
    return { ok: false, errors: ["Patch must be an object."] };
  }
  const errors: string[] = [];

  if (input.version !== BRIEF_PATCH_VERSION) {
    errors.push(
      `Patch version must be ${BRIEF_PATCH_VERSION} (got ${JSON.stringify(input.version) ?? "undefined"}).`,
    );
  }

  const unknownKeys = Object.keys(input).filter(
    (key) => key !== "version" && !PATCH_FIELDS.includes(key as BriefPatchField),
  );
  if (unknownKeys.length > 0) {
    errors.push(
      `Unknown patch field(s): ${unknownKeys.join(", ")}. Allowed fields: ${PATCH_FIELDS.join(", ")}.`,
    );
  }

  let fieldCount = 0;
  for (const field of PATCH_FIELDS) {
    if (!(field in input)) continue;
    fieldCount += 1;
    const value = input[field];
    if (field === "coreSide") {
      if (value !== "east" && value !== "west") {
        errors.push(`coreSide must be "east" or "west" (got ${JSON.stringify(value) ?? "undefined"}).`);
      }
      continue;
    }
    const bounds = BRIEF_PATCH_BOUNDS[field];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${field} must be a finite number (got ${JSON.stringify(value) ?? "undefined"}).`);
      continue;
    }
    if (value < bounds.min || value > bounds.max) {
      errors.push(`${field} must be between ${bounds.min} and ${bounds.max} (got ${value}).`);
    }
  }
  if (fieldCount === 0) {
    errors.push("Patch must change at least one field.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, patch: input as unknown as BriefPatch };
}

/** Maps the editable brief into the generator's LayoutBrief input. */
export function toLayoutBrief(brief: WorkspaceBrief): LayoutBrief {
  return {
    program: WORKSPACE_PROGRAM,
    width: brief.siteWidth,
    depth: brief.siteDepth,
    coreSide: brief.coreSide,
    unitSplit: brief.unitBSharePercent / 100,
    idPrefix: WORKSPACE_ID_PREFIX,
  };
}

/**
 * Strictly validates an untrusted WorkspaceBrief (client payloads, stored
 * snapshots). Used by the interpret route before it trusts the caller's
 * current-brief context.
 */
export function parseWorkspaceBrief(input: unknown): {
  ok: boolean;
  brief?: WorkspaceBrief;
} {
  if (!isRecord(input)) return { ok: false };
  const { siteWidth, siteDepth, unitBSharePercent, coreSide } = input;
  if (typeof siteWidth !== "number" || !Number.isFinite(siteWidth)) return { ok: false };
  if (typeof siteDepth !== "number" || !Number.isFinite(siteDepth)) return { ok: false };
  if (typeof unitBSharePercent !== "number" || !Number.isFinite(unitBSharePercent)) {
    return { ok: false };
  }
  if (coreSide !== "east" && coreSide !== "west") return { ok: false };
  // The brief must itself generate a valid layout — a caller cannot smuggle
  // an infeasible "current" brief into the model context.
  const probe = generateLayout(
    toLayoutBrief({ siteWidth, siteDepth, unitBSharePercent, coreSide }),
  );
  if (!probe.ok) return { ok: false };
  return {
    ok: true,
    brief: { siteWidth, siteDepth, unitBSharePercent, coreSide },
  };
}

/**
 * Applies a patch to the current brief and regenerates both options.
 *
 * The change is applied ONLY when generation succeeds: on any patch or
 * generation failure the result is a structured error and the caller keeps
 * its previous brief untouched (which is exactly what Undo relies on).
 */
export function applyBriefPatch(
  currentBrief: WorkspaceBrief,
  patch: unknown,
): ApplyBriefPatchResult {
  const parsed = parseBriefPatch(patch);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors.map(patchError) };
  }

  const merged: WorkspaceBrief = {
    siteWidth: parsed.patch.siteWidth ?? currentBrief.siteWidth,
    siteDepth: parsed.patch.siteDepth ?? currentBrief.siteDepth,
    unitBSharePercent: parsed.patch.unitBSharePercent ?? currentBrief.unitBSharePercent,
    coreSide: parsed.patch.coreSide ?? currentBrief.coreSide,
  };

  const result = generateLayout(toLayoutBrief(merged));
  if (!result.ok) {
    return { ok: false, errors: result.errors };
  }
  return { ok: true, brief: merged, result };
}
