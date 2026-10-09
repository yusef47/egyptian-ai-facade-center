import type { ProjectGeometry, Space, Wall } from "./geometry";
import { polygonArea } from "./geometry";

/**
 * Deterministic structural validation for Architect Engine geometry.
 * Pure functions, no AI, no randomness: identical input always yields
 * an identical structured result.
 */

export type ValidationCode =
  | "DUPLICATE_ELEMENT_ID"
  | "POLYGON_TOO_FEW_POINTS"
  | "POLYGON_GEOMETRY_INVALID"
  | "POLYGON_SELF_INTERSECTING"
  | "POLYGON_OUT_OF_SITE"
  | "SPACE_OVERLAP"
  | "WALL_REFERENCE_INVALID"
  | "WALL_REFERENCE_DUPLICATE"
  | "WALL_GEOMETRY_INVALID"
  | "WALL_OUTSIDE_SITE"
  | "WALL_NOT_ON_SPACE_BOUNDARY"
  | "BOUNDARY_COVERAGE_INCOMPLETE"
  | "BOUNDARY_COVERAGE_OVERLAP"
  | "SHARED_WITH_MISMATCH"
  | "OPENING_REFERENCE_INVALID"
  | "OPENING_DIMENSIONS_INVALID"
  | "OPENING_OUTSIDE_WALL"
  | "OPENING_OVERLAP"
  | "FLOOR_SPACE_REFERENCE_INVALID";

export type ValidationIssue = {
  code: ValidationCode;
  /** Human-readable explanation. */
  message: string;
  /** IDs of the elements involved (space, wall, opening, site...). */
  elementIds: string[];
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
};

type Point = { x: number; y: number };

const EPSILON = 1e-9;

function crossProduct(origin: Point, a: Point, b: Point): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

/** Segments p1->p2 and p3->p4 properly intersect (shared endpoints excluded). */
function segmentsProperlyIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const d1 = crossProduct(p3, p4, p1);
  const d2 = crossProduct(p3, p4, p2);
  const d3 = crossProduct(p1, p2, p3);
  const d4 = crossProduct(p1, p2, p4);
  return ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON))
    && ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON));
}

function polygonSelfIntersects(points: Point[]): boolean {
  const count = points.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = i + 1; j < count; j += 1) {
      const a = points[i]!;
      const b = points[(i + 1) % count]!;
      const c = points[j]!;
      const d = points[(j + 1) % count]!;
      if (segmentsProperlyIntersect(a, b, c, d)) return true;
      const adjacent = j === i + 1 || (i === 0 && j === count - 1);
      if (adjacent) {
        // A shared vertex is legal; a reversal that retraces a positive
        // stretch of the neighboring edge is not.
        const firstOuter = j === i + 1 ? a : b;
        const shared = j === i + 1 ? b : a;
        const secondOuter = j === i + 1 ? d : c;
        if (pointOnSegment(firstOuter, shared, secondOuter)
            || pointOnSegment(secondOuter, firstOuter, shared)) return true;
      } else if (pointOnSegment(a, c, d) || pointOnSegment(b, c, d)
          || pointOnSegment(c, a, b) || pointOnSegment(d, a, b)) {
        // Non-neighboring edges may not even touch at a repeated vertex.
        return true;
      }
    }
  }
  return false;
}

/** Winding-number style point-in-polygon (strictly interior only). */
function pointStrictlyInside(point: Point, points: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i]!;
    const b = points[j]!;
    const intersectsRay = a.y > point.y !== b.y > point.y;
    if (!intersectsRay) continue;
    const xAtY = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xAtY) inside = !inside;
  }
  return inside;
}

function pointOnSegment(point: Point, a: Point, b: Point, tolerance = 1e-9): boolean {
  const cross = Math.abs(crossProduct(a, b, point));
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < tolerance) return Math.hypot(point.x - a.x, point.y - a.y) <= tolerance;
  if (cross / length > tolerance) return false;
  const dot = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
  return dot >= -tolerance && dot <= length * length + tolerance;
}

/** Point-in-polygon where lying exactly on the boundary counts as inside. */
export function pointInPolygon(point: Point, points: Point[]): boolean {
  if (pointStrictlyInside(point, points)) return true;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    if (pointOnSegment(point, points[j]!, points[i]!)) return true;
  }
  return false;
}

/**
 * A segment stays in a possibly concave polygon when its endpoints and every
 * open interval between boundary crossings are inside or on the boundary.
 * Endpoint-only checks miss a line that cuts across a re-entrant site notch.
 */
export function segmentInsidePolygon(start: Point, end: Point, polygon: Point[]): boolean {
  if (!pointInPolygon(start, polygon) || !pointInPolygon(end, polygon)) return false;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON * EPSILON) return true;
  const parameters = [0, 1];
  const crossVectors = (ax: number, ay: number, bx: number, by: number): number => ax * by - ay * bx;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const fromX = a.x - start.x;
    const fromY = a.y - start.y;
    const denominator = crossVectors(dx, dy, ex, ey);
    if (Math.abs(denominator) > EPSILON) {
      const t = crossVectors(fromX, fromY, ex, ey) / denominator;
      const u = crossVectors(fromX, fromY, dx, dy) / denominator;
      if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) {
        parameters.push(Math.max(0, Math.min(1, t)));
      }
    } else if (Math.abs(crossVectors(fromX, fromY, dx, dy)) <= EPSILON) {
      // A boundary edge may coincide with part of the segment.
      for (const point of [a, b]) {
        const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
        if (t >= -EPSILON && t <= 1 + EPSILON) parameters.push(Math.max(0, Math.min(1, t)));
      }
    }
  }
  parameters.sort((left, right) => left - right);
  for (let index = 1; index < parameters.length; index += 1) {
    const previous = parameters[index - 1]!;
    const next = parameters[index]!;
    if (next - previous <= EPSILON) continue;
    const t = (previous + next) / 2;
    if (!pointInPolygon({ x: start.x + dx * t, y: start.y + dy * t }, polygon)) return false;
  }
  return true;
}

/** Works for simple convex or concave polygons without holes. */
export function polygonInsidePolygon(inner: Point[], outer: Point[]): boolean {
  if (inner.length < 3 || outer.length < 3) return false;
  for (let index = 0; index < inner.length; index += 1) {
    if (!segmentInsidePolygon(inner[index]!, inner[(index + 1) % inner.length]!, outer)) return false;
  }
  return true;
}

/**
 * Sutherland–Hodgman clipping of `subject` against the convex `clip` polygon.
 * Returns the intersection polygon vertices (may be empty).
 */
export function clipPolygon(subject: Point[], clip: Point[]): Point[] {
  let output = [...subject];
  // Normalize clip orientation to counter-clockwise.
  let signedArea = 0;
  for (let i = 0; i < clip.length; i += 1) {
    const current = clip[i]!;
    const next = clip[(i + 1) % clip.length]!;
    signedArea += current.x * next.y - next.x * current.y;
  }
  const orientedClip = signedArea < 0 ? [...clip].reverse() : clip;

  for (let i = 0; i < orientedClip.length && output.length > 0; i += 1) {
    const a = orientedClip[i]!;
    const b = orientedClip[(i + 1) % orientedClip.length]!;
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j]!;
      const next = input[(j + 1) % input.length]!;
      const currentSide = crossProduct(a, b, current);
      const nextSide = crossProduct(a, b, next);
      const currentInside = currentSide >= -EPSILON;
      const nextInside = nextSide >= -EPSILON;
      if (currentInside) output.push(current);
      if (currentInside !== nextInside) {
        const t = currentSide / (currentSide - nextSide);
        output.push({
          x: current.x + (next.x - current.x) * t,
          y: current.y + (next.y - current.y) * t,
        });
      }
    }
  }
  return output;
}

/**
 * Ear-clips a simple polygon into convex triangles. The overlap test below
 * clips triangle pairs, so concave spaces cannot fool a convex-only clipper.
 */
export function triangulatePolygon(input: Point[]): Point[][] | null {
  if (input.length < 3 || input.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const points = [...input];
  // Collinear middle vertices do not change the area but can prevent an ear.
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]!;
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      if (pointOnSegment(current, previous, next)) {
        points.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  let signedArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    signedArea += current.x * next.y - next.x * current.y;
  }
  if (Math.abs(signedArea) <= EPSILON) return null;
  if (signedArea < 0) points.reverse();
  const triangles: Point[][] = [];
  const insideTriangle = (point: Point, a: Point, b: Point, c: Point): boolean =>
    crossProduct(a, b, point) >= -EPSILON
    && crossProduct(b, c, point) >= -EPSILON
    && crossProduct(c, a, point) >= -EPSILON;
  while (points.length > 3) {
    let earFound = false;
    for (let index = 0; index < points.length; index += 1) {
      const previous = points[(index - 1 + points.length) % points.length]!;
      const current = points[index]!;
      const next = points[(index + 1) % points.length]!;
      if (crossProduct(previous, current, next) <= EPSILON) continue;
      if (points.some((point, other) =>
        other !== index && other !== (index - 1 + points.length) % points.length
        && other !== (index + 1) % points.length
        && insideTriangle(point, previous, current, next))) continue;
      triangles.push([previous, current, next]);
      points.splice(index, 1);
      earFound = true;
      break;
    }
    if (!earFound) return null;
  }
  triangles.push(points);
  return triangles;
}

/** Shared edges and corner touches have zero area and are legal. */
export function findSpaceOverlaps(points: Point[][]): Array<[number, number]> {
  const overlaps: Array<[number, number]> = [];
  const triangles = points.map(triangulatePolygon);
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      if (!triangles[i] || !triangles[j]) continue; // malformed polygons reported separately
      let area = 0;
      for (const first of triangles[i]!) {
        for (const second of triangles[j]!) {
          const intersection = clipPolygon(first, second);
          if (intersection.length >= 3) area += polygonArea({ points: intersection });
        }
      }
      if (area > 1e-6) {
        overlaps.push([i, j]);
      }
    }
  }
  return overlaps;
}

/** Checks one polygon for point count, self-intersection, and site containment. */
function checkPolygon(
  geometry: ProjectGeometry,
  polygon: { points: Point[] },
  elementId: string,
  mustBeInsideSite: boolean,
  issues: ValidationIssue[],
): void {
  if (polygon.points.length < 3) {
    issues.push({
      code: "POLYGON_TOO_FEW_POINTS",
      message: `Polygon of "${elementId}" has fewer than 3 points`,
      elementIds: [elementId],
    });
    return;
  }
  if (polygon.points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    issues.push({
      code: "POLYGON_GEOMETRY_INVALID",
      message: `Polygon of "${elementId}" has non-finite coordinates`,
      elementIds: [elementId],
    });
    return;
  }
  if (polygon.points.some((point, index) =>
    Math.hypot(point.x - polygon.points[(index + 1) % polygon.points.length]!.x,
      point.y - polygon.points[(index + 1) % polygon.points.length]!.y) <= EPSILON)) {
    issues.push({
      code: "POLYGON_GEOMETRY_INVALID",
      message: `Polygon of "${elementId}" has a zero-length edge`,
      elementIds: [elementId],
    });
    return;
  }
  if (polygonSelfIntersects(polygon.points)) {
    issues.push({
      code: "POLYGON_SELF_INTERSECTING",
      message: `Polygon of "${elementId}" intersects itself`,
      elementIds: [elementId],
    });
    return;
  }
  if (polygonArea(polygon) <= EPSILON) {
    issues.push({
      code: "POLYGON_GEOMETRY_INVALID",
      message: `Polygon of "${elementId}" has zero area`,
      elementIds: [elementId],
    });
    return;
  }
  if (
    mustBeInsideSite
    && !polygonInsidePolygon(polygon.points, geometry.site.polygon.points)
  ) {
    issues.push({
      code: "POLYGON_OUT_OF_SITE",
      message: `Polygon of "${elementId}" extends outside site boundary "${geometry.site.id}"`,
      elementIds: [elementId, geometry.site.id],
    });
  }
}

/**
 * Validates the full project geometry and returns structured issues.
 * Collects ALL issues (does not stop at the first).
 */
export function validateGeometry(geometry: ProjectGeometry): ValidationResult {
  const issues: ValidationIssue[] = [];

  // --- Duplicate element IDs across the whole project (site, floor, spaces,
  // walls, openings — including cross-kind collisions). A duplicated wall ID
  // otherwise validates and produces duplicate SVG element IDs downstream. ---
  const idOwners = new Map<string, string[]>();
  const registerId = (id: string, kind: string): void => {
    const owners = idOwners.get(id) ?? [];
    owners.push(kind);
    idOwners.set(id, owners);
  };
  registerId(geometry.site.id, "site");
  registerId(geometry.floor.id, "floor");
  for (const space of geometry.spaces) registerId(space.id, "space");
  for (const wall of geometry.walls) registerId(wall.id, "wall");
  for (const opening of geometry.openings) registerId(opening.id, "opening");
  for (const [id, owners] of idOwners) {
    if (owners.length > 1) {
      issues.push({
        code: "DUPLICATE_ELEMENT_ID",
        message: `Duplicate element ID "${id}" used by ${owners.join(", ")}`,
        elementIds: [id],
      });
    }
  }

  const wallsById = new Map(geometry.walls.map((wall) => [wall.id, wall]));
  const wallIds = new Set(wallsById.keys());
  const spaceIds = new Set(geometry.spaces.map((space) => space.id));
  const sitePoints = geometry.site.polygon.points;

  // --- Walls: finite positive geometry, within the site polygon. ---
  for (const wall of geometry.walls) {
    const finitePositive = (value: number): boolean =>
      Number.isFinite(value) && value > EPSILON;
    const endpointsFinite =
      [wall.start.x, wall.start.y, wall.end.x, wall.end.y].every(Number.isFinite);
    if (!endpointsFinite || !finitePositive(wall.thickness)
      || Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) <= EPSILON) {
      issues.push({
        code: "WALL_GEOMETRY_INVALID",
        message: `Wall "${wall.id}" has non-finite, zero-length, or non-positive-thickness geometry`,
        elementIds: [wall.id],
      });
      continue;
    }
    if (
      !segmentInsidePolygon(wall.start, wall.end, sitePoints)
    ) {
      issues.push({
        code: "WALL_OUTSIDE_SITE",
        message: `Wall "${wall.id}" extends outside site boundary "${geometry.site.id}"`,
        elementIds: [wall.id, geometry.site.id],
      });
    }
  }

  // --- Site polygon must be well-formed (but not "inside itself"). ---
  checkPolygon(geometry, geometry.site.polygon, geometry.site.id, false, issues);
  // --- Spaces: well-formed, inside site, wall references resolve, no overlaps. ---
  for (const space of geometry.spaces) {
    checkPolygon(geometry, space.polygon, space.id, true, issues);
    for (const wallId of space.wallIds) {
      if (!wallIds.has(wallId)) {
        issues.push({
          code: "WALL_REFERENCE_INVALID",
          message: `Space "${space.id}" references unknown wall "${wallId}"`,
          elementIds: [space.id, wallId],
        });
        continue;
      }
      // Every referenced wall must lie ON the space's polygon boundary in full:
      // both endpoints on the boundary and the whole segment inside-or-on the
      // polygon (catches walls that only graze a corner or cross the interior).
      const wall = geometry.walls.find((candidate) => candidate.id === wallId)!;
      const boundaryPoints = space.polygon.points;
      const wallSpan = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
      // All three sampled points (start, mid, end) must lie ON a boundary
      // edge — merely being inside the polygon is not enough, otherwise a wall
      // moved into the space interior would still validate.
      const mid: Point = {
        x: (wall.start.x + wall.end.x) / 2,
        y: (wall.start.y + wall.end.y) / 2,
      };
      const endpointsOnBoundary =
        pointOnAnySegment(wall.start, boundaryPoints)
        && pointOnAnySegment(wall.end, boundaryPoints);
      const midOnBoundary = pointOnAnySegment(mid, boundaryPoints);
      if (!endpointsOnBoundary || !midOnBoundary) {
        issues.push({
          code: "WALL_NOT_ON_SPACE_BOUNDARY",
          message: `Wall "${wall.id}" (${wallSpan.toFixed(3)} m) referenced by space "${space.id}" does not lie on that space's polygon boundary`,
          elementIds: [space.id, wall.id],
        });
      }
    }

    // A wallId listed twice would double-count measurements without adding
    // geometry; flag it even though coverage below uses unique walls.
    const seenWallIds = new Set<string>();
    for (const wallId of space.wallIds) {
      if (seenWallIds.has(wallId)) {
        issues.push({
          code: "WALL_REFERENCE_DUPLICATE",
          message: `Space "${space.id}" references wall "${wallId}" more than once`,
          elementIds: [space.id, wallId],
        });
      }
      seenWallIds.add(wallId);
    }

    // Reciprocal part 1: space -> wall must be mirrored by wall -> space.
    for (const wallId of seenWallIds) {
      const wall = wallsById.get(wallId);
      if (wall && !wall.sharedWith.includes(space.id)) {
        issues.push({
          code: "SHARED_WITH_MISMATCH",
          message: `Space "${space.id}" references wall "${wall.id}", but the wall's sharedWith does not list the space`,
          elementIds: [space.id, wall.id],
        });
      }
    }

    checkBoundaryCoverage(space, wallsById, issues);
  }

  // Reciprocal part 2: wall -> space must be mirrored by space -> wall.
  for (const wall of geometry.walls) {
    for (const sharedId of wall.sharedWith) {
      const space = geometry.spaces.find((candidate) => candidate.id === sharedId);
      if (!space || !space.wallIds.includes(wall.id)) {
        issues.push({
          code: "SHARED_WITH_MISMATCH",
          message: space
            ? `Wall "${wall.id}" lists space "${sharedId}" in sharedWith, but the space does not reference the wall`
            : `Wall "${wall.id}" lists unknown space "${sharedId}" in sharedWith`,
          elementIds: [wall.id, sharedId],
        });
      }
    }
  }

  for (const [i, j] of findSpaceOverlaps(geometry.spaces.map((space) => space.polygon.points))) {
    const a = geometry.spaces[i]!;
    const b = geometry.spaces[j]!;
    issues.push({
      code: "SPACE_OVERLAP",
      message: `Spaces "${a.id}" and "${b.id}" overlap`,
      elementIds: [a.id, b.id],
    });
  }

  // Floor must reference real spaces.
  for (const spaceId of geometry.floor.spaceIds) {
    if (!spaceIds.has(spaceId)) {
      issues.push({
        code: "FLOOR_SPACE_REFERENCE_INVALID",
        message: `Floor "${geometry.floor.id}" references unknown space "${spaceId}"`,
        elementIds: [geometry.floor.id, spaceId],
      });
    }
  }

  // Openings: wall references resolve, dimensions are finite and positive,
  // and the opening lies within the wall span.
  for (const opening of geometry.openings) {
    if (!Number.isFinite(opening.width) || opening.width <= EPSILON
      || !Number.isFinite(opening.offset) || opening.offset < -EPSILON) {
      issues.push({
        code: "OPENING_DIMENSIONS_INVALID",
        message: `Opening "${opening.id}" has non-finite or non-positive width (${opening.width}) or negative offset (${opening.offset})`,
        elementIds: [opening.id],
      });
    }
    if (!wallIds.has(opening.wallId)) {
      issues.push({
        code: "OPENING_REFERENCE_INVALID",
        message: `Opening "${opening.id}" references unknown wall "${opening.wallId}"`,
        elementIds: [opening.id, opening.wallId],
      });
      continue;
    }
    const wall = geometry.walls.find((candidate) => candidate.id === opening.wallId)!;
    const wallSpan = Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
    if (opening.offset < -EPSILON || opening.offset + opening.width > wallSpan + EPSILON) {
      issues.push({
        code: "OPENING_OUTSIDE_WALL",
        message: `Opening "${opening.id}" (offset ${opening.offset.toFixed(3)} m, width ${opening.width.toFixed(3)} m) does not fit within wall "${wall.id}" span ${wallSpan.toFixed(3)} m`,
        elementIds: [opening.id, wall.id],
      });
    }
  }

  // Openings on the same wall must not overlap; intervals that merely touch
  // (adjacent doors sharing a jamb) are legal.
  const openingsByWall = new Map<string, Array<{ id: string; start: number; end: number }>>();
  for (const opening of geometry.openings) {
    if (!wallIds.has(opening.wallId)
      || !Number.isFinite(opening.width) || opening.width <= EPSILON
      || !Number.isFinite(opening.offset) || opening.offset < -EPSILON) {
      continue; // unknown wall or invalid dimensions already reported above
    }
    const group = openingsByWall.get(opening.wallId) ?? [];
    group.push({ id: opening.id, start: opening.offset, end: opening.offset + opening.width });
    openingsByWall.set(opening.wallId, group);
  }
  for (const [wallId, group] of openingsByWall) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const first = group[i]!;
        const second = group[j]!;
        const overlap = Math.min(first.end, second.end) - Math.max(first.start, second.start);
        if (overlap > EPSILON) {
          issues.push({
            code: "OPENING_OVERLAP",
            message: `Openings "${first.id}" and "${second.id}" overlap by ${overlap.toFixed(3)} m on wall "${wallId}"`,
            elementIds: [first.id, second.id, wallId],
          });
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/** True when the point lies on any polygon edge. */
function pointOnAnySegment(point: Point, points: Point[]): boolean {
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    if (pointOnSegment(point, points[j]!, points[i]!, 1e-6)) return true;
  }
  return false;
}

/**
 * Verifies that the space's referenced wall segments cover every polygon edge
 * COMPLETELY and WITHOUT a duplicated stretch. Coverage is computed as an
 * interval union along each edge — deliberately NOT by comparing perimeter
 * totals, since wrong wall segments can sum to the correct number.
 */
function checkBoundaryCoverage(
  space: Space,
  wallsById: Map<string, Wall>,
  issues: ValidationIssue[],
): void {
  const points = space.polygon.points;
  if (points.length < 3) return; // malformed polygon already reported
  const uniqueWallIds = [...new Set(space.wallIds)].filter((id) => wallsById.has(id));

  for (let index = 0; index < points.length; index += 1) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const edgeX = b.x - a.x;
    const edgeY = b.y - a.y;
    const length = Math.hypot(edgeX, edgeY);
    if (length <= EPSILON) continue;
    const unitX = edgeX / length;
    const unitY = edgeY / length;
    const project = (point: Point): number =>
      (point.x - a.x) * unitX + (point.y - a.y) * unitY;
    const distanceToLine = (point: Point): number =>
      Math.abs(edgeX * (point.y - a.y) - edgeY * (point.x - a.x)) / length;

    // Intervals of referenced walls that are collinear with this edge.
    const intervals: Array<{ lo: number; hi: number; wallId: string }> = [];
    for (const wallId of uniqueWallIds) {
      const wall = wallsById.get(wallId)!;
      if (distanceToLine(wall.start) > 1e-6 || distanceToLine(wall.end) > 1e-6) continue;
      const p0 = project(wall.start);
      const p1 = project(wall.end);
      const lo = Math.max(0, Math.min(p0, p1));
      const hi = Math.min(length, Math.max(p0, p1));
      if (hi - lo <= 1e-9) continue;
      intervals.push({ lo, hi, wallId });
    }
    intervals.sort((left, right) => left.lo - right.lo);

    // Two referenced walls covering the same stretch is duplicated coverage.
    const reportedPairs = new Set<string>();
    for (let i = 0; i < intervals.length; i += 1) {
      for (let j = i + 1; j < intervals.length; j += 1) {
        const first = intervals[i]!;
        const second = intervals[j]!;
        const shared = Math.min(first.hi, second.hi) - Math.max(first.lo, second.lo);
        if (shared <= 1e-6) continue; // endpoints touching only — legal
        const key = [first.wallId, second.wallId].sort().join("|");
        if (reportedPairs.has(key)) continue;
        reportedPairs.add(key);
        issues.push({
          code: "BOUNDARY_COVERAGE_OVERLAP",
          message: `Walls "${first.wallId}" and "${second.wallId}" both cover ${shared.toFixed(3)} m of space "${space.id}" boundary`,
          elementIds: [space.id, first.wallId, second.wallId],
        });
      }
    }

    // Walk the sorted intervals; any jump means an uncovered boundary gap.
    let cursor = 0;
    let gapAt = -1;
    for (const interval of intervals) {
      if (interval.lo > cursor + 1e-6) {
        gapAt = cursor;
        break;
      }
      cursor = Math.max(cursor, interval.hi);
    }
    if (gapAt < 0 && cursor < length - 1e-6) gapAt = cursor;
    if (gapAt >= 0) {
      const at = { x: a.x + unitX * gapAt, y: a.y + unitY * gapAt };
      issues.push({
        code: "BOUNDARY_COVERAGE_INCOMPLETE",
        message: `Boundary edge (${a.x},${a.y})-(${b.x},${b.y}) of space "${space.id}" is not fully covered by its referenced walls (gap at ${at.x.toFixed(3)},${at.y.toFixed(3)})`,
        elementIds: [space.id, ...new Set(intervals.map((interval) => interval.wallId))],
      });
    }
  }
}
