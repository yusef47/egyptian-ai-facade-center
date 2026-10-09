import type { Point2 } from "./geometry";
import type { BuildingStair } from "./building-stair";
import type { DxfOverlay, SvgPlanOverlayPolygon } from "./export-plan";

export const STAIR_DXF_LAYERS = { TREADS: "STAIR_TREADS", LANDINGS: "STAIR_LANDINGS", NOTE: "STAIR_NOTE" } as const;

function rectangle(stair: BuildingStair, from: number, to: number): Point2[] {
  const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
  const ux = (stair.end.x - stair.start.x) / length;
  const uy = (stair.end.y - stair.start.y) / length;
  const nx = -uy * stair.width / 2;
  const ny = ux * stair.width / 2;
  const a = { x: stair.start.x + ux * from, y: stair.start.y + uy * from };
  const b = { x: stair.start.x + ux * to, y: stair.start.y + uy * to };
  return [
    { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny },
    { x: b.x + nx, y: b.y + ny }, { x: a.x + nx, y: a.y + ny },
  ];
}

function outline(points: Point2[], layer: string): DxfOverlay["entities"] {
  return points.map((start, index) => ({ type: "line" as const, layer,
    start, end: points[(index + 1) % points.length]! }));
}

/** The same authored stair used by OBJ, projected onto each connected floor. */
export function buildStairFloorOverlay(stairs: BuildingStair[], floorId: string): {
  svg: SvgPlanOverlayPolygon[];
  dxf: DxfOverlay;
  treads: number;
} {
  const svg: SvgPlanOverlayPolygon[] = [];
  const entities: DxfOverlay["entities"] = [];
  let treads = 0;
  for (const stair of stairs.filter((item) => item.lowerFloorId === floorId || item.upperFloorId === floorId)) {
    const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
    const step = length / (stair.risers - 1);
    const parts = [
      { id: `stair-${stair.id}-lower-landing`, points: rectangle(stair, -stair.landingLength, 0), layer: STAIR_DXF_LAYERS.LANDINGS },
      ...Array.from({ length: stair.risers - 1 }, (_, index) => ({
        id: `stair-${stair.id}-tread-${index + 1}`,
        points: rectangle(stair, index * step, (index + 1) * step), layer: STAIR_DXF_LAYERS.TREADS,
      })),
      { id: `stair-${stair.id}-upper-landing`, points: rectangle(stair, length, length + stair.landingLength), layer: STAIR_DXF_LAYERS.LANDINGS },
    ];
    for (const part of parts) {
      svg.push({ id: part.id, kind: "stair", points: part.points });
      entities.push(...outline(part.points, part.layer));
    }
    treads += stair.risers - 1;
    entities.push({ type: "text", layer: STAIR_DXF_LAYERS.NOTE,
      position: stair.start, height: 0.18, text: `${stair.id.toUpperCase()} CONCEPT STAIR - VERIFY HEADROOM AND CODE` });
  }
  return { svg, dxf: { layers: Object.values(STAIR_DXF_LAYERS), entities }, treads };
}
