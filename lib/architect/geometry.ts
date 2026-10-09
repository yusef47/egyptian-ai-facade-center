/**
 * Versioned project geometry model for the deterministic Architect Engine.
 *
 * All coordinates and lengths are METERS on a single Y-up Cartesian plane
 * (Y grows northward; DXF export flips Y at the boundary, never here).
 *
 * Design rules enforced by this model:
 * - One shared wall is stored exactly once and referenced by both neighboring
 *   spaces; spaces never store their own wall copies.
 * - Openings reference wall IDs; they never duplicate wall coordinates.
 * - Areas and lengths are DERIVED by this module, never stored on the model.
 *
 * AREA CONTRACT: a space polygon is the outline of a PLANNING CELL bounded by
 * wall reference lines (the same lines the wall segments sit on). Its area is
 * therefore a NOMINAL PLANNING AREA — it does not subtract wall thickness and
 * is NOT a clear/net usable floor area, nor any code-compliant area. Real net
 * areas require a thickness-aware inset pass that this model does not perform.
 */

/** Model schema version; bump when the geometry contract changes. */
export const GEOMETRY_MODEL_VERSION = 1;

/** A 2D point in meters. */
export type Point2 = { x: number; y: number };

/** A closed polygon in meters, CCW or CW. */
export type Polygon = { points: Point2[] };

export type SiteBoundary = {
  id: string;
  polygon: Polygon;
};

/**
 * A space is a labeled PLANNING CELL bounded by references to shared walls.
 * The polygon follows the wall reference lines (centerlines of the authored
 * walls), so its area is a nominal planning figure — not clear usable floor
 * area after wall thickness, and not a code-compliant area.
 */
export type Space = {
  id: string;
  name: string;
  /** Wall IDs that bound this space. Must reference existing walls. */
  wallIds: string[];
  /** Planning-cell polygon in meters (wall reference lines). Inside the site. */
  polygon: Polygon;
};

/**
 * A wall segment. Stored once even when it is shared between two spaces.
 */
export type Wall = {
  id: string;
  start: Point2;
  end: Point2;
  /** Thickness in meters (authored data; derived exports may use it). */
  thickness: number;
  /** Spaces that share this wall (a boundary wall lists its single space). */
  sharedWith: string[];
};

/** An opening (door or window) placed along a referenced wall. */
export type Opening = {
  id: string;
  kind: "door" | "window";
  /** The wall this opening is cut into. */
  wallId: string;
  /** Distance along the wall from `wall.start` to the opening's near edge, meters. */
  offset: number;
  /** Opening length along the wall, meters. */
  width: number;
};

export type Floor = {
  id: string;
  name: string;
  /** Elevation of the finished floor level above site datum, meters. */
  elevation: number;
  spaceIds: string[];
};

export type ProjectGeometry = {
  schemaVersion: number;
  units: "meters";
  site: SiteBoundary;
  floor: Floor;
  spaces: Space[];
  walls: Wall[];
  openings: Opening[];
};

/** Derived measurement of a space, computed from geometry only. */
export type SpaceMeasurement = {
  spaceId: string;
  /**
   * NOMINAL planning area in square meters (shoelace of the planning-cell
   * polygon). Does not deduct wall thickness; not a net/clear usable area and
   * not a code-compliant area.
   */
  area: number;
  /** Sum of the space's referenced wall lengths, meters. */
  perimeter: number;
  /** Axis-aligned bounding box dimensions in meters. */
  width: number;
  depth: number;
};

/**
 * Shoelace area of a polygon in square meters (absolute value). For space
 * polygons this is a nominal planning area — see the area contract above.
 */
export function polygonArea(polygon: Polygon): number {
  let sum = 0;
  const points = polygon.points;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum / 2);
}

/** Euclidean length of a wall in meters. */
export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

/** Derives measurements for every space from geometry. */
export function measureSpaces(geometry: ProjectGeometry): SpaceMeasurement[] {
  const wallsById = new Map(geometry.walls.map((wall) => [wall.id, wall]));
  return geometry.spaces.map((space) => {
    const perimeter = space.wallIds.reduce((total, wallId) => {
      const wall = wallsById.get(wallId);
      return wall ? total + wallLength(wall) : total;
    }, 0);
    const xs = space.polygon.points.map((point) => point.x);
    const ys = space.polygon.points.map((point) => point.y);
    return {
      spaceId: space.id,
      area: polygonArea(space.polygon),
      perimeter,
      width: Math.max(...xs) - Math.min(...xs),
      depth: Math.max(...ys) - Math.min(...ys),
    };
  });
}

/** Derived total floor area (sum of space areas), square meters. */
export function totalFloorArea(geometry: ProjectGeometry): number {
  return measureSpaces(geometry).reduce((total, measurement) => total + measurement.area, 0);
}
