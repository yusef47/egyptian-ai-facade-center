import { describe, expect, it } from "vitest";
import {
  BRIEF_PATCH_BOUNDS,
  BRIEF_PATCH_VERSION,
  applyBriefPatch,
  parseBriefPatch,
  parseWorkspaceBrief,
  toLayoutBrief,
  type WorkspaceBrief,
} from "../../lib/architect/brief-patch";

const BASE_BRIEF: WorkspaceBrief = {
  siteWidth: 12,
  siteDepth: 20,
  unitBSharePercent: 50,
  coreSide: "east",
};

describe("parseBriefPatch", () => {
  it("accepts a single-field patch", () => {
    const parsed = parseBriefPatch({ version: BRIEF_PATCH_VERSION, siteWidth: 14 });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.patch.siteWidth).toBe(14);
  });

  it("accepts a multi-field patch changing width, depth, share, and side at once", () => {
    const parsed = parseBriefPatch({
      version: BRIEF_PATCH_VERSION,
      siteWidth: 15,
      siteDepth: 24,
      unitBSharePercent: 60,
      coreSide: "west",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects a missing or wrong version", () => {
    expect(parseBriefPatch({ siteWidth: 14 }).ok).toBe(false);
    expect(parseBriefPatch({ version: 2, siteWidth: 14 }).ok).toBe(false);
  });

  it("rejects unknown fields (strict allowlist)", () => {
    const parsed = parseBriefPatch({
      version: BRIEF_PATCH_VERSION,
      siteWidth: 14,
      rooms: 4,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.errors.join(" ")).toMatch(/rooms/);
  });

  it("rejects out-of-bounds numeric fields", () => {
    expect(parseBriefPatch({ version: 1, siteWidth: BRIEF_PATCH_BOUNDS.siteWidth.min - 0.5 }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, siteWidth: BRIEF_PATCH_BOUNDS.siteWidth.max + 1 }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, siteDepth: 2 }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, unitBSharePercent: 15 }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, unitBSharePercent: 85 }).ok).toBe(false);
  });

  it("rejects numeric strings, NaN, and infinity", () => {
    expect(parseBriefPatch({ version: 1, siteWidth: "14" }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, siteWidth: Number.NaN }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1, siteDepth: Number.POSITIVE_INFINITY }).ok).toBe(false);
  });

  it("rejects an invalid coreSide and an empty patch", () => {
    expect(parseBriefPatch({ version: 1, coreSide: "north" }).ok).toBe(false);
    expect(parseBriefPatch({ version: 1 }).ok).toBe(false);
    expect(parseBriefPatch(null).ok).toBe(false);
    expect(parseBriefPatch("width=14").ok).toBe(false);
  });
});

describe("applyBriefPatch", () => {
  it("applies a multi-field patch and returns a regenerated two-option layout", () => {
    const applied = applyBriefPatch(BASE_BRIEF, {
      version: 1,
      siteWidth: 15,
      unitBSharePercent: 60,
      coreSide: "west",
    });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.brief).toEqual({
        siteWidth: 15,
        siteDepth: 20,
        unitBSharePercent: 60,
        coreSide: "west",
      });
      expect(applied.result.options).toHaveLength(2);
      // Preferred side becomes option 1, opposite becomes option 2.
      expect(applied.result.options[0]?.coreSide).toBe("west");
      expect(applied.result.options[1]?.coreSide).toBe("east");
    }
  });

  it("keeps untouched fields from the current brief", () => {
    const applied = applyBriefPatch(BASE_BRIEF, { version: 1, coreSide: "west" });
    expect(applied.ok).toBe(true);
    if (applied.ok) {
      expect(applied.brief.siteWidth).toBe(12);
      expect(applied.brief.siteDepth).toBe(20);
      expect(applied.brief.unitBSharePercent).toBe(50);
      expect(applied.brief.coreSide).toBe("west");
    }
  });

  it("does not apply an infeasible change (generation failure blocks the patch)", () => {
    // Within contract bounds, but 3 m cannot hold a 3 m core beside a 3 m unit.
    const applied = applyBriefPatch(BASE_BRIEF, { version: 1, siteWidth: 3 });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.errors.some((error) => error.code === "SITE_TOO_SMALL")).toBe(true);
    }
  });

  it("does not apply a share the site cannot host", () => {
    // On a 6 m-deep site an 80% share leaves too little depth for the core.
    const shallow: WorkspaceBrief = { siteWidth: 12, siteDepth: 6, unitBSharePercent: 50, coreSide: "east" };
    const applied = applyBriefPatch(shallow, { version: 1, unitBSharePercent: 80 });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.errors.some((error) => error.code === "SPLIT_INFEASIBLE")).toBe(true);
    }
  });

  it("reports invalid patches as structured INVALID_BRIEF errors", () => {
    const applied = applyBriefPatch(BASE_BRIEF, { version: 1, setback: 5 });
    expect(applied.ok).toBe(false);
    if (!applied.ok) {
      expect(applied.errors.every((error) => error.code === "INVALID_BRIEF")).toBe(true);
      expect(applied.errors[0]?.message).toMatch(/setback/);
    }
  });

  it("is pure: the current brief object is never mutated", () => {
    const snapshot = structuredClone(BASE_BRIEF);
    applyBriefPatch(BASE_BRIEF, { version: 1, siteWidth: 18 });
    expect(BASE_BRIEF).toEqual(snapshot);
  });
});

describe("parseWorkspaceBrief and toLayoutBrief", () => {
  it("accepts a feasible brief and maps it to the generator input", () => {
    const parsed = parseWorkspaceBrief(BASE_BRIEF);
    expect(parsed.ok).toBe(true);
    const layout = toLayoutBrief(BASE_BRIEF);
    expect(layout.width).toBe(12);
    expect(layout.depth).toBe(20);
    expect(layout.unitSplit).toBe(0.5);
    expect(layout.coreSide).toBe("east");
    expect(layout.idPrefix).toBe("concept-preview");
  });

  it("rejects malformed or infeasible briefs", () => {
    expect(parseWorkspaceBrief(null).ok).toBe(false);
    expect(parseWorkspaceBrief({ ...BASE_BRIEF, coreSide: "north" }).ok).toBe(false);
    expect(parseWorkspaceBrief({ ...BASE_BRIEF, siteWidth: "12" }).ok).toBe(false);
    expect(parseWorkspaceBrief({ ...BASE_BRIEF, siteWidth: 3 }).ok).toBe(false);
  });
});
