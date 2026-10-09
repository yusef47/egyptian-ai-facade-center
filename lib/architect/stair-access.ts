import type { Point2 } from "./geometry";
import { pointInPolygon } from "./validate";

/**
 * Conservative plan-view precheck for a 0.4 m wide moving point.
 * This is intentionally not a clear-width, egress or headroom certification.
 */
export type CoreWalkingSupport = { base: boolean; voids: Point2[][]; bridges: Point2[][] };

export function hasCoreWalkingPath(
  core: Point2[], obstacle: Point2[], from: Point2, to: Point2,
  support: CoreWalkingSupport = { base: true, voids: [], bridges: [] },
): boolean {
  const xs = core.map((point) => point.x);
  const ys = core.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const depth = Math.max(...ys) - minY;
  const step = Math.max(0.1, Math.sqrt(width * depth / 36_000));
  const columns = Math.ceil(width / step);
  const rows = Math.ceil(depth / step);
  if (!columns || !rows || columns * rows > 50_000) return false;
  const radius = 0.2;
  const offsets = [
    { x: 0, y: 0 }, { x: radius, y: 0 }, { x: -radius, y: 0 },
    { x: 0, y: radius }, { x: 0, y: -radius },
    { x: radius * 0.707, y: radius * 0.707 },
    { x: radius * 0.707, y: -radius * 0.707 },
    { x: -radius * 0.707, y: radius * 0.707 },
    { x: -radius * 0.707, y: -radius * 0.707 },
  ];
  const center = (column: number, row: number): Point2 => ({
    x: minX + (column + 0.5) * width / columns,
    y: minY + (row + 0.5) * depth / rows,
  });
  const clear = (point: Point2): boolean => offsets.every((offset) => {
    const sample = { x: point.x + offset.x, y: point.y + offset.y };
    const supported = (support.base && !support.voids.some((voidPolygon) => pointInPolygon(sample, voidPolygon)))
      || support.bridges.some((bridge) => pointInPolygon(sample, bridge));
    return pointInPolygon(sample, core) && supported && !pointInPolygon(sample, obstacle);
  });
  const clearLink = (start: Point2, end: Point2): boolean => {
    const samples = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / (step / 2)));
    for (let index = 0; index <= samples; index += 1) {
      const t = index / samples;
      if (!clear({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t })) return false;
    }
    return true;
  };
  if (!clear(from) || !clear(to)) return false;
  const count = columns * rows;
  const open = new Uint8Array(count);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const point = center(column, row);
      open[row * columns + column] = clear(point) ? 1 : 0;
    }
  }
  const nearest = (point: Point2): number => {
    let best = -1;
    let distance = 0.35 ** 2;
    const column = Math.floor((point.x - minX) / width * columns);
    const row = Math.floor((point.y - minY) / depth * rows);
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = column + dx;
        const y = row + dy;
        if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
        const index = y * columns + x;
        if (!open[index]) continue;
        const cell = center(x, y);
        const squared = (cell.x - point.x) ** 2 + (cell.y - point.y) ** 2;
        if (squared < distance && clearLink(point, cell)) { best = index; distance = squared; }
      }
    }
    return best;
  };
  const start = nearest(from);
  const target = nearest(to);
  if (start < 0 || target < 0) return false;
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  visited[start] = 1;
  while (head < tail) {
    const current = queue[head++]!;
    if (current === target) return true;
    const column = current % columns;
    const row = Math.floor(current / columns);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = column + dx!;
      const y = row + dy!;
      if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
      const next = y * columns + x;
      if (open[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
    }
  }
  return false;
}
