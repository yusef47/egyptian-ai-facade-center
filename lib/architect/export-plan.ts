import type { Opening, ProjectGeometry, Wall } from "./geometry";
import { GEOMETRY_MODEL_VERSION, polygonArea, wallLength } from "./geometry";

/**
 * Deterministic 2D exports derived from project geometry:
 * an SVG plan (screen Y-down) and a layered AC1009 DXF (CAD Y-up).
 * Fully independent of the image-to-DXF tracing pipeline in client/src/lib/dxf.ts.
 */

const SVG_STROKE_WIDTH = 0.08; // meters
const DXF_DECIMALS = 2;

type SvgPoint = { x: number; y: number };

function formatNumber(value: number, decimals = 2): string {
  const fixed = value.toFixed(decimals);
  return fixed.replace(/\.?0+$/, "") || "0";
}

function pointsToSvg(points: SvgPoint[]): string {
  return points.map((point) => `${formatNumber(point.x)},${formatNumber(point.y)}`).join(" ");
}

/**
 * XML-escapes user-controlled IDs and text at the serialization boundary.
 * Defense in depth: even if an unsafe ID slips past the generator's
 * idPrefix contract, quotes and angle brackets cannot break SVG attributes
 * or inject markup into text nodes.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type SvgPlanOptions = {
  /** Margins around the plan in meters. */
  margin?: number;
  /** Visible labels only; geometry and the CAD export remain language-neutral. */
  locale?: "ar" | "en";
  /** Keep planning-cell labels out of a detailed room overlay. */
  showSpaceLabels?: boolean;
  /** Semantic concept coloring, constrained to literal six-digit hex colors. */
  spaceFills?: Record<string, string>;
  /** Irregular cells show nominal polygon area instead of bbox width × depth. */
  spaceLabelMetric?: "bounds" | "area";
  /** Optional authored coordination shapes in the same world coordinates as the plan. */
  structuralOverlay?: SvgPlanOverlayPolygon[];
  /** Authored stair concept shapes, independent of the structural-grid toggle. */
  stairOverlay?: SvgPlanOverlayPolygon[];
};

export type SvgPlanOverlayPolygon = {
  id: string;
  kind: "column" | "beam" | "stair";
  points: SvgPoint[];
};

/** Place labels inside concave cells instead of at a bbox center in a notch. */
function labelAnchor(points: SvgPoint[]): SvgPoint {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  const inside = (point: SvgPoint): boolean => {
    let result = false;
    for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
      const a = points[previous]!;
      const b = points[index]!;
      if ((a.y > point.y) !== (b.y > point.y)
          && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  };
  const distanceToEdge = (point: SvgPoint, a: SvgPoint, b: SvgPoint): number => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1,
      ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
  };
  let best: SvgPoint | null = null;
  let bestScore = -Infinity;
  const resolution = 21;
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const candidate = {
        x: minX + ((column + 0.5) / resolution) * (maxX - minX),
        y: minY + ((row + 0.5) / resolution) * (maxY - minY),
      };
      if (!inside(candidate)) continue;
      const clearance = Math.min(...points.map((a, index) =>
        distanceToEdge(candidate, a, points[(index + 1) % points.length]!)));
      const score = clearance - Math.hypot(candidate.x - center.x, candidate.y - center.y) * 1e-5;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best ?? center;
}

export function visibleSpaceLabel(id: string, name: string, locale: "ar" | "en", width: number): string {
  if (/(?:^|-)space-unit-a$/.test(id)) return locale === "ar" ? "الوحدة أ" : "UNIT A";
  if (/(?:^|-)space-unit-b$/.test(id)) return locale === "ar" ? "الوحدة ب" : "UNIT B";
  if (/(?:^|-)space-core$/.test(id)) return locale === "ar" ? "النواة" : "CORE";
  const shortName = name.split("—")[0]?.trim() || name;
  const maxChars = Math.max(4, Math.floor(width * 2.4));
  return shortName.length > maxChars ? `${shortName.slice(0, maxChars - 1)}…` : shortName;
}

/** Builds a dimensionally consistent SVG plan (1 SVG unit = 1 meter). */
export function buildSvgPlan(geometry: ProjectGeometry, options: SvgPlanOptions = {}): string {
  const margin = options.margin ?? 1;
  const locale = options.locale ?? "en";
  const xs = geometry.site.polygon.points.map((point) => point.x);
  const ys = geometry.site.polygon.points.map((point) => point.y);
  // Compute the site extent FIRST, then pad the viewBox around it so the SVG
  // origin is always (0,0) regardless of where the site sits in world space.
  const siteMinX = Math.min(...xs);
  const siteMinY = Math.min(...ys);
  const siteMaxX = Math.max(...xs);
  const siteMaxY = Math.max(...ys);
  const width = siteMaxX - siteMinX + 2 * margin;
  const height = siteMaxY - siteMinY + 2 * margin;
  // SVG Y-down: world Y is flipped around the site's max Y, then translated so
  // the padded viewBox starts at (0,0). Works for sites at any coordinate origin.
  const map = (point: SvgPoint): SvgPoint => ({
    x: point.x - siteMinX + margin,
    y: siteMaxY - point.y + margin,
  });

  const layers: string[] = [];

  layers.push(`<g id="site"><polygon points="${pointsToSvg(geometry.site.polygon.points.map(map))}" fill="none" stroke="#8a9b9f" stroke-width="${formatNumber(SVG_STROKE_WIDTH)}"/></g>`);

  const spacesSvg = geometry.spaces
    .map((space) => {
      const requestedFill = options.spaceFills?.[space.id];
      const fill = requestedFill && /^#[0-9a-fA-F]{6}$/.test(requestedFill)
        ? requestedFill
        : space.id.endsWith("space-core")
        ? "#dce9e7"
        : space.id.endsWith("space-unit-b")
          ? "#f2eadb"
          : "#e8f1f1";
      return `<polygon id="${escapeXml(space.id)}" data-name="${escapeXml(space.name)}" points="${pointsToSvg(space.polygon.points.map(map))}" fill="${fill}" stroke="#21353b" stroke-width="${formatNumber(SVG_STROKE_WIDTH)}"/>`;
    })
    .join("");
  layers.push(`<g id="spaces">${spacesSvg}</g>`);

  const wallsSvg = geometry.walls
    .map((wall) => `<line id="${escapeXml(wall.id)}" x1="${formatNumber(map(wall.start).x)}" y1="${formatNumber(map(wall.start).y)}" x2="${formatNumber(map(wall.end).x)}" y2="${formatNumber(map(wall.end).y)}" stroke="#172b31" stroke-width="${formatNumber(Math.max(wall.thickness, SVG_STROKE_WIDTH))}"/>`)
    .join("");
  layers.push(`<g id="walls">${wallsSvg}</g>`);

  const openingsSvg = geometry.openings
    .map((opening) => {
      const wall = geometry.walls.find((candidate) => candidate.id === opening.wallId);
      if (!wall) return "";
      const span = wallLength(wall);
      const clampedStart = Math.max(0, Math.min(opening.offset, span));
      const clampedEnd = Math.max(0, Math.min(opening.offset + opening.width, span));
      if (clampedEnd <= clampedStart) return "";
      const ratioStart = clampedStart / span;
      const ratioEnd = clampedEnd / span;
      const start: SvgPoint = {
        x: wall.start.x + (wall.end.x - wall.start.x) * ratioStart,
        y: wall.start.y + (wall.end.y - wall.start.y) * ratioStart,
      };
      const end: SvgPoint = {
        x: wall.start.x + (wall.end.x - wall.start.x) * ratioEnd,
        y: wall.start.y + (wall.end.y - wall.start.y) * ratioEnd,
      };
      const color = opening.kind === "door" ? "#b78135" : "#2f8593";
      return `<line id="${escapeXml(opening.id)}" data-kind="${escapeXml(opening.kind)}" x1="${formatNumber(map(start).x)}" y1="${formatNumber(map(start).y)}" x2="${formatNumber(map(end).x)}" y2="${formatNumber(map(end).y)}" stroke="${color}" stroke-width="${formatNumber(Math.max(wall.thickness, SVG_STROKE_WIDTH) + 0.06)}"/>`;
    })
    .join("");
  layers.push(`<g id="openings">${openingsSvg}</g>`);

  const dimensions = geometry.spaces
    .map((space) => {
      const xsSpace = space.polygon.points.map((point) => point.x);
      const ysSpace = space.polygon.points.map((point) => point.y);
      const w = Math.max(...xsSpace) - Math.min(...xsSpace);
      const d = Math.max(...ysSpace) - Math.min(...ysSpace);
      const center: SvgPoint = map(labelAnchor(space.polygon.points));
      const label = visibleSpaceLabel(space.id, space.name, locale, w);
      const nameSize = Math.min(0.8, Math.max(0.52, w / 5));
      const nameY = center.y - 0.18;
      const sizeY = center.y + 0.48;
      const dimensionsText = options.spaceLabelMetric === "area"
        ? locale === "ar"
          ? `${formatNumber(polygonArea(space.polygon))} م²`
          : `${formatNumber(polygonArea(space.polygon))} m²`
        : locale === "ar"
          ? `${formatNumber(w)} × ${formatNumber(d)} م`
          : `${formatNumber(w)} × ${formatNumber(d)} m`;
      return `<g data-space-label="${escapeXml(space.id)}"><text x="${formatNumber(center.x)}" y="${formatNumber(nameY)}" font-family="Cairo, Tahoma, sans-serif" font-size="${formatNumber(nameSize)}" font-weight="700" text-anchor="middle" fill="#172b31">${escapeXml(label)}</text><text x="${formatNumber(center.x)}" y="${formatNumber(sizeY)}" font-family="Arial, sans-serif" font-size="0.42" text-anchor="middle" fill="#61747a">${escapeXml(dimensionsText)}</text></g>`;
    })
    .join("");
  layers.push(`<g id="dimensions">${options.showSpaceLabels === false ? "" : dimensions}</g>`);

  if (options.structuralOverlay?.length) {
    const members = options.structuralOverlay.map((member) => {
      const color = member.kind === "column" ? "#8064a6" : "#ad791d";
      return `<polygon id="struct-${escapeXml(member.id)}" data-structural-kind="${member.kind}" points="${pointsToSvg(member.points.map(map))}" fill="${color}" fill-opacity="${member.kind === "column" ? "0.52" : "0.26"}" stroke="${color}" stroke-width="0.09"/>`;
    }).join("");
    layers.push(`<g id="structural-coordination" data-status="coordination-only">${members}</g>`);
  }
  if (options.stairOverlay?.length) {
    const parts = options.stairOverlay.map((member) =>
      `<polygon id="${escapeXml(member.id)}" data-stair-kind="${member.id.includes("landing") ? "landing" : "tread"}" points="${pointsToSvg(member.points.map(map))}" fill="#66c6b8" fill-opacity="0.28" stroke="#257f73" stroke-width="0.06"/>`).join("");
    layers.push(`<g id="stair-concept" data-status="coordination-only">${parts}</g>`);
  }

  return [
    // No width/height attributes: unitless numbers would mean pixels in a
    // downloaded file ("14m" is not a valid length and made browsers log
    // errors). The viewBox alone drives intrinsic size in every context —
    // inline it fills the container, standalone it scales to the default.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${formatNumber(width)} ${formatNumber(height)}" data-schema-version="${GEOMETRY_MODEL_VERSION}" data-units="meters">`,
    ...layers,
    `</svg>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Layered DXF export (AC1009, LINE entities, named layers)
// ---------------------------------------------------------------------------

export const DXF_LAYERS = {
  SITE: "SITE_BOUNDARY",
  WALLS: "WALLS",
  SPACES: "SPACE_LABELS",
  DOORS: "DOORS",
  WINDOWS: "WINDOWS",
  DIMENSIONS: "DIMENSIONS",
} as const;

export type DxfOverlayEntity =
  | { type: "line"; layer: string; start: SvgPoint; end: SvgPoint }
  | { type: "text"; layer: string; position: SvgPoint; height: number; text: string };
export type DxfOverlay = { layers: string[]; entities: DxfOverlayEntity[] };

const fmtCode = (code: number): string => code.toString().padStart(3, " ");

/** DXF is Y-up like the geometry model; only a translation is applied. */
function toDxfPoint(point: SvgPoint, minX: number, minY: number): SvgPoint {
  return { x: point.x - minX, y: point.y - minY };
}

function dxfLine(layer: string, start: SvgPoint, end: SvgPoint): string[] {
  const fixed = (value: number): string => value.toFixed(DXF_DECIMALS);
  return [
    fmtCode(0), "LINE",
    fmtCode(8), layer,
    fmtCode(10), fixed(start.x),
    fmtCode(20), fixed(start.y),
    fmtCode(11), fixed(end.x),
    fmtCode(21), fixed(end.y),
  ];
}

/**
 * Sanitizes a value written as a DXF TEXT group (code 1). CR/LF and other
 * control characters would split the value across lines and break the
 * group-code pair structure, so runs of them collapse to one space.
 */
function sanitizeDxfText(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]+/g, " ");
}

function dxfText(layer: string, position: SvgPoint, height: number, text: string): string[] {
  const fixed = (value: number): string => value.toFixed(DXF_DECIMALS);
  return [
    fmtCode(0), "TEXT",
    fmtCode(8), layer,
    fmtCode(10), fixed(position.x),
    fmtCode(20), fixed(position.y),
    fmtCode(40), fixed(height),
    fmtCode(1), sanitizeDxfText(text),
  ];
}

/** Projects an opening onto its wall as a DXF segment. */
function openingSegment(opening: Opening, wall: Wall): { start: SvgPoint; end: SvgPoint } | null {
  const span = wallLength(wall);
  const clampedStart = Math.max(0, Math.min(opening.offset, span));
  const clampedEnd = Math.max(0, Math.min(opening.offset + opening.width, span));
  if (clampedEnd <= clampedStart) return null;
  const ratioStart = clampedStart / span;
  const ratioEnd = clampedEnd / span;
  return {
    start: {
      x: wall.start.x + (wall.end.x - wall.start.x) * ratioStart,
      y: wall.start.y + (wall.end.y - wall.start.y) * ratioStart,
    },
    end: {
      x: wall.start.x + (wall.end.x - wall.start.x) * ratioEnd,
      y: wall.start.y + (wall.end.y - wall.start.y) * ratioEnd,
    },
  };
}

/** Builds a layered AC1009 DXF plan from project geometry. */
export function buildDxfPlan(geometry: ProjectGeometry, overlay?: DxfOverlay): string {
  const extraLayers = overlay?.layers ?? [];
  const knownLayers = new Set([...Object.values(DXF_LAYERS), ...extraLayers]);
  if (knownLayers.size !== Object.values(DXF_LAYERS).length + extraLayers.length ||
      extraLayers.some((layer) => !/^[A-Z][A-Z0-9_]{0,30}$/.test(layer)) ||
      overlay?.entities.some((entity) => !knownLayers.has(entity.layer))) {
    throw new Error("Invalid DXF overlay layers");
  }
  const xs = geometry.site.polygon.points.map((point) => point.x);
  const ys = geometry.site.polygon.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  const pairs: string[] = [
    fmtCode(0), "SECTION",
    fmtCode(2), "HEADER",
    fmtCode(9), "$ACADVER", fmtCode(1), "AC1009",
    fmtCode(9), "$EXTMIN", fmtCode(10), "0.0", fmtCode(20), "0.0",
    fmtCode(9), "$EXTMAX", fmtCode(10), (maxX - minX).toFixed(DXF_DECIMALS), fmtCode(20), (maxY - minY).toFixed(DXF_DECIMALS),
    fmtCode(0), "ENDSEC",
    fmtCode(0), "SECTION",
    fmtCode(2), "TABLES",
    fmtCode(0), "TABLE", fmtCode(2), "LTYPE", fmtCode(70), "1",
    fmtCode(0), "LTYPE", fmtCode(2), "CONTINUOUS", fmtCode(70), "0", fmtCode(3), "Solid line", fmtCode(72), "65", fmtCode(73), "0", fmtCode(40), "0.0",
    fmtCode(0), "ENDTAB",
    fmtCode(0), "TABLE", fmtCode(2), "LAYER", fmtCode(70), String(knownLayers.size),
    ...[...knownLayers].flatMap((layer) => [
      fmtCode(0), "LAYER",
      fmtCode(2), layer,
      fmtCode(70), "0",
      fmtCode(62), "7",
      fmtCode(6), "CONTINUOUS",
    ]),
    fmtCode(0), "ENDTAB",
    fmtCode(0), "ENDSEC",
    fmtCode(0), "SECTION",
    fmtCode(2), "ENTITIES",
  ];

  // Site boundary as a closed polyline of LINEs.
  const sitePoints = geometry.site.polygon.points.map((point) => toDxfPoint(point, minX, minY));
  for (let index = 0; index < sitePoints.length; index += 1) {
    const start = sitePoints[index]!;
    const end = sitePoints[(index + 1) % sitePoints.length]!;
    pairs.push(...dxfLine(DXF_LAYERS.SITE, start, end));
  }

  for (const wall of geometry.walls) {
    pairs.push(...dxfLine(DXF_LAYERS.WALLS, toDxfPoint(wall.start, minX, minY), toDxfPoint(wall.end, minX, minY)));
  }

  for (const opening of geometry.openings) {
    const wall = geometry.walls.find((candidate) => candidate.id === opening.wallId);
    if (!wall) continue;
    const segment = openingSegment(opening, wall);
    if (!segment) continue;
    const layer = opening.kind === "door" ? DXF_LAYERS.DOORS : DXF_LAYERS.WINDOWS;
    pairs.push(...dxfLine(layer, toDxfPoint(segment.start, minX, minY), toDxfPoint(segment.end, minX, minY)));
  }

  for (const space of geometry.spaces) {
    const xsSpace = space.polygon.points.map((point) => point.x);
    const ysSpace = space.polygon.points.map((point) => point.y);
    const center: SvgPoint = {
      x: (Math.min(...xsSpace) + Math.max(...xsSpace)) / 2 - minX,
      y: (Math.min(...ysSpace) + Math.max(...ysSpace)) / 2 - minY,
    };
    pairs.push(...dxfText(DXF_LAYERS.SPACES, center, 0.3, space.name));
  }

  for (const entity of overlay?.entities ?? []) {
    if (entity.type === "line") {
      pairs.push(...dxfLine(entity.layer, toDxfPoint(entity.start, minX, minY), toDxfPoint(entity.end, minX, minY)));
    } else {
      pairs.push(...dxfText(entity.layer, toDxfPoint(entity.position, minX, minY), entity.height, entity.text));
    }
  }

  pairs.push(
    fmtCode(0), "ENDSEC",
    fmtCode(0), "EOF",
  );

  return `${pairs.join("\n")}\n`;
}
