import { describe, expect, it } from "vitest";
import { validateGeometry, type ValidationCode } from "../../lib/architect/validate";
import { FIXTURE_IDS, buildResidentialFloorFixture } from "../../lib/architect/fixtures";
import { buildSvgPlan } from "../../lib/architect/export-plan";

function issueCodes(issues: { code: ValidationCode }[]): ValidationCode[] {
  return issues.map((issue) => issue.code);
}

describe("validateGeometry — valid fixture", () => {
  it("accepts the canonical residential floor fixture", () => {
    const result = validateGeometry(buildResidentialFloorFixture());
    expect(result.issues).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("allows spaces that share edges (shared walls are legal)", () => {
    const fixture = buildResidentialFloorFixture();
    // Unit A and the core share the x=9 edge; Unit B touches both at y=10.
    expect(issueCodes(validateGeometry(fixture).issues)).not.toContain("SPACE_OVERLAP");
  });
});

describe("validateGeometry — malformed polygons", () => {
  it("rejects a polygon with fewer than 3 points", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.site.polygon.points = [{ x: 0, y: 0 }, { x: 12, y: 0 }];
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("POLYGON_TOO_FEW_POINTS");
    expect(result.issues[0]!.elementIds).toContain(FIXTURE_IDS.site);
    expect(result.valid).toBe(false);
  });

  it("rejects a self-intersecting space polygon", () => {
    const fixture = buildResidentialFloorFixture();
    const unitB = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceB)!;
    // Bowtie: crosses itself between (0,0)->(12,0)->(0,10)->(12,10)->close.
    unitB.polygon.points = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 0, y: 10 },
      { x: 12, y: 10 },
    ];
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("POLYGON_SELF_INTERSECTING");
    expect(result.issues.find((issue) => issue.code === "POLYGON_SELF_INTERSECTING")!.elementIds).toContain(FIXTURE_IDS.spaceB);
  });
});

describe("validateGeometry — out-of-bound geometry", () => {
  it("rejects a space polygon that extends outside the site boundary", () => {
    const fixture = buildResidentialFloorFixture();
    const unitB = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceB)!;
    unitB.polygon.points = unitB.polygon.points.map((point) => ({ ...point, y: point.y + 12 }));
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("POLYGON_OUT_OF_SITE");
    const issue = result.issues.find((candidate) => candidate.code === "POLYGON_OUT_OF_SITE")!;
    expect(issue.elementIds).toContain(FIXTURE_IDS.spaceB);
    expect(issue.elementIds).toContain(FIXTURE_IDS.site);
  });
});

describe("validateGeometry — space overlaps", () => {
  it("rejects two spaces whose interiors overlap", () => {
    const fixture = buildResidentialFloorFixture();
    const core = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceCore)!;
    // Grow the core 2 m into Unit A (over the shared wall at x=9).
    core.polygon.points = core.polygon.points.map((point) => ({ ...point, x: point.x - 2 }));
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("SPACE_OVERLAP");
    const issue = result.issues.find((candidate) => candidate.code === "SPACE_OVERLAP")!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.spaceCore, FIXTURE_IDS.spaceA]),
    );
  });
});

describe("validateGeometry — references", () => {
  it("rejects a space referencing an unknown wall", () => {
    const fixture = buildResidentialFloorFixture();
    const unitA = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!;
    unitA.wallIds.push("wall-does-not-exist");
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("WALL_REFERENCE_INVALID");
    const issue = result.issues.find((candidate) => candidate.code === "WALL_REFERENCE_INVALID")!;
    expect(issue.elementIds).toContain(FIXTURE_IDS.spaceA);
    expect(issue.elementIds).toContain("wall-does-not-exist");
  });

  it("rejects an opening referencing an unknown wall", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings[0]!.wallId = "wall-missing";
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("OPENING_REFERENCE_INVALID");
    expect(result.issues[0]!.elementIds).toContain(FIXTURE_IDS.doorA);
  });

  it("rejects a floor referencing an unknown space", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.floor.spaceIds.push("space-ghost");
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("FLOOR_SPACE_REFERENCE_INVALID");
    expect(result.issues[0]!.elementIds).toContain(FIXTURE_IDS.floor);
  });
});

describe("validateGeometry — openings", () => {
  it("accepts an opening that exactly spans to the wall end", () => {
    const fixture = buildResidentialFloorFixture();
    const south = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallSouthWest)!;
    const span = Math.hypot(south.end.x - south.start.x, south.end.y - south.start.y);
    fixture.openings.push({ id: "window-edge", kind: "window", wallId: south.id, offset: span - 2, width: 2 });
    expect(validateGeometry(fixture).valid).toBe(true);
  });

  it("rejects an opening extending past its wall end with element IDs", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings.push({
      id: "window-overflow",
      kind: "window",
      wallId: FIXTURE_IDS.wallSouthWest,
      offset: 5.5,
      width: 2,
    });
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(issueCodes(result.issues)).toContain("OPENING_OUTSIDE_WALL");
    const issue = result.issues.find((candidate) => candidate.code === "OPENING_OUTSIDE_WALL")!;
    expect(issue.elementIds).toContain("window-overflow");
    expect(issue.elementIds).toContain(FIXTURE_IDS.wallSouthWest);
    expect(issue.message).toMatch(/5\.5/);
  });

  it("rejects a negative opening offset", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings[0]!.offset = -0.5;
    const result = validateGeometry(fixture);
    expect(issueCodes(result.issues)).toContain("OPENING_OUTSIDE_WALL");
  });

  it("collects all issues in one pass instead of failing fast", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings[0]!.wallId = "wall-missing";
    fixture.openings[1]!.offset = 99;
    const result = validateGeometry(fixture);
    const codes = issueCodes(result.issues);
    expect(codes).toContain("OPENING_REFERENCE_INVALID");
    expect(codes).toContain("OPENING_OUTSIDE_WALL");
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

describe("validateGeometry — duplicate element IDs", () => {
  it("rejects a duplicated wall ID with the duplicate and element kinds", () => {
    const fixture = buildResidentialFloorFixture();
    // Regression: this previously validated and produced duplicate SVG IDs.
    const northWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallNorthWest)!;
    fixture.walls.push({ ...northWest });
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.code === "DUPLICATE_ELEMENT_ID",
    )!;
    expect(issue).toBeDefined();
    expect(issue.elementIds).toEqual([FIXTURE_IDS.wallNorthWest]);
    expect(issue.message).toMatch(/wall, wall/);
    // Why this matters: the same geometry exported to SVG yields TWO elements
    // carrying the identical id attribute.
    const svg = buildSvgPlan(fixture);
    const occurrences = svg.split(`id="${FIXTURE_IDS.wallNorthWest}"`).length - 1;
    expect(occurrences).toBe(2);
  });

  it("rejects a duplicate spanning different element kinds (floor = site)", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.floor.id = FIXTURE_IDS.site;
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.code === "DUPLICATE_ELEMENT_ID",
    )!;
    expect(issue.elementIds).toEqual([FIXTURE_IDS.site]);
    expect(issue.message).toMatch(/site, floor/);
  });

  it("rejects duplicated space IDs and duplicated opening IDs", () => {
    const spaceFixture = buildResidentialFloorFixture();
    spaceFixture.spaces[1]!.id = FIXTURE_IDS.spaceA;
    const spaceResult = validateGeometry(spaceFixture);
    expect(issueCodes(spaceResult.issues)).toContain("DUPLICATE_ELEMENT_ID");
    expect(
      spaceResult.issues.find((candidate) => candidate.code === "DUPLICATE_ELEMENT_ID")!
        .elementIds,
    ).toEqual([FIXTURE_IDS.spaceA]);

    const openingFixture = buildResidentialFloorFixture();
    openingFixture.openings.push({ ...openingFixture.openings[0]! });
    const openingResult = validateGeometry(openingFixture);
    expect(issueCodes(openingResult.issues)).toContain("DUPLICATE_ELEMENT_ID");
    expect(
      openingResult.issues.find((candidate) => candidate.code === "DUPLICATE_ELEMENT_ID")!
        .elementIds,
    ).toEqual([FIXTURE_IDS.doorA]);
  });

  it("accepts the canonical fixture with fully unique IDs", () => {
    const fixture = buildResidentialFloorFixture();
    expect(issueCodes(validateGeometry(fixture).issues)).not.toContain(
      "DUPLICATE_ELEMENT_ID",
    );
  });
});
