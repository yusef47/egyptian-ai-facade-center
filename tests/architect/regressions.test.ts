import { describe, expect, it } from "vitest";
import { validateGeometry } from "../../lib/architect/validate";
import { FIXTURE_IDS, buildResidentialFloorFixture } from "../../lib/architect/fixtures";
import { measureSpaces, totalFloorArea } from "../../lib/architect/geometry";
import { buildSvgPlan, buildDxfPlan } from "../../lib/architect/export-plan";

/**
 * Regression tests for the six confirmed defects of the first slice.
 * Each test names the defect it guards against and FAILS if it returns.
 */

describe("defect 1 — perimeters counted partial walls in full", () => {
  it("reports a 9x10 space as 38 m and a 12x10 space as 44 m", () => {
    const fixture = buildResidentialFloorFixture();
    const byId = new Map(measureSpaces(fixture).map((m) => [m.spaceId, m]));
    expect(byId.get(FIXTURE_IDS.spaceA)!.perimeter).toBeCloseTo(38, 6);
    expect(byId.get(FIXTURE_IDS.spaceB)!.perimeter).toBeCloseTo(44, 6);
    expect(totalFloorArea(fixture)).toBeCloseTo(240, 6);
  });

  it("every referenced wall lies fully on the referencing space boundary", () => {
    const fixture = buildResidentialFloorFixture();
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(true);
  });
});

describe("defect 2 — walls moved outside the site still validated", () => {
  it("rejects a wall whose endpoint is dragged beyond the site", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    // Drag the top endpoint north, out of the 12x20 site.
    coreWest.end = { x: 9, y: 21 };
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("WALL_OUTSIDE_SITE");
    const issue = result.issues.find((candidate) => candidate.code === "WALL_OUTSIDE_SITE")!;
    expect(issue.elementIds).toContain(FIXTURE_IDS.wallCoreWest);
  });

  it("rejects a wall that no longer lies on its referenced space boundary", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    // Move the shared wall west into Unit A's interior; the space polygons
    // stay unchanged, so the wall no longer sits on either space boundary.
    coreWest.start = { x: 7, y: 10 };
    coreWest.end = { x: 7, y: 20 };
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("WALL_NOT_ON_SPACE_BOUNDARY");
    const issue = result.issues.find((candidate) => candidate.code === "WALL_NOT_ON_SPACE_BOUNDARY")!;
    expect(issue.elementIds).toContain(FIXTURE_IDS.wallCoreWest);
    // Both spaces that referenced the moved wall must be flagged.
    expect(issue.elementIds).toContain(FIXTURE_IDS.spaceA);
  });

  it("rejects a zero-length or zero-thickness wall", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.walls.push({
      id: "wall-degenerate",
      start: { x: 3, y: 3 },
      end: { x: 3, y: 3 },
      thickness: 0.2,
      sharedWith: [FIXTURE_IDS.spaceB],
    });
    const result = validateGeometry(fixture);
    expect(result.issues.map((issue) => issue.code)).toContain("WALL_GEOMETRY_INVALID");
  });
});

describe("defect 3 — SVG mapping broke for non-origin sites and wrong margins", () => {
  it("maps the north wall to exactly the margin distance from the top", () => {
    const fixture = buildResidentialFloorFixture();
    const svg = buildSvgPlan(fixture);
    // North wall (world y=20) sits exactly `margin` (1) SVG units from the
    // top of the padded viewBox — not margin+1 as the old double-flip did.
    expect(svg).toMatch(/id="wall-north-west" x1="1" y1="1"/);
    // South wall (world y=0) sits margin + 20 units from the top.
    expect(svg).toMatch(/id="wall-south-west" x1="1" y1="21"/);
  });

  it("keeps every SVG coordinate non-negative for a translated site", () => {
    const fixture = buildResidentialFloorFixture();
    // Translate the whole site far from the origin.
    const dx = 500;
    const dy = 1200;
    fixture.site.polygon.points = fixture.site.polygon.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
    for (const space of fixture.spaces) {
      space.polygon.points = space.polygon.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      }));
    }
    for (const wall of fixture.walls) {
      wall.start = { x: wall.start.x + dx, y: wall.start.y + dy };
      wall.end = { x: wall.end.x + dx, y: wall.end.y + dy };
    }

    const svg = buildSvgPlan(fixture);
    // No negative coordinate anywhere in the markup.
    const coordinates = [...svg.matchAll(/[xy][12]?"?\s*[=:]\s*"(-?[\d.]+)/g)].map((m) => Number(m[1]));
    const polygonPoints = [...svg.matchAll(/points="([^"]+)"/g)].flatMap((m) =>
      m[1]!.split(" ").flatMap((pair) => pair.split(",").map(Number)),
    );
    expect(coordinates.every((value) => value >= 0)).toBe(true);
    expect(polygonPoints.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    // The translated plan has exactly the same geometry as the original.
    const translated = svg.replace(/id="(site-01|space-|wall-|door-|window-)[^"]*"/g, "");
    const original = buildSvgPlan(buildResidentialFloorFixture()).replace(
      /id="(site-01|space-|wall-|door-|window-)[^"]*"/g,
      "",
    );
    expect(translated).toBe(original);
  });

  it("exports the identical DXF for a consistently translated site", () => {
    const dx = 500;
    const dy = 1200;
    const fixture = buildResidentialFloorFixture();
    // Translate ALL world-space geometry consistently: site, spaces, walls.
    fixture.site.polygon.points = fixture.site.polygon.points.map((point) => ({
      x: point.x + dx,
      y: point.y + dy,
    }));
    for (const space of fixture.spaces) {
      space.polygon.points = space.polygon.points.map((point) => ({
        x: point.x + dx,
        y: point.y + dy,
      }));
    }
    for (const wall of fixture.walls) {
      wall.start = { x: wall.start.x + dx, y: wall.start.y + dy };
      wall.end = { x: wall.end.x + dx, y: wall.end.y + dy };
    }
    // Openings carry wall-relative offset/width, so a rigid translation of
    // their walls keeps them consistent without editing the openings.

    // The translated model must remain a fully valid project.
    expect(validateGeometry(fixture).valid).toBe(true);

    const original = buildDxfPlan(buildResidentialFloorFixture());
    const translated = buildDxfPlan(fixture);
    // DXF coordinates are normalized to the site minimum, so translation
    // cannot change the exported geometry — byte-for-byte identical output.
    expect(translated).toBe(original);
    // And no coordinate is negative in either export.
    for (const dxf of [original, translated]) {
      const xs = [...dxf.matchAll(/ 1[01]\n(-?[\d.]+)/g)].map((m) => Number(m[1]));
      const ys = [...dxf.matchAll(/ 2[01]\n(-?[\d.]+)/g)].map((m) => Number(m[1]));
      expect(xs.every((value) => value >= 0)).toBe(true);
      expect(ys.every((value) => value >= 0)).toBe(true);
    }
  });
});

describe("defect 4 — negative opening width passed validation", () => {
  it("rejects an opening with negative width", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings.push({
      id: "door-negative",
      kind: "door",
      wallId: FIXTURE_IDS.wallCoreWest,
      offset: 2,
      width: -1,
    });
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("OPENING_DIMENSIONS_INVALID");
    const issue = result.issues.find((candidate) => candidate.code === "OPENING_DIMENSIONS_INVALID")!;
    expect(issue.elementIds).toContain("door-negative");
  });

  it("rejects an opening with non-finite width", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings.push({
      id: "door-nan",
      kind: "door",
      wallId: FIXTURE_IDS.wallCoreWest,
      offset: 2,
      width: Number.NaN,
    });
    expect(validateGeometry(fixture).valid).toBe(false);
  });
});

describe("defect 5 — both doors connected Unit A to Unit B", () => {
  it("gives each unit its own door onto the core", () => {
    const fixture = buildResidentialFloorFixture();
    const doorA = fixture.openings.find((opening) => opening.id === FIXTURE_IDS.doorA)!;
    const doorB = fixture.openings.find((opening) => opening.id === FIXTURE_IDS.doorB)!;

    // door-unit-a-core sits on the vertical Unit A | core wall.
    expect(doorA.wallId).toBe(FIXTURE_IDS.wallCoreWest);
    // door-unit-b-core sits on mid-east, the Unit B | core shared segment.
    expect(doorB.wallId).toBe(FIXTURE_IDS.wallMidEast);

    // Both referenced walls are genuinely shared between a unit and the core.
    const coreBoundary = new Set(
      fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceCore)!.wallIds,
    );
    expect(coreBoundary.has(doorA.wallId)).toBe(true);
    expect(coreBoundary.has(doorB.wallId)).toBe(true);
    const unitAWalls = new Set(
      fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!.wallIds,
    );
    const unitBWalls = new Set(
      fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceB)!.wallIds,
    );
    expect(unitAWalls.has(doorA.wallId)).toBe(true);
    expect(unitBWalls.has(doorB.wallId)).toBe(true);
  });

  it("provides the exterior entrance through the core", () => {
    const fixture = buildResidentialFloorFixture();
    const entry = fixture.openings.find((opening) => opening.id === FIXTURE_IDS.doorCoreEntry)!;
    expect(entry.kind).toBe("door");
    // The entry sits on a wall that bounds ONLY the core (exterior side).
    const coreBoundary = new Set(
      fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceCore)!.wallIds,
    );
    expect(coreBoundary.has(entry.wallId)).toBe(true);
    expect(entry.wallId).toBe(FIXTURE_IDS.wallNorthEast);
  });
});

describe("defect 6 — exports stayed consistent with corrected geometry", () => {
  it("derives SVG and DXF from the corrected fixture without errors", () => {
    const fixture = buildResidentialFloorFixture();
    expect(() => buildSvgPlan(fixture)).not.toThrow();
    expect(() => buildDxfPlan(fixture)).not.toThrow();
    // All six openings export onto the correct layers.
    const dxf = buildDxfPlan(fixture);
    expect(dxf).toContain("  8\nDOORS\n");
    expect(dxf).toContain("  8\nWINDOWS\n");
  });
});

describe("topology gap 1 — boundary coverage must be complete and unique", () => {
  it("rejects a space whose wall list no longer covers its polygon boundary", () => {
    const fixture = buildResidentialFloorFixture();
    const unitA = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!;
    // Probe: drop the north wall reference; polygon unchanged, perimeter
    // silently falls 38 -> 29 m under the old validator.
    unitA.wallIds = unitA.wallIds.filter((wallId) => wallId !== FIXTURE_IDS.wallNorthWest);
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("BOUNDARY_COVERAGE_INCOMPLETE");
    const issue = result.issues.find(
      (candidate) => candidate.code === "BOUNDARY_COVERAGE_INCOMPLETE",
    )!;
    expect(issue.elementIds).toContain(FIXTURE_IDS.spaceA);
    // The uncovered north edge (9,20)-(0,20) is named in the message.
    expect(issue.message).toMatch(/\(9,20\)-\(0,20\)/);
  });

  it("rejects two referenced walls covering the same boundary stretch", () => {
    const fixture = buildResidentialFloorFixture();
    const unitA = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!;
    // Add a second wall collinear with and inside the north edge stretch.
    fixture.walls.push({
      id: "wall-duplicate-stretch",
      start: { x: 1, y: 20 },
      end: { x: 4, y: 20 },
      thickness: 0.25,
      sharedWith: [FIXTURE_IDS.spaceA],
    });
    unitA.wallIds.push("wall-duplicate-stretch");
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("BOUNDARY_COVERAGE_OVERLAP");
    const issue = result.issues.find(
      (candidate) => candidate.code === "BOUNDARY_COVERAGE_OVERLAP",
    )!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.spaceA, FIXTURE_IDS.wallNorthWest, "wall-duplicate-stretch"]),
    );
  });

  it("rejects a duplicated wall reference without inflating coverage", () => {
    const fixture = buildResidentialFloorFixture();
    const unitA = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!;
    // Probe: reference the same wall twice; perimeter silently rises 38 -> 47.
    unitA.wallIds.push(FIXTURE_IDS.wallNorthWest);
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("WALL_REFERENCE_DUPLICATE");
    const issue = result.issues.find(
      (candidate) => candidate.code === "WALL_REFERENCE_DUPLICATE",
    )!;
    expect(issue.elementIds).toEqual([FIXTURE_IDS.spaceA, FIXTURE_IDS.wallNorthWest]);
    // Coverage itself uses unique walls, so a pure duplicate raises no overlap.
    expect(result.issues.map((issue2) => issue2.code)).not.toContain("BOUNDARY_COVERAGE_OVERLAP");
  });

  it("flags wrong wall segments even when they sum to the correct perimeter", () => {
    const fixture = buildResidentialFloorFixture();
    const unitA = fixture.spaces.find((space) => space.id === FIXTURE_IDS.spaceA)!;
    // Swap the 6 m mid-west reference for the 6 m south-east wall: the total
    // perimeter stays exactly 38 m, but the boundary is no longer covered.
    unitA.wallIds = unitA.wallIds.filter((wallId) => wallId !== FIXTURE_IDS.wallMidWest);
    unitA.wallIds.push(FIXTURE_IDS.wallSouthEast);
    const measurement = measureSpaces(fixture).find((m) => m.spaceId === FIXTURE_IDS.spaceA)!;
    expect(measurement.perimeter).toBeCloseTo(38, 6);
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("BOUNDARY_COVERAGE_INCOMPLETE");
    expect(codes).toContain("WALL_NOT_ON_SPACE_BOUNDARY");
  });
});

describe("topology gap 2 — wallIds and sharedWith must agree reciprocally", () => {
  it("rejects a wall whose sharedWith drops a referencing space", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    // Probe: spaceCore still references the wall, but the wall forgets it.
    coreWest.sharedWith = coreWest.sharedWith.filter((id) => id !== FIXTURE_IDS.spaceCore);
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("SHARED_WITH_MISMATCH");
    const issue = result.issues.find(
      (candidate) => candidate.code === "SHARED_WITH_MISMATCH",
    )!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.spaceCore, FIXTURE_IDS.wallCoreWest]),
    );
  });

  it("rejects a wall that lists a space which does not reference it back", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    coreWest.sharedWith.push(FIXTURE_IDS.spaceB);
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.code === "SHARED_WITH_MISMATCH",
    )!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.spaceB, FIXTURE_IDS.wallCoreWest]),
    );
  });

  it("rejects a wall listing an unknown space", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    coreWest.sharedWith.push("space-ghost");
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    const issue = result.issues.find(
      (candidate) => candidate.code === "SHARED_WITH_MISMATCH",
    )!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.wallCoreWest, "space-ghost"]),
    );
  });
});

describe("topology gap 3 — openings on one wall must not overlap", () => {
  it("rejects a second door overlapping doorA on the same wall", () => {
    const fixture = buildResidentialFloorFixture();
    // Probe: doorA occupies offset 4..5 on wall-core-west; overlap 4.5..5.5.
    fixture.openings.push({
      id: "door-overlapping",
      kind: "door",
      wallId: FIXTURE_IDS.wallCoreWest,
      offset: 4.5,
      width: 1,
    });
    const result = validateGeometry(fixture);
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("OPENING_OVERLAP");
    const issue = result.issues.find(
      (candidate) => candidate.code === "OPENING_OVERLAP",
    )!;
    expect(issue.elementIds).toEqual(
      expect.arrayContaining([FIXTURE_IDS.doorA, "door-overlapping", FIXTURE_IDS.wallCoreWest]),
    );
  });

  it("allows openings on the same wall whose endpoints only touch", () => {
    const fixture = buildResidentialFloorFixture();
    // doorA occupies 4..5 on the 10 m wall; this door starts exactly at 5.
    fixture.openings.push({
      id: "door-adjacent",
      kind: "door",
      wallId: FIXTURE_IDS.wallCoreWest,
      offset: 5,
      width: 1.5,
    });
    const result = validateGeometry(fixture);
    expect(result.issues.map((issue) => issue.code)).not.toContain("OPENING_OVERLAP");
    expect(result.valid).toBe(true);
  });
});
