import { describe, expect, it } from "vitest";
import {
  GEOMETRY_MODEL_VERSION,
  measureSpaces,
  polygonArea,
  totalFloorArea,
  wallLength,
} from "../../lib/architect/geometry";
import { FIXTURE_IDS, buildResidentialFloorFixture } from "../../lib/architect/fixtures";

describe("geometry model", () => {
  it("is versioned and meter-based", () => {
    const fixture = buildResidentialFloorFixture();
    expect(fixture.schemaVersion).toBe(GEOMETRY_MODEL_VERSION);
    expect(fixture.units).toBe("meters");
  });

  it("stores shared walls once and references them from both spaces", () => {
    const fixture = buildResidentialFloorFixture();
    const coreWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallCoreWest)!;
    expect(coreWest.sharedWith).toContain(FIXTURE_IDS.spaceA);
    expect(coreWest.sharedWith).toContain(FIXTURE_IDS.spaceCore);
    // Exactly one wall element exists for the shared core wall.
    expect(fixture.walls.filter((wall) => wall.id === FIXTURE_IDS.wallCoreWest)).toHaveLength(1);
  });

  it("computes wall length from endpoints", () => {
    const fixture = buildResidentialFloorFixture();
    const southWest = fixture.walls.find((wall) => wall.id === FIXTURE_IDS.wallSouthWest)!;
    expect(wallLength(southWest)).toBeCloseTo(6, 9);
  });

  it("openings reference wall IDs and carry no duplicate coordinates", () => {
    const fixture = buildResidentialFloorFixture();
    for (const opening of fixture.openings) {
      expect(fixture.walls.some((wall) => wall.id === opening.wallId)).toBe(true);
      expect(Object.keys(opening)).not.toContain("start");
      expect(Object.keys(opening)).not.toContain("end");
    }
  });

  it("computes the shoelace area for a simple polygon", () => {
    const area = polygonArea({
      points: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ],
    });
    expect(area).toBeCloseTo(12, 9);
  });


});

describe("derived measurements", () => {
  it("derives space areas from geometry, matching the 12x20 site", () => {
    const fixture = buildResidentialFloorFixture();
    const measurements = measureSpaces(fixture);
    const byId = new Map(measurements.map((measurement) => [measurement.spaceId, measurement]));

    // Unit A: 9 x 10 = 90 m²
    expect(byId.get(FIXTURE_IDS.spaceA)!.area).toBeCloseTo(90, 6);
    // Core: 3 x 10 = 30 m²
    expect(byId.get(FIXTURE_IDS.spaceCore)!.area).toBeCloseTo(30, 6);
    // Unit B: 12 x 10 = 120 m²
    expect(byId.get(FIXTURE_IDS.spaceB)!.area).toBeCloseTo(120, 6);

    expect(totalFloorArea(fixture)).toBeCloseTo(240, 6);
  });

  it("derives exact perimeters from junction-split referenced walls", () => {
    const fixture = buildResidentialFloorFixture();
    const measurements = measureSpaces(fixture);
    const byId = new Map(measurements.map((measurement) => [measurement.spaceId, measurement]));

    // Unit A: west-upper 10 + north-west 9 + core-west 10 + mid-west 6
    //         + mid-center 3 = 38 m (a 9x10 rectangle has perimeter 38).
    expect(byId.get(FIXTURE_IDS.spaceA)!.perimeter).toBeCloseTo(38, 6);
    // Core: north-east 3 + east-upper 10 + mid-east 3 + core-west 10 = 26 m.
    expect(byId.get(FIXTURE_IDS.spaceCore)!.perimeter).toBeCloseTo(26, 6);
    // Unit B: south 12 + east-lower 10 + mid 12 + west-lower 10 = 44 m
    //         (a 12x10 rectangle has perimeter 44).
    expect(byId.get(FIXTURE_IDS.spaceB)!.perimeter).toBeCloseTo(44, 6);
  });

  it("never references a wall longer than the perimeter it contributes", () => {
    // Regression: whole walls were referenced by spaces touching only part.
    const fixture = buildResidentialFloorFixture();
    const lengths = new Map(fixture.walls.map((wall) => [wall.id, wallLength(wall)]));
    for (const measurement of measureSpaces(fixture)) {
      expect(measurement.perimeter).toBeCloseTo(
        measurement.width * 2 + measurement.depth * 2,
        6,
      );
      for (const wallId of fixture.spaces.find((space) => space.id === measurement.spaceId)!.wallIds) {
        expect(lengths.get(wallId)!).toBeLessThanOrEqual(measurement.perimeter + 1e-6);
      }
    }
  });

  it("derives bounding-box dimensions per space", () => {
    const fixture = buildResidentialFloorFixture();
    const measurements = measureSpaces(fixture);
    const core = measurements.find((measurement) => measurement.spaceId === FIXTURE_IDS.spaceCore)!;
    expect(core.width).toBeCloseTo(3, 6);
    expect(core.depth).toBeCloseTo(10, 6);
  });
});
