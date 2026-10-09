import type { Point2 } from "./geometry";
import type { CompiledDesign } from "./building-proposal";

type Building = Extract<CompiledDesign, { ok: true; kind: "building" }>;

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
  const faces = [[4, 3, 2, 1], [5, 6, 7, 8], [1, 2, 6, 5],
    [2, 3, 7, 6], [3, 4, 8, 7], [4, 1, 5, 8]];
  return [`o ${name}`, ...vertices,
    ...faces.map((face) => `f ${face.map((index) => firstVertex + index - 1).join(" ")}`)].join("\n");
}

/** Explicit straight stair treads and level landings, for 3D coordination only. */
export function buildBuildingStairObj(building: Building, firstVertex = 1): { obj: string; solids: number; vertices: number } {
  const lines = ["# Authored concept stairs only; no stringers, handrails, headroom, structure or code approval"];
  let vertex = firstVertex;
  let solids = 0;
  for (const stair of building.proposal.stairs ?? []) {
    const lower = building.floors.find((floor) => floor.id === stair.lowerFloorId)!;
    const upper = building.floors.find((floor) => floor.id === stair.upperFloorId)!;
    const length = Math.hypot(stair.end.x - stair.start.x, stair.end.y - stair.start.y);
    const ux = (stair.end.x - stair.start.x) / length;
    const uy = (stair.end.y - stair.start.y) / length;
    const along = (distance: number): Point2 => ({ x: stair.start.x + ux * distance, y: stair.start.y + uy * distance });
    const add = (from: number, to: number, elevation: number, name: string) => {
      lines.push(prism(along(from), along(to), stair.width, elevation - 0.12, elevation, name, vertex));
      vertex += 8;
      solids += 1;
    };
    add(-stair.landingLength, 0, lower.elevation, `stair-${stair.id}-lower-landing`);
    const treadLength = length / (stair.risers - 1);
    const rise = (upper.elevation - lower.elevation) / stair.risers;
    for (let index = 0; index < stair.risers - 1; index += 1) {
      add(index * treadLength, (index + 1) * treadLength, lower.elevation + (index + 1) * rise,
        `stair-${stair.id}-tread-${index + 1}`);
    }
    add(length, length + stair.landingLength, upper.elevation, `stair-${stair.id}-upper-landing`);
  }
  return { obj: solids ? lines.join("\n") + "\n" : "", solids, vertices: vertex - firstVertex };
}
