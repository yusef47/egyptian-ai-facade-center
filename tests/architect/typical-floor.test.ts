import { describe, expect, it } from "vitest";
import { compileBuildingProposal } from "../../lib/architect/building-proposal";
import { expandTypicalFloor } from "../../lib/architect/typical-floor";

const plan = {
  version: 2,
  site: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
  cells: [
    { id: "unit-a", name: "Unit A living", kind: "living", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 10 }, { x: 0, y: 10 }] },
    { id: "core", name: "Shared core", kind: "core", points: [{ x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10 }, { x: 4, y: 10 }] },
    { id: "unit-b", name: "Unit B living", kind: "living", points: [{ x: 6, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 }] },
  ],
  doors: [
    { from: "core", to: "outside", width: 1, at: 0.5 },
    { from: "core", to: "unit-a", width: 0.9, at: 0.5 },
    { from: "core", to: "unit-b", width: 0.9, at: 0.5 },
  ],
  windows: [],
};

describe("expandTypicalFloor", () => {
  it("creates three checked floors and keeps the outdoor entrance on ground only", () => {
    const building = expandTypicalFloor(plan, "core", 3);
    expect(building?.floors).toHaveLength(3);
    expect(building?.floors.map((floor) => floor.elevation)).toEqual([0, 3.2, 6.4]);
    expect(building?.floors[0]?.plan.doors.some((door) => door.to === "outside")).toBe(true);
    expect(building?.floors[1]?.plan.doors.some((door) => door.to === "outside")).toBe(false);
    expect(compileBuildingProposal(building).ok).toBe(true);
  });

  it("rejects missing access and unbounded floor counts", () => {
    expect(expandTypicalFloor({ ...plan, doors: plan.doors.slice(1) }, "core", 3)).toBeNull();
    expect(expandTypicalFloor(plan, "core", 6)).toBeNull();
    expect(expandTypicalFloor(plan, "unit-a", 3)).toBeNull();
  });
});
