import type { Point2 } from "./geometry";
import { beamFootprint, columnFootprint, type BuildingStructure } from "./building-structure";
import type { DxfOverlay, SvgPlanOverlayPolygon } from "./export-plan";

export const STRUCTURAL_DXF_LAYERS = {
  COLUMNS: "STRUCT_COLUMNS",
  BEAMS: "STRUCT_BEAMS",
  NOTE: "STRUCT_NOTE",
} as const;

export type StructuralFloorOverlays = {
  svg: SvgPlanOverlayPolygon[];
  dxf: DxfOverlay;
  columns: number;
  beams: number;
};

function outline(layer: string, points: Point2[]): DxfOverlay["entities"] {
  return points.map((start, index) => ({
    type: "line" as const,
    layer,
    start,
    end: points[(index + 1) % points.length]!,
  }));
}

/** Floor-specific coordination overlay from the same authored members used by OBJ. */
export function buildStructuralFloorOverlays(structure: BuildingStructure, floorId: string, site: Point2[]): StructuralFloorOverlays {
  const svg: SvgPlanOverlayPolygon[] = [];
  const entities: DxfOverlay["entities"] = [];
  const columns = new Map(structure.columns.map((column) => [column.id, column]));
  for (const column of structure.columns) {
    const footprint = columnFootprint(column);
    svg.push({ id: `column-${column.id}`, kind: "column", points: footprint });
    entities.push(...outline(STRUCTURAL_DXF_LAYERS.COLUMNS, footprint));
    entities.push({ type: "text", layer: STRUCTURAL_DXF_LAYERS.COLUMNS,
      position: { x: column.position.x + column.width / 2 + 0.1, y: column.position.y }, height: 0.2, text: column.id.toUpperCase() });
  }
  const floorBeams = structure.beams.filter((beam) => beam.floorId === floorId);
  for (const beam of floorBeams) {
    const from = columns.get(beam.fromColumnId)!;
    const to = columns.get(beam.toColumnId)!;
    const footprint = beamFootprint(beam, from.position, to.position);
    svg.push({ id: `beam-${beam.id}`, kind: "beam", points: footprint });
    entities.push(...outline(STRUCTURAL_DXF_LAYERS.BEAMS, footprint));
    entities.push({ type: "text", layer: STRUCTURAL_DXF_LAYERS.BEAMS,
      position: { x: (from.position.x + to.position.x) / 2, y: (from.position.y + to.position.y) / 2 },
      height: 0.2, text: beam.id.toUpperCase() });
  }
  const minX = Math.min(...site.map((point) => point.x));
  const minY = Math.min(...site.map((point) => point.y));
  entities.push({ type: "text", layer: STRUCTURAL_DXF_LAYERS.NOTE,
    position: { x: minX + 0.2, y: minY + 0.2 }, height: 0.18,
    text: "COORDINATION ONLY - NOT FOR CONSTRUCTION" });
  return {
    svg,
    dxf: { layers: Object.values(STRUCTURAL_DXF_LAYERS), entities },
    columns: structure.columns.length,
    beams: floorBeams.length,
  };
}
