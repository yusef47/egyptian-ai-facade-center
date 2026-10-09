import type { Point2, Polygon, ProjectGeometry } from "./geometry";
import { polygonArea } from "./geometry";
import { buildDxfPlan, buildSvgPlan, type DxfOverlay } from "./export-plan";

export type ConceptColumn = { id: string; position: Point2; floorId: string };
export type ConceptBeam = { id: string; fromColumnId: string; toColumnId: string; floorId: string };
export type ConceptSlab = { id: string; floorId: string; outline: Polygon };
export type StructuralConcept = {
  schemaVersion: 1;
  units: "meters";
  status: "coordination-only";
  floorId: string;
  columns: ConceptColumn[];
  beams: ConceptBeam[];
  slabs: ConceptSlab[];
  reviewRequired: string[];
};

function bounds(points: Point2[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
}

/**
 * A reference grid for coordination with the architectural concept.
 * Grid lines follow the site edges, unit division and core boundary. It
 * provides topology and stable element IDs, not a load-bearing design.
 * No material, section, footing, load, deflection or code adequacy is inferred.
 */
export function buildStructuralConcept(geometry: ProjectGeometry): StructuralConcept {
  const site = bounds(geometry.site.polygon.points);
  const core = geometry.spaces.find((space) => space.id.endsWith("-space-core"));
  const unitB = geometry.spaces.find((space) => space.id.endsWith("-space-unit-b"));
  if (!core || !unitB) throw new Error("Missing core or unit boundary for structural coordination");
  const coreBounds = bounds(core.polygon.points);
  const unitBBounds = bounds(unitB.polygon.points);
  const internalX = coreBounds.minX > site.minX + 1e-7 ? coreBounds.minX : coreBounds.maxX;
  const xs = uniqueSorted([site.minX, internalX, site.maxX]);
  const ys = uniqueSorted([site.minY, unitBBounds.maxY, site.maxY]);
  if (xs.length !== 3 || ys.length !== 3) throw new Error("Concept grid needs three distinct axes per direction");

  const floorId = geometry.floor.id;
  const columns: ConceptColumn[] = [];
  for (let yi = 0; yi < ys.length; yi += 1) {
    for (let xi = 0; xi < xs.length; xi += 1) {
      columns.push({ id: "column-" + xi + "-" + yi, position: { x: xs[xi]!, y: ys[yi]! }, floorId });
    }
  }
  const id = (xi: number, yi: number) => "column-" + xi + "-" + yi;
  const beams: ConceptBeam[] = [];
  for (let yi = 0; yi < ys.length; yi += 1) {
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      beams.push({ id: "beam-x-" + xi + "-" + yi, fromColumnId: id(xi, yi), toColumnId: id(xi + 1, yi), floorId });
    }
  }
  for (let xi = 0; xi < xs.length; xi += 1) {
    for (let yi = 0; yi < ys.length - 1; yi += 1) {
      beams.push({ id: "beam-y-" + xi + "-" + yi, fromColumnId: id(xi, yi), toColumnId: id(xi, yi + 1), floorId });
    }
  }
  return {
    schemaVersion: 1,
    units: "meters",
    status: "coordination-only",
    floorId,
    columns,
    beams,
    slabs: [{ id: "slab-" + floorId, floorId, outline: { points: geometry.site.polygon.points.map((point) => ({ ...point })) } }],
    reviewRequired: [
      "Architectural and geotechnical inputs",
      "Loads, materials, member sizing and foundations",
      "Structural analysis, detailing and applicable code review",
    ],
  };
}

/** Topology and geometry checks only; success does not imply structural safety. */
export function validateStructuralConcept(geometry: ProjectGeometry, scheme: StructuralConcept): string[] {
  const errors: string[] = [];
  if (scheme.status !== "coordination-only" || scheme.floorId !== geometry.floor.id) errors.push("Invalid concept status or floor reference");
  const columns = new Map(scheme.columns.map((column) => [column.id, column]));
  if (columns.size !== scheme.columns.length) errors.push("Duplicate column ID");
  const beamIds = new Set<string>();
  const connections = new Map(scheme.columns.map((column) => [column.id, 0]));
  for (const beam of scheme.beams) {
    if (beamIds.has(beam.id)) errors.push("Duplicate beam ID");
    beamIds.add(beam.id);
    const from = columns.get(beam.fromColumnId);
    const to = columns.get(beam.toColumnId);
    if (!from || !to || from.id === to.id) {
      errors.push("Invalid beam references");
      continue;
    }
    if (Math.hypot(from.position.x - to.position.x, from.position.y - to.position.y) < 1e-7) errors.push("Zero-length beam");
    connections.set(from.id, (connections.get(from.id) ?? 0) + 1);
    connections.set(to.id, (connections.get(to.id) ?? 0) + 1);
  }
  if ([...connections.values()].some((count) => count === 0)) errors.push("Disconnected column");
  if (scheme.slabs.length !== 1 || Math.abs(polygonArea(scheme.slabs[0]!.outline) - polygonArea(geometry.site.polygon)) > 0.001) {
    errors.push("Slab outline does not match the concept floor");
  }
  return errors;
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 2D coordination overlay; member widths and slab thickness are intentionally absent. */
export function buildStructuralSvg(geometry: ProjectGeometry, scheme: StructuralConcept, locale: "ar" | "en"): string {
  const errors = validateStructuralConcept(geometry, scheme);
  if (errors.length) throw new Error(errors.join("; "));
  const minX = Math.min(...geometry.site.polygon.points.map((point) => point.x));
  const maxY = Math.max(...geometry.site.polygon.points.map((point) => point.y));
  const map = (point: Point2) => ({ x: (point.x - minX + 1).toFixed(2), y: (maxY - point.y + 1).toFixed(2) });
  const columns = new Map(scheme.columns.map((column) => [column.id, column]));
  const parts: string[] = ['<g id="structural-concept" data-status="coordination-only">'];
  const slabPoints = scheme.slabs[0]!.outline.points.map((point) => {
    const mapped = map(point);
    return mapped.x + "," + mapped.y;
  }).join(" ");
  parts.push('<polygon data-slab="' + xml(scheme.slabs[0]!.id) + '" points="' + slabPoints + '" fill="#7051a8" fill-opacity="0.05" stroke="#7051a8" stroke-width="0.08" stroke-dasharray="0.28 0.13"/>');
  for (const beam of scheme.beams) {
    const start = map(columns.get(beam.fromColumnId)!.position);
    const end = map(columns.get(beam.toColumnId)!.position);
    parts.push('<line data-beam="' + xml(beam.id) + '" x1="' + start.x + '" y1="' + start.y + '" x2="' + end.x + '" y2="' + end.y + '" stroke="#7051a8" stroke-width="0.14" stroke-dasharray="0.28 0.13"/>');
  }
  for (const column of scheme.columns) {
    const point = map(column.position);
    parts.push('<rect data-column="' + xml(column.id) + '" x="' + (Number(point.x) - 0.17).toFixed(2) + '" y="' + (Number(point.y) - 0.17).toFixed(2) + '" width="0.34" height="0.34" fill="#614295" stroke="#ffffff" stroke-width="0.04"/>');
  }
  parts.push('<text x="1.3" y="1.4" font-size="0.3" font-family="Cairo,Tahoma,sans-serif" fill="#614295">' + (locale === "ar" ? "شبكة تنسيقية غير محسوبة" : "Unanalysed coordination grid") + '</text>');
  parts.push("</g>");
  return buildSvgPlan(geometry, { locale }).replace("</svg>", parts.join("") + "</svg>");
}

/** Separate CAD layers preserve the distinction between architecture and unanalysed structure. */
export function buildStructuralDxf(geometry: ProjectGeometry, scheme: StructuralConcept): string {
  const errors = validateStructuralConcept(geometry, scheme);
  if (errors.length) throw new Error(errors.join("; "));
  const columns = new Map(scheme.columns.map((column) => [column.id, column]));
  const overlay: DxfOverlay = {
    layers: ["STRUCT_COLUMNS", "STRUCT_BEAMS", "STRUCT_SLAB", "STRUCT_NOTES"],
    entities: [],
  };
  for (const slab of scheme.slabs) {
    for (let index = 0; index < slab.outline.points.length; index += 1) {
      overlay.entities.push({
        type: "line", layer: "STRUCT_SLAB",
        start: slab.outline.points[index]!,
        end: slab.outline.points[(index + 1) % slab.outline.points.length]!,
      });
    }
  }
  for (const beam of scheme.beams) {
    overlay.entities.push({
      type: "line", layer: "STRUCT_BEAMS",
      start: columns.get(beam.fromColumnId)!.position,
      end: columns.get(beam.toColumnId)!.position,
    });
  }
  for (const column of scheme.columns) {
    const { x, y } = column.position;
    // A crosshair marks the reference point; it is not a section size.
    overlay.entities.push({ type: "line", layer: "STRUCT_COLUMNS", start: { x: x - 0.12, y }, end: { x: x + 0.12, y } });
    overlay.entities.push({ type: "line", layer: "STRUCT_COLUMNS", start: { x, y: y - 0.12 }, end: { x, y: y + 0.12 } });
  }
  const first = geometry.site.polygon.points[0]!;
  overlay.entities.push({
    type: "text", layer: "STRUCT_NOTES", position: { x: first.x + 0.5, y: first.y + 0.5 },
    height: 0.25, text: "COORDINATION ONLY - NO ANALYSIS OR MEMBER SIZES",
  });
  return buildDxfPlan(geometry, overlay);
}
