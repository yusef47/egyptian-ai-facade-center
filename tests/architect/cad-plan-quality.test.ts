import { describe, expect, it } from "vitest";
import { evaluateCadPlanQuality, type CadPlanObject } from "../../lib/architect/cad-plan-quality";

const inspection = (objects: CadPlanObject[]) => ({ objects, siteMm: [20_000, 20_000] });

describe("selected concept plan quality heuristics", () => {
  it("flags furniture that blocks an opening while allowing headboard contact at a wall face", () => {
    const issues = evaluateCadPlanQuality(inspection([
      { id: "door-a", semantic: "opening", text: "DOOR", boundsMm: [1000, 1000, 1900, 1100] },
      { id: "bed-a", semantic: "furniture", boundsMm: [1200, 1050, 3000, 3050] },
      { id: "wall-a", semantic: "wall", wallStartMm: [0, 4000], wallEndMm: [5000, 4000], wallThicknessMm: 200 },
      { id: "bed-b", semantic: "furniture", boundsMm: [1000, 2950, 3000, 3900] },
    ]));
    expect(issues.filter((issue) => issue.code === "furniture_opening_clearance")).toHaveLength(1);
    expect(issues.some((issue) => issue.code === "furniture_wall_collision" && issue.ids.includes("bed-b"))).toBe(false);
  });

  it("asks for room labels and a real ventilation symbol for an interior wet room", () => {
    const issues = evaluateCadPlanQuality(inspection([
      { id: "bath", semantic: "room", text: "Bathroom", positionMm: [10_000, 10_000] },
    ]), "Two apartments with bathrooms");
    expect(issues.map((issue) => issue.code)).toContain("wet_room_ventilation");
    expect(issues.map((issue) => issue.code)).not.toContain("room_labels_missing");
    expect(evaluateCadPlanQuality(inspection([]), "Two apartments with bedrooms").map((issue) => issue.code)).toContain("room_labels_missing");
  });

  it("uses an actual shaft object as ventilation evidence and flags undersized stairs", () => {
    const issues = evaluateCadPlanQuality(inspection([
      { id: "bath", semantic: "room", text: "Bathroom", positionMm: [5000, 5000] },
      { id: "shaft", semantic: "shaft", kind: "ventilation", boundsMm: [5600, 5600, 6500, 6500] },
      { id: "stair", semantic: "stair", boundsMm: [9000, 9000, 9500, 9700] },
    ]));
    expect(issues.some((issue) => issue.code === "wet_room_ventilation")).toBe(false);
    expect(issues.some((issue) => issue.code === "stair_fit" && issue.ids.includes("stair"))).toBe(true);
  });

  it("reports that room reachability is unresolved when no exterior entry door is modeled", () => {
    const issues = evaluateCadPlanQuality(inspection([
      { id: "south-wall", semantic: "wall", wallStartMm: [100, 100], wallEndMm: [19_900, 100], wallThicknessMm: 200 },
      { id: "living", semantic: "room", text: "Living", positionMm: [10_000, 10_000] },
    ]));
    expect(issues.some((issue) => issue.code === "room_inaccessible" && issue.ids.includes("living"))).toBe(true);
  });

  it("does not treat an interior wall that only touches one site edge as an exterior window wall", () => {
    const issues = evaluateCadPlanQuality(inspection([
      { id: "bath", semantic: "room", text: "Bathroom", positionMm: [6000, 9500] },
      { id: "partition", semantic: "wall", wallStartMm: [0, 8000], wallEndMm: [10_000, 8000], wallThicknessMm: 200 },
      { id: "fake-exterior-window", semantic: "opening", text: "WINDOW", hostWallId: "partition", boundsMm: [4500, 7900, 5500, 8100] },
    ]));
    expect(issues.some((issue) => issue.code === "wet_room_ventilation")).toBe(true);
  });
});
