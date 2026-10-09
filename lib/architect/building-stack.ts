import type { Point2 } from "./geometry";
import type { CompiledDesign } from "./building-proposal";
import { CONCEPT_KIND_LABELS } from "./concept-proposal";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;
type Projected = { x: number; y: number };

function format(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "") || "0";
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function rotate(point: Point2, quarterTurns: 0 | 1 | 2 | 3): Point2 {
  switch (quarterTurns) {
    case 1: return { x: -point.y, y: point.x };
    case 2: return { x: -point.x, y: -point.y };
    case 3: return { x: point.y, y: -point.x };
    default: return point;
  }
}

/** Orthographic projection of authored plan coordinates and floor elevations. */
function project(point: Point2, elevation: number, quarterTurns: 0 | 1 | 2 | 3): Projected {
  const turned = rotate(point, quarterTurns);
  return { x: turned.x - turned.y, y: (turned.x + turned.y) * 0.52 - elevation * 1.35 };
}

function polygon(points: Projected[], dx: number, dy: number): string {
  return points.map((point) => `${format(point.x + dx)},${format(point.y + dy)}`).join(" ");
}

/**
 * A stacked FLOOR-PLATE view. No story height, slab thickness, wall volume or
 * staircase geometry is inferred: each surface lies at its authored elevation.
 */
export function buildBuildingStackSvg(
  building: Building,
  selectedFloorId: string,
  quarterTurns: 0 | 1 | 2 | 3 = 0,
): string {
  const projected = building.floors.flatMap((floor) => [
    ...floor.geometry.site.polygon.points.map((point) => project(point, floor.elevation, quarterTurns)),
    ...floor.geometry.spaces.flatMap((space) =>
      space.polygon.points.map((point) => project(point, floor.elevation, quarterTurns))),
  ]);
  const siteAtDatum = building.floors[0]!.geometry.site.polygon.points
    .map((point) => project(point, 0, quarterTurns));
  projected.push(...siteAtDatum);
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const margin = 3;
  const legendHeight = building.floors.length * 1.35 + 0.8;
  const dx = margin - minX;
  const dy = margin + legendHeight - minY;
  const width = Math.max(32, maxX - minX + margin * 2);
  const height = maxY - minY + margin * 2 + legendHeight;
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${format(width)} ${format(height)}" data-preview="building-stack" data-status="illustrative">`,
    `<g data-stack-legend="true">`,
    ...building.floors.map((floor, index) => {
      const selected = floor.id === selectedFloorId;
      const y = 1.45 + index * 1.35;
      return `<g data-legend-floor="${xml(floor.id)}"><line x1="0.55" y1="${format(y - 0.32)}" x2="1.3" y2="${format(y - 0.32)}" stroke="${selected ? "#e7c76b" : "#64818a"}" stroke-width="0.22"/><text x="1.65" y="${format(y)}" font-family="Cairo,Tahoma,sans-serif" font-size="1.05" font-weight="700" fill="${selected ? "#f4d47a" : "#a8b9bd"}">${xml(floor.name)} · ${format(floor.elevation)} m</text></g>`;
    }),
    `</g>`,
    `<polygon data-site-datum="true" points="${polygon(siteAtDatum, dx, dy)}" fill="none" stroke="#b59a56" stroke-width="0.12" stroke-dasharray="0.28 0.18"/>`,
  ];

  const core = building.proposal.floors[0]!.plan.cells.find((cell) => cell.id === building.proposal.coreCellId)!;
  for (let floorIndex = 0; floorIndex < building.floors.length - 1; floorIndex += 1) {
    const lower = building.floors[floorIndex]!;
    const upper = building.floors[floorIndex + 1]!;
    for (const point of core.points) {
      const from = project(point, lower.elevation, quarterTurns);
      const to = project(point, upper.elevation, quarterTurns);
      parts.push(`<line data-vertical-core="${xml(lower.id)}-${xml(upper.id)}" x1="${format(from.x + dx)}" y1="${format(from.y + dy)}" x2="${format(to.x + dx)}" y2="${format(to.y + dy)}" stroke="#d4af37" stroke-opacity="0.65" stroke-width="0.09" stroke-dasharray="0.18 0.12"/>`);
    }
  }

  // Paint the selected plate last so it stays legible behind other levels.
  const paintOrder = [
    ...building.floors.filter((floor) => floor.id !== selectedFloorId),
    ...building.floors.filter((floor) => floor.id === selectedFloorId),
  ];
  for (const floor of paintOrder) {
    const selected = floor.id === selectedFloorId;
    const levelSite = floor.geometry.site.polygon.points.map((point) => project(point, floor.elevation, quarterTurns));
    parts.push(`<g data-stack-floor="${xml(floor.id)}" data-selected="${selected}">`);
    parts.push(`<polygon data-floor-plate="${xml(floor.id)}" points="${polygon(levelSite, dx, dy)}" fill="#142a30" fill-opacity="${selected ? "0.72" : "0.2"}" stroke="${selected ? "#e7c76b" : "#64818a"}" stroke-width="${selected ? "0.18" : "0.08"}"/>`);
    for (const space of floor.geometry.spaces) {
      const kind = floor.plan.cells.find((cell) => cell.id === space.id)?.kind ?? "other";
      const face = space.polygon.points.map((point) => project(point, floor.elevation, quarterTurns));
      parts.push(`<polygon data-stack-space="${xml(floor.id)}:${xml(space.id)}" points="${polygon(face, dx, dy)}" fill="${CONCEPT_KIND_LABELS[kind].fill}" fill-opacity="${selected ? "0.9" : "0.28"}" stroke="${selected ? "#17353a" : "#8ba3a7"}" stroke-width="${selected ? "0.11" : "0.05"}"/>`);
    }
    parts.push("</g>");
  }
  parts.push("</svg>");
  return parts.join("\n");
}
