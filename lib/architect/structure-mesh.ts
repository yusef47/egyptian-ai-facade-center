import type { Point2 } from "./geometry";
import type { CompiledDesign } from "./building-proposal";
import type { WallMeshPreset } from "./wall-mesh";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;
export type StructureMeshResult = {
  obj: string;
  columns: number;
  beams: number;
  vertices: number;
};

function coordinate(value: number): string {
  return (Math.abs(value) < 0.0000005 ? 0 : value).toFixed(6);
}

function prism(start: Point2, end: Point2, width: number, bottom: number, top: number, name: string, firstVertex: number): string {
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const nx = -(end.y - start.y) / length * width / 2;
  const ny = (end.x - start.x) / length * width / 2;
  const at = (point: Point2, side: -1 | 1, z: number) =>
    `v ${coordinate(point.x + nx * side)} ${coordinate(point.y + ny * side)} ${coordinate(z)}`;
  const vertices = [
    at(start, -1, bottom), at(end, -1, bottom), at(end, 1, bottom), at(start, 1, bottom),
    at(start, -1, top), at(end, -1, top), at(end, 1, top), at(start, 1, top),
  ];
  const faces = [
    [4, 3, 2, 1], [5, 6, 7, 8], [1, 2, 6, 5],
    [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8],
  ];
  return [`o ${name}`, ...vertices,
    ...faces.map((face) => `f ${face.map((index) => firstVertex + index - 1).join(" ")}`)].join("\n");
}

/** Solid coordination members from explicitly authored sections and nodes. */
export function buildBuildingStructureObj(building: Building, preset: WallMeshPreset, firstVertex = 1): StructureMeshResult {
  const structure = building.proposal.structure;
  if (!structure) return { obj: "", columns: 0, beams: 0, vertices: 0 };
  const lines = ["# Qattan AI authored structural coordination only; no loads, analysis, reinforcement, footings or code approval"];
  const columns = new Map(structure.columns.map((column) => [column.id, column]));
  let vertex = firstVertex;
  const base = building.floors[0]!.elevation;
  const roof = building.floors.at(-1)!.elevation + preset.roofRise;
  for (const column of structure.columns) {
    const start = { x: column.position.x - column.width / 2, y: column.position.y };
    const end = { x: column.position.x + column.width / 2, y: column.position.y };
    lines.push(prism(start, end, column.depth, base, roof, `struct-column-${column.id}`, vertex));
    vertex += 8;
  }
  for (const beam of structure.beams) {
    const floor = building.floors.find((candidate) => candidate.id === beam.floorId)!;
    const top = floor.elevation - preset.slabThickness;
    const from = columns.get(beam.fromColumnId)!.position;
    const to = columns.get(beam.toColumnId)!.position;
    lines.push(prism(from, to, beam.width, top - beam.depth, top,
      `struct-beam-${beam.floorId}-${beam.id}`, vertex));
    vertex += 8;
  }
  return {
    obj: lines.join("\n") + "\n",
    columns: structure.columns.length,
    beams: structure.beams.length,
    vertices: vertex - firstVertex,
  };
}
