import type { ProjectGeometry } from "./geometry";
import { visibleSpaceLabel } from "./export-plan";

/** Illustrative one-level block massing, derived from the same validated plan. */
type Point = { x: number; y: number };

const HEIGHT = 2.8;

function number(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function project(point: Point, height = 0): Point {
  return { x: point.x - point.y, y: (point.x + point.y) * 0.54 - height * 1.3 };
}

function path(points: Point[], offsetX: number, offsetY: number): string {
  return points.map((point) => `${number(point.x + offsetX)},${number(point.y + offsetY)}`).join(" ");
}

export function buildMassingSvg(geometry: ProjectGeometry, locale: "ar" | "en" = "en"): string {
  const site = geometry.site.polygon.points.map((point) => project(point));
  const projected = [
    ...site,
    ...geometry.spaces.flatMap((space) => space.polygon.points.flatMap((point) => [project(point), project(point, HEIGHT)])),
  ];
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const margin = 3;
  const offsetX = -minX + margin;
  const offsetY = -minY + margin;
  const width = maxX - minX + margin * 2;
  const height = maxY - minY + margin * 2;

  const palette = [
    { top: "#d8e9e8", side: "#7ca7a8", edge: "#88cbca" },
    { top: "#f1e3c9", side: "#b9a277", edge: "#edc875" },
    { top: "#c3d8d5", side: "#6f9692", edge: "#9ec5ba" },
  ];
  const sortedSpaces = [...geometry.spaces].sort((a, b) => {
    const depth = (points: Point[]) => Math.max(...points.map((point) => point.x + point.y));
    return depth(a.polygon.points) - depth(b.polygon.points);
  });

  const blocks = sortedSpaces.map((space) => {
    const points = space.polygon.points;
    const top = points.map((point) => project(point, HEIGHT));
    const ground = points.map((point) => project(point));
    const color = space.id.endsWith("space-core") ? palette[2]! : space.id.endsWith("space-unit-b") ? palette[1]! : palette[0]!;
    const sides = points.map((_, index) => {
      const next = (index + 1) % points.length;
      return `<polygon points="${path([top[index]!, top[next]!, ground[next]!, ground[index]!], offsetX, offsetY)}" fill="${color.side}" stroke="#243e43" stroke-width="0.07"/>`;
    }).join("");
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const center = project({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }, HEIGHT);
    const shortLabel = visibleSpaceLabel(space.id, space.name, locale, Math.max(...xs) - Math.min(...xs));
    return `<g data-massing-space="${escapeXml(space.id)}">${sides}<polygon points="${path(top, offsetX, offsetY)}" fill="${color.top}" stroke="${color.edge}" stroke-width="0.12"/><text x="${number(center.x + offsetX)}" y="${number(center.y + offsetY)}" text-anchor="middle" dominant-baseline="middle" font-family="Cairo, Tahoma, sans-serif" font-size="0.75" font-weight="700" fill="#183038">${escapeXml(shortLabel)}</text></g>`;
  }).join("");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${number(width)} ${number(height)}" data-preview="concept-massing" data-units="meters">`,
    `<polygon points="${path(site, offsetX, offsetY)}" fill="#1d3439" stroke="#b99a55" stroke-width="0.12"/>`,
    blocks,
    `</svg>`,
  ].join("\n");
}
