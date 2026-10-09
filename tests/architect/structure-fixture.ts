import type { BuildingStructure } from "../../lib/architect/building-structure";

export function sampleBuildingStructure(): BuildingStructure {
  return {
    version: 1, status: "coordination-only",
    columns: [
      { id: "c1", position: { x: 4, y: 2 }, width: 0.3, depth: 0.3 },
      { id: "c2", position: { x: 10, y: 2 }, width: 0.3, depth: 0.3 },
      { id: "c3", position: { x: 4, y: 6 }, width: 0.3, depth: 0.3 },
      { id: "c4", position: { x: 10, y: 6 }, width: 0.3, depth: 0.3 },
    ],
    beams: [
      { id: "b1", floorId: "first", fromColumnId: "c1", toColumnId: "c2", width: 0.25, depth: 0.45 },
      { id: "b2", floorId: "first", fromColumnId: "c3", toColumnId: "c4", width: 0.25, depth: 0.45 },
      { id: "b3", floorId: "first", fromColumnId: "c1", toColumnId: "c3", width: 0.25, depth: 0.45 },
      { id: "b4", floorId: "first", fromColumnId: "c2", toColumnId: "c4", width: 0.25, depth: 0.45 },
    ],
  };
}
