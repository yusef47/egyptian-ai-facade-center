import { describe, expect, it } from "vitest";
import { generateLayout, type LayoutBrief, type LayoutResult } from "../../lib/architect/generate";
import { measureSpaces, totalFloorArea, type ProjectGeometry } from "../../lib/architect/geometry";
import { validateGeometry } from "../../lib/architect/validate";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";

const PROGRAM: LayoutBrief["program"] = { units: 2, core: "shared" };

function generateOk(brief: LayoutBrief) {
  const result = generateLayout(brief);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors, null, 2));
  return result.options;
}

function generateErr(brief: LayoutBrief) {
  const result: LayoutResult = generateLayout(brief);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected structured errors, got options");
  return result.errors;
}

function collectIds(geometry: ProjectGeometry): string[] {
  return [
    geometry.site.id,
    geometry.floor.id,
    ...geometry.spaces.map((space) => space.id),
    ...geometry.walls.map((wall) => wall.id),
    ...geometry.openings.map((opening) => opening.id),
  ];
}

describe("generateLayout — 12x20 m example", () => {
  const brief: LayoutBrief = {
    program: PROGRAM,
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  };

  it("returns two validated options with distinct core sides", () => {
    const options = generateOk(brief);
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options[0]!.coreSide).toBe("east");
    expect(options[1]!.coreSide).toBe("west");
    for (const option of options) {
      expect(validateGeometry(option.geometry).valid).toBe(true);
    }
  });

  it("derives the requested 50/50 unit split with correct dimensions", () => {
    const options = generateOk(brief);
    const geometry = options[0]!.geometry;
    const measurements = new Map(measureSpaces(geometry).map((m) => [m.spaceId, m]));
    const unitA = measurements.get(`${options[0]!.id}-space-unit-a`)!;
    const unitB = measurements.get(`${options[0]!.id}-space-unit-b`)!;
    const core = measurements.get(`${options[0]!.id}-space-core`)!;

    // s = 0.5*9*20 / (12*0.5 + 0.5*9) = 90/10.5
    const unitBDepth = 90 / 10.5;
    expect(unitB.width).toBeCloseTo(12, 9);
    expect(unitB.depth).toBeCloseTo(unitBDepth, 9);
    expect(unitB.area).toBeCloseTo((12 * 90) / 10.5, 6);
    // Equal split: Unit A (9 x 11.4286) matches Unit B (12 x 8.5714).
    expect(unitA.area).toBeCloseTo(unitB.area, 6);
    expect(unitA.width).toBeCloseTo(9, 9);
    expect(unitA.depth).toBeCloseTo(20 - unitBDepth, 9);
    expect(core.width).toBeCloseTo(3, 9);
    expect(core.area).toBeCloseTo((3 * 120) / 10.5, 6);
    // The three planning cells tile the whole rectangular site.
    expect(totalFloorArea(geometry)).toBeCloseTo(240, 6);
  });
});

describe("generateLayout — another site size", () => {
  it("honours the requested unit area split on a 15x12 m site", () => {
    const options = generateOk({
      program: PROGRAM,
      width: 15,
      depth: 12,
      coreSide: "west",
      unitSplit: 0.6,
    });
    const geometry = options[0]!.geometry;
    const measurements = new Map(measureSpaces(geometry).map((m) => [m.spaceId, m]));
    const unitA = measurements.get(`${options[0]!.id}-space-unit-a`)!;
    const unitB = measurements.get(`${options[0]!.id}-space-unit-b`)!;

    const share = unitB.area / (unitA.area + unitB.area);
    expect(share).toBeCloseTo(0.6, 9);
    expect(unitB.width).toBeCloseTo(15, 9);
    expect(totalFloorArea(geometry)).toBeCloseTo(15 * 12, 6);
    expect(validateGeometry(geometry).valid).toBe(true);
  });
});

describe("generateLayout — translated coordinate origin", () => {
  it("places the site at the brief's origin and exports non-negative", () => {
    const origin = { x: 500, y: 1200 };
    const options = generateOk({
      program: PROGRAM,
      origin,
      width: 12,
      depth: 20,
      coreSide: "east",
      unitSplit: 0.5,
    });
    const geometry = options[0]!.geometry;
    expect(validateGeometry(geometry).valid).toBe(true);

    const sitePoints = geometry.site.polygon.points;
    expect(Math.min(...sitePoints.map((p) => p.x))).toBe(500);
    expect(Math.min(...sitePoints.map((p) => p.y))).toBe(1200);
    // Every element sits at the translated origin.
    for (const wall of geometry.walls) {
      expect(wall.start.x).toBeGreaterThanOrEqual(500);
      expect(wall.start.y).toBeGreaterThanOrEqual(1200);
      expect(wall.end.x).toBeGreaterThanOrEqual(500);
      expect(wall.end.y).toBeGreaterThanOrEqual(1200);
    }

    const svg = buildSvgPlan(geometry);
    expect(svg).toContain('viewBox="0 0 14 22"');
    const polygonPoints = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((match) =>
      match[1]!.split(" ").flatMap((pair) => pair.split(",").map(Number)),
    );
    expect(polygonPoints.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);

    const dxf = buildDxfPlan(geometry);
    const xs = [...dxf.matchAll(/ 1[01]\n(-?[\d.]+)/g)].map((match) => Number(match[1]));
    const ys = [...dxf.matchAll(/ 2[01]\n(-?[\d.]+)/g)].map((match) => Number(match[1]));
    expect(xs.every((value) => value >= 0)).toBe(true);
    expect(ys.every((value) => value >= 0)).toBe(true);
    expect(dxf).toContain("  9\n$EXTMAX\n 10\n12.00\n 20\n20.00");
  });
});

describe("generateLayout — distinct options", () => {
  it("returns two geometrically distinct options with IDs and tradeoff summaries", () => {
    const options = generateOk({
      program: PROGRAM,
      width: 12,
      depth: 20,
      coreSide: "east",
      unitSplit: 0.5,
    });
    const [first, second] = options;
    expect(first!.id).not.toBe(second!.id);
    expect(first!.coreSide).not.toBe(second!.coreSide);
    expect(JSON.stringify(first!.geometry)).not.toBe(JSON.stringify(second!.geometry));
    expect(first!.summary.length).toBeGreaterThan(20);
    expect(second!.summary.length).toBeGreaterThan(20);
    expect(first!.summary).not.toBe(second!.summary);
    expect(first!.summary).toContain("east");
    expect(second!.summary).toContain("west");
    // Element IDs are prefixed with their option ID — options never collide.
    const firstIds = collectIds(first!.geometry);
    expect(firstIds.every((id) => id.startsWith(first!.id))).toBe(true);
    const overlap = firstIds.filter((id) => collectIds(second!.geometry).includes(id));
    expect(overlap).toEqual([]);
  });
});

describe("generateLayout — impossible and unsupported briefs", () => {
  it("rejects a site too small for a core plus a unit", () => {
    const errors = generateErr({ program: PROGRAM, width: 4, depth: 20, coreSide: "east", unitSplit: 0.5 });
    expect(errors.map((error) => error.code)).toContain("SITE_TOO_SMALL");
  });

  it("rejects a shallow site", () => {
    const errors = generateErr({ program: PROGRAM, width: 12, depth: 4, coreSide: "east", unitSplit: 0.5 });
    expect(errors.map((error) => error.code)).toContain("SITE_TOO_SMALL");
  });

  it("rejects a split that leaves no room for the core", () => {
    const errors = generateErr({ program: PROGRAM, width: 12, depth: 20, coreSide: "east", unitSplit: 0.95 });
    expect(errors.map((error) => error.code)).toContain("SPLIT_INFEASIBLE");
    expect(errors[0]!.message).toMatch(/core depth/);
  });

  it("rejects splits outside (0,1) and non-finite dimensions", () => {
    expect(
      generateErr({ program: PROGRAM, width: 12, depth: 20, coreSide: "east", unitSplit: 0 }).map((e) => e.code),
    ).toContain("SPLIT_OUT_OF_RANGE");
    expect(
      generateErr({ program: PROGRAM, width: 12, depth: 20, coreSide: "east", unitSplit: Number.NaN }).map((e) => e.code),
    ).toContain("SPLIT_OUT_OF_RANGE");
    expect(
      generateErr({ program: PROGRAM, width: Number.NaN, depth: 20, coreSide: "east", unitSplit: 0.5 }).map((e) => e.code),
    ).toContain("INVALID_SITE_DIMENSIONS");
    expect(
      generateErr({ program: PROGRAM, origin: { x: Number.NaN, y: 0 }, width: 12, depth: 20, coreSide: "east", unitSplit: 0.5 }).map((e) => e.code),
    ).toContain("INVALID_ORIGIN");
  });

  it("rejects an unsupported program instead of fabricating geometry", () => {
    const errors = generateErr({ program: { units: 3, core: "shared" }, width: 12, depth: 20, coreSide: "east", unitSplit: 0.5 });
    expect(errors.map((error) => error.code)).toContain("UNSUPPORTED_PROGRAM");
  });

  it("never returns options alongside errors", () => {
    const result = generateLayout({ program: PROGRAM, width: 4, depth: 20, coreSide: "east", unitSplit: 0.5 });
    expect(result).not.toHaveProperty("options");
  });
});

describe("generateLayout — IDs and access topology", () => {
  const options = generateOk({
    program: PROGRAM,
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  });

  it("emits unique element IDs within each option", () => {
    for (const option of options) {
      const ids = collectIds(option.geometry);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("connects both units to the shared core with a door each", () => {
    for (const option of options) {
      const geometry = option.geometry;
      const unitAId = `${option.id}-space-unit-a`;
      const unitBId = `${option.id}-space-unit-b`;
      const coreId = `${option.id}-space-core`;
      const wallById = new Map(geometry.walls.map((wall) => [wall.id, wall]));

      const doorA = geometry.openings.find((opening) => opening.id === `${option.id}-door-unit-a`)!;
      const doorB = geometry.openings.find((opening) => opening.id === `${option.id}-door-unit-b`)!;
      expect(doorA.kind).toBe("door");
      expect(doorB.kind).toBe("door");
      expect(wallById.get(doorA.wallId)!.sharedWith).toEqual(
        expect.arrayContaining([unitAId, coreId]),
      );
      expect(wallById.get(doorB.wallId)!.sharedWith).toEqual(
        expect.arrayContaining([unitBId, coreId]),
      );
    }
  });

  it("gives the core an exterior entrance on a wall shared by no other space", () => {
    for (const option of options) {
      const geometry = option.geometry;
      const coreId = `${option.id}-space-core`;
      const entry = geometry.openings.find((opening) => opening.id === `${option.id}-door-entry`)!;
      expect(entry.kind).toBe("door");
      const wall = geometry.walls.find((candidate) => candidate.id === entry.wallId)!;
      expect(wall.sharedWith).toEqual([coreId]);
    }
  });

  it("keeps wallIds and sharedWith reciprocal for every generated wall", () => {
    for (const option of options) {
      const geometry = option.geometry;
      const spaceIds = new Set(geometry.spaces.map((space) => space.id));
      for (const wall of geometry.walls) {
        for (const shared of wall.sharedWith) {
          const space = geometry.spaces.find((candidate) => candidate.id === shared);
          expect(space).toBeDefined();
          expect(space!.wallIds).toContain(wall.id);
          expect(spaceIds.has(shared)).toBe(true);
        }
      }
    }
  });
});

describe("generateLayout — exports from generated options", () => {
  it("exports SVG and DXF from every generated option", () => {
    const options = generateOk({
      program: PROGRAM,
      width: 12,
      depth: 20,
      coreSide: "east",
      unitSplit: 0.5,
    });
    for (const option of options) {
      const svg = buildSvgPlan(option.geometry);
      expect(svg).toContain('data-units="meters"');
      expect(svg).toContain(`id="${option.id}-space-unit-a"`);
      expect(svg).toContain(`id="${option.id}-door-unit-a"`);

      const dxf = buildDxfPlan(option.geometry);
      expect(dxf).toContain("  9\n$ACADVER\n  1\nAC1009");
      // Three doors (unit A, unit B, entry) land on the DOORS layer.
      expect(dxf.split("  8\nDOORS\n").length - 1).toBe(3);
      expect(dxf.split("  0\nLINE\n").length - 1).toBeGreaterThanOrEqual(3);
      expect(dxf).toMatch(/\n  0\nENDSEC\n  0\nEOF\n$/);
    }
  });
});

describe("generateLayout — malformed runtime inputs (treated as unknown)", () => {
  const base: LayoutBrief = {
    program: PROGRAM,
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  };

  it("returns a structured error for a null or non-object brief without throwing", () => {
    for (const bad of [null, undefined, "brief", 42]) {
      expect(() => generateLayout(bad as unknown as LayoutBrief)).not.toThrow();
      const errors = generateErr(bad as unknown as LayoutBrief);
      expect(errors.map((error) => error.code)).toContain("INVALID_BRIEF");
    }
  });

  it("returns a structured error for an absent, null, or non-object program", () => {
    const withoutProgram = { width: 12, depth: 20, coreSide: "east", unitSplit: 0.5 };
    const cases = [
      withoutProgram,
      { ...withoutProgram, program: null },
      { ...withoutProgram, program: "shared" },
      { ...withoutProgram, program: 2 },
    ];
    for (const bad of cases) {
      expect(() => generateLayout(bad as unknown as LayoutBrief)).not.toThrow();
      const errors = generateErr(bad as unknown as LayoutBrief);
      expect(errors.map((error) => error.code)).toContain("INVALID_BRIEF");
    }
  });

  it("rejects coreSide values other than east/west instead of mislabeling an option", () => {
    const badSides = ["north", "East", "WEST", "", undefined, null, 7];
    for (const coreSide of badSides) {
      expect(() => generateLayout({ ...base, coreSide } as unknown as LayoutBrief)).not.toThrow();
      const errors = generateErr({ ...base, coreSide } as unknown as LayoutBrief);
      expect(errors.map((error) => error.code)).toContain("INVALID_BRIEF");
      // Never a mislabeled option: no options escape alongside the error.
      const result = generateLayout({ ...base, coreSide } as unknown as LayoutBrief);
      expect(result).not.toHaveProperty("options");
    }
  });

  it("collects structured errors for garbage nested fields without throwing", () => {
    const garbage = {
      program: { units: "2", core: "Shared" },
      width: "12",
      depth: null,
      coreSide: "east",
      unitSplit: "0.5",
      origin: "0,0",
      idPrefix: 42,
    };
    expect(() => generateLayout(garbage as unknown as LayoutBrief)).not.toThrow();
    const errors = generateErr(garbage as unknown as LayoutBrief);
    const codes = errors.map((error) => error.code);
    expect(codes).toContain("UNSUPPORTED_PROGRAM");
    expect(codes).toContain("INVALID_SITE_DIMENSIONS");
    expect(codes).toContain("INVALID_ORIGIN");
    expect(codes).toContain("SPLIT_OUT_OF_RANGE");
    expect(codes).toContain("INVALID_ID_PREFIX");
  });

  it("never throws on a symbol used as a dimension", () => {
    const bad = { ...base, width: Symbol("width") };
    expect(() => generateLayout(bad as unknown as LayoutBrief)).not.toThrow();
    const errors = generateErr(bad as unknown as LayoutBrief);
    expect(errors.map((error) => error.code)).toContain("INVALID_SITE_DIMENSIONS");
  });
});

describe("generateLayout — idPrefix safe identifier contract", () => {
  const base: LayoutBrief = {
    program: PROGRAM,
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  };

  it("rejects empty, unsafe, and markup-bearing idPrefix values", () => {
    const unsafe = [
      "",
      "1abc",
      "a b",
      " concept",
      'a"b',
      "a<b>",
      "a'b",
      "a.b",
      "a&b",
      "<script>",
      'x"><script>alert(1)</script>',
      "x".repeat(65),
    ];
    for (const idPrefix of unsafe) {
      expect(() => generateLayout({ ...base, idPrefix })).not.toThrow();
      const errors = generateErr({ ...base, idPrefix });
      expect(errors.map((error) => error.code)).toContain("INVALID_ID_PREFIX");
      expect(generateLayout({ ...base, idPrefix })).not.toHaveProperty("options");
    }
  });

  it("accepts safe idPrefix values and keeps IDs stable and prefixed", () => {
    const options = generateOk({ ...base, idPrefix: "My-Site_1" });
    expect(options[0]!.id).toBe("My-Site_1-option-1");
    expect(options[1]!.id).toBe("My-Site_1-option-2");
    expect(
      collectIds(options[0]!.geometry).every((id) => id.startsWith("My-Site_1-option-1")),
    ).toBe(true);
  });

  it("keeps the default prefix when idPrefix is absent", () => {
    const options = generateOk(base);
    expect(options[0]!.id).toBe("concept-option-1");
  });
});

describe("generateLayout — numerical overflow", () => {
  const base: LayoutBrief = {
    program: PROGRAM,
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  };

  it("returns NUMERICAL_OVERFLOW when origin plus dimensions leaves the finite range", () => {
    const errors = generateErr({
      ...base,
      origin: { x: Number.MAX_VALUE, y: Number.MAX_VALUE },
      width: Number.MAX_VALUE,
    });
    expect(errors.map((error) => error.code)).toContain("NUMERICAL_OVERFLOW");
  });

  it("returns NUMERICAL_OVERFLOW when the computed split depth is not finite", () => {
    const errors = generateErr({ ...base, width: 1e308, depth: 1e308 });
    expect(errors.map((error) => error.code)).toContain("NUMERICAL_OVERFLOW");
  });
});
