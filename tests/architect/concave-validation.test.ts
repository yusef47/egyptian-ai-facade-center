import { describe, expect, it } from "vitest";
import type { Point2, ProjectGeometry } from "../../lib/architect/geometry";
import { GEOMETRY_MODEL_VERSION } from "../../lib/architect/geometry";
import { validateGeometry } from "../../lib/architect/validate";

const site: Point2[] = [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 },
  { x: 7, y: 10 }, { x: 7, y: 3 }, { x: 3, y: 3 },
  { x: 3, y: 10 }, { x: 0, y: 10 },
];

function geometry(sitePoints: Point2[], cells: Point2[][]): ProjectGeometry {
  const spaces = cells.map((points, index) => ({
    id: `space-${index}`,
    name: `Space ${index}`,
    polygon: { points },
    wallIds: points.map((_, edge) => `wall-${index}-${edge}`),
  }));
  const walls = cells.flatMap((points, index) => points.map((start, edge) => ({
    id: `wall-${index}-${edge}`,
    start,
    end: points[(edge + 1) % points.length]!,
    thickness: 0.2,
    sharedWith: [`space-${index}`],
  })));
  return {
    schemaVersion: GEOMETRY_MODEL_VERSION,
    units: "meters",
    site: { id: "site", polygon: { points: sitePoints } },
    floor: { id: "floor", name: "Ground", elevation: 0, spaceIds: spaces.map((space) => space.id) },
    spaces,
    walls,
    openings: [],
  };
}

describe("concave geometry validation", () => {
  it("rejects a space edge crossing a site notch even when every vertex is inside", () => {
    const triangle = [{ x: 1, y: 2 }, { x: 9, y: 2 }, { x: 1, y: 8 }];
    const result = validateGeometry(geometry(site, [triangle]));
    expect(result.issues.some((issue) => issue.code === "POLYGON_OUT_OF_SITE" && issue.elementIds.includes("space-0"))).toBe(true);
  });

  it("rejects a wall crossing a site notch with both endpoints inside", () => {
    const project = geometry(site, []);
    project.walls.push({
      id: "cross-notch", start: { x: 2, y: 8 }, end: { x: 8, y: 8 },
      thickness: 0.2, sharedWith: [],
    });
    const result = validateGeometry(project);
    expect(result.issues.some((issue) => issue.code === "WALL_OUTSIDE_SITE" && issue.elementIds.includes("cross-notch"))).toBe(true);
  });

  it("accepts a rectangle in a concave space's open notch without a false overlap", () => {
    const enclosingSite = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const inNotch = [{ x: 4, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 7 }, { x: 4, y: 7 }];
    const result = validateGeometry(geometry(enclosingSite, [inNotch, site]));
    expect(result.valid).toBe(true);
  });

  it("finds real overlap with either polygon order", () => {
    const enclosingSite = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const crossingArm = [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 4, y: 4 }, { x: 1, y: 4 }];
    for (const cells of [[crossingArm, site], [site, crossingArm]]) {
      const result = validateGeometry(geometry(enclosingSite, cells));
      expect(result.issues.some((issue) => issue.code === "SPACE_OVERLAP")).toBe(true);
    }
  });

  it("rejects a repeated non-neighbor vertex and a retraced edge", () => {
    const enclosingSite = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const selfTouching = [
      { x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 8 },
      { x: 5, y: 5 }, { x: 8, y: 8 }, { x: 1, y: 8 },
    ];
    const retraced = [
      { x: 1, y: 1 }, { x: 8, y: 1 }, { x: 8, y: 8 },
      { x: 6, y: 8 }, { x: 8, y: 8 }, { x: 1, y: 8 },
    ];
    for (const polygon of [selfTouching, retraced]) {
      const result = validateGeometry(geometry(enclosingSite, [polygon]));
      expect(result.issues.some((issue) => issue.code === "POLYGON_SELF_INTERSECTING")).toBe(true);
    }
  });
});
