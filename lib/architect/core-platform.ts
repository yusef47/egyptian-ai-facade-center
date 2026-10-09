import type { Point2 } from "./geometry";
import { triangulatePolygon } from "./validate";

const EPSILON = 1e-8;

function cross(a: Point2, b: Point2, p: Point2): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function area(points: Point2[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

/** Retain one side of a directed line, including the line itself. */
function clip(points: Point2[], a: Point2, b: Point2, inside: boolean): Point2[] {
  if (!points.length) return [];
  const output: Point2[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const start = points[i]!;
    const end = points[(i + 1) % points.length]!;
    const startValue = cross(a, b, start);
    const endValue = cross(a, b, end);
    const startKept = inside ? startValue >= -EPSILON : startValue <= EPSILON;
    const endKept = inside ? endValue >= -EPSILON : endValue <= EPSILON;
    if (startKept) output.push(start);
    if (startKept !== endKept) {
      const denominator = startValue - endValue;
      if (Math.abs(denominator) > EPSILON) {
        const t = startValue / denominator;
        output.push({ x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) });
      }
    }
  }
  return output.filter((point, i) => {
    const previous = output[(i - 1 + output.length) % output.length]!;
    return Math.hypot(point.x - previous.x, point.y - previous.y) > EPSILON;
  });
}

/** Subtract convex stair openings from a possibly concave core plate. */
export function corePlatformPieces(core: Point2[], voids: Point2[][]): Point2[][] | null {
  const triangles = triangulatePolygon(core);
  if (!triangles || voids.some((voidPolygon) => !triangulatePolygon(voidPolygon))) return null;
  let pieces = triangles;
  for (const voidPolygon of voids) {
    const signed = voidPolygon.reduce((sum, point, index) => {
      const next = voidPolygon[(index + 1) % voidPolygon.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0);
    const cutter = signed > 0 ? voidPolygon : [...voidPolygon].reverse();
    const remaining: Point2[][] = [];
    for (const piece of pieces) {
      let inside = piece;
      for (let i = 0; i < cutter.length && area(inside) > EPSILON; i += 1) {
        const a = cutter[i]!;
        const b = cutter[(i + 1) % cutter.length]!;
        const outside = clip(inside, a, b, false);
        if (area(outside) > EPSILON) remaining.push(outside);
        inside = clip(inside, a, b, true);
      }
    }
    pieces = remaining;
  }
  return pieces;
}
