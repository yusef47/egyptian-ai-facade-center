import { describe, expect, it } from "vitest";
import { cadPlanFocus, evaluateCadPlanQuality, type CadPlanObject } from "../../lib/architect/cad-plan-quality";

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

  it("compares an explicit bedroom count with semantic room evidence and prioritizes topology", () => {
    const drawing = inspection([
      { id: "bedroom-a", semantic: "room", text: "Bedroom 1", positionMm: [3000, 3000] },
      { id: "bedroom-b", semantic: "room", text: "Bedroom 2", positionMm: [7000, 3000] },
      { id: "sofa-a", semantic: "furniture", text: "sofa", boundsMm: [8000, 8000, 10_000, 9000] },
    ]);
    const issues = evaluateCadPlanQuality(drawing, "2 apartments, 3 bedrooms per apartment");
    expect(issues.find((issue) => issue.code === "program_count")?.message).toContain("6 bedrooms");
    const focus = cadPlanFocus(issues, "2 apartments, 3 bedrooms per apartment", drawing);
    expect(focus.phase).toBe("topology");
    expect(focus.allowedOps).not.toContain("furniture");
  });

  it("multiplies Arabic per-apartment bedroom counts only when the brief states each unit's count", () => {
    const issues = evaluateCadPlanQuality(inspection([]), "شقتين مستقلتين، كل واحدة فيها ٣ غرف نوم");
    expect(issues.find((issue) => issue.code === "program_count")?.message).toContain("6 bedrooms");
  });

  it("allows detail operations after topology blockers clear", () => {
    const focus = cadPlanFocus([], "Residential plan", inspection([{ id: "room", semantic: "room", text: "Living" }]));
    expect(focus.phase).toBe("furnishing");
    expect(focus.allowedOps).toContain("furniture");
  });
});
