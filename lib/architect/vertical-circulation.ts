import type { Point2, ProjectGeometry } from "./geometry";
import { polygonArea, wallLength } from "./geometry";
import type { BuildingStair } from "./building-stair";

export type CoreDoor = {
  id: string;
  connectsTo: string | "outside";
  start: Point2;
  end: Point2;
};

export type VerticalLink = {
  lowerFloorId: string;
  upperFloorId: string;
  rise: number;
  lowerCoreDoors: CoreDoor[];
  upperCoreDoors: CoreDoor[];
  /** A shared shaft is not a stair or a traversable route. */
  status: "stair-not-authored" | "concept-stair-authored";
};

export type VerticalCirculationReport = {
  coreNominalArea: number;
  coreBoundingWidth: number;
  coreBoundingDepth: number;
  groundOutsideDoors: CoreDoor[];
  links: VerticalLink[];
};

type CirculationFloor = {
  id: string;
  elevation: number;
  geometry: ProjectGeometry;
};

/**
 * Describes the authored entrances and floor rises, without treating a core
 * label or an empty shaft as proof that adjacent floors are connected.
 * Bounding dimensions and area follow planning-cell centerlines, not clearances.
 */
export function inspectVerticalCirculation(floors: CirculationFloor[], coreCellId: string, stairs: BuildingStair[] = []): VerticalCirculationReport {
  const points = floors[0]!.geometry.spaces.find((space) => space.id === coreCellId)!.polygon.points;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const doorsByFloor = floors.map((floor) => {
    const walls = new Map(floor.geometry.walls.map((wall) => [wall.id, wall]));
    return floor.geometry.openings.flatMap((opening): CoreDoor[] => {
      if (opening.kind !== "door") return [];
      const wall = walls.get(opening.wallId);
      if (!wall || !wall.sharedWith.includes(coreCellId)) return [];
      const length = wallLength(wall);
      if (length <= 0) return [];
      const dx = (wall.end.x - wall.start.x) / length;
      const dy = (wall.end.y - wall.start.y) / length;
      const start = { x: wall.start.x + dx * opening.offset, y: wall.start.y + dy * opening.offset };
      const end = { x: start.x + dx * opening.width, y: start.y + dy * opening.width };
      return [{
        id: opening.id,
        connectsTo: wall.sharedWith.find((id) => id !== coreCellId) ?? "outside",
        start,
        end,
      }];
    });
  });
  return {
    coreNominalArea: polygonArea({ points }),
    coreBoundingWidth: Math.max(...xs) - Math.min(...xs),
    coreBoundingDepth: Math.max(...ys) - Math.min(...ys),
    groundOutsideDoors: doorsByFloor[floors.findIndex((floor) => floor.elevation === 0)]!
      .filter((door) => door.connectsTo === "outside"),
    links: floors.slice(1).map((floor, index) => ({
      lowerFloorId: floors[index]!.id,
      upperFloorId: floor.id,
      rise: floor.elevation - floors[index]!.elevation,
      lowerCoreDoors: doorsByFloor[index]!,
      upperCoreDoors: doorsByFloor[index + 1]!,
      status: stairs.some((stair) => stair.lowerFloorId === floors[index]!.id && stair.upperFloorId === floor.id)
        ? "concept-stair-authored" as const : "stair-not-authored" as const,
    })),
  };
}
