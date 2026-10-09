import { describe, expect, it } from "vitest";
import { generateLayout } from "../../lib/architect/generate";
import { polygonArea } from "../../lib/architect/geometry";
import {
  applyRoomActions,
  buildRoomPlan,
  buildRoomPlanDxf,
  buildRoomPlanSvg,
  defaultRoomProgram,
  parseRoomActions,
  parseRoomProgram,
  type RoomProgram,
} from "../../lib/architect/room-plan";

function options() {
  const generated = generateLayout({
    program: { units: 2, core: "shared" },
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  });
  if (!generated.ok) throw new Error("Fixture generation failed");
  return generated.options;
}

describe("editable room planning", () => {
  it("tiles both units with rooms and a connected corridor on both core-side options", () => {
    for (const option of options()) {
      const result = buildRoomPlan(option.geometry, defaultRoomProgram(), option.coreSide);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.plan.rooms).toHaveLength(10);
      expect(result.plan.corridors).toHaveLength(2);
      expect(result.plan.lines.filter((segment) => segment.kind === "door")).toHaveLength(10);
      for (const unit of ["unit-a", "unit-b"] as const) {
        const cell = option.geometry.spaces.find((space) => space.id.endsWith("-space-" + unit))!;
        const occupied = result.plan.rooms
          .filter((room) => room.unit === unit)
          .reduce((sum, room) => sum + room.area, 0);
        const circulation = result.plan.corridors.find((entry) => entry.unit === unit)!.area;
        expect(occupied + circulation).toBeCloseTo(polygonArea(cell.polygon), 7);
      }
    }
  });

  it("changes room count and dimensions with the requested program", () => {
    const option = options()[0]!;
    const program = defaultRoomProgram();
    program["unit-a"] = program["unit-a"].filter((room) => room.id !== "bedroom-2");
    const first = buildRoomPlan(option.geometry, program, option.coreSide);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.plan.rooms.filter((room) => room.unit === "unit-a")).toHaveLength(4);
    const previousLivingArea = first.plan.rooms.find((room) => room.id === "unit-a-living-1")!.area;
    program["unit-a"][0]!.preferredArea = 80;
    const second = buildRoomPlan(option.geometry, program, option.coreSide);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.plan.rooms.find((room) => room.id === "unit-a-living-1")!.area).toBeGreaterThan(previousLivingArea);
  });

  it("rejects a program that cannot fit rather than returning overlapping rooms", () => {
    const option = options()[0]!;
    const program: RoomProgram = defaultRoomProgram();
    program["unit-a"] = Array.from({ length: 12 }, (_, index) => ({
      id: "bed-" + index,
      kind: "bedroom" as const,
      preferredArea: 12,
    }));
    const result = buildRoomPlan(option.geometry, program, option.coreSide);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/cannot fit/);
  });

  it("exports the derived room walls, doors and names in SVG and DXF", () => {
    const option = options()[0]!;
    const result = buildRoomPlan(option.geometry, defaultRoomProgram(), option.coreSide);
    if (!result.ok) throw new Error(result.errors.join(", "));
    const svg = buildRoomPlanSvg(option.geometry, result.plan, "ar");
    const dxf = buildRoomPlanDxf(option.geometry, result.plan);
    expect(svg).toContain('data-room="unit-a-living-1"');
    expect(svg).toContain("معيشة");
    expect(svg).not.toContain("UNIT A");
    expect(dxf).toContain("Living");
    expect(dxf).toContain("ROOM_PARTITIONS");
    expect(dxf).toContain("ROOM_DOORS");
    expect((dxf.match(/\nDOORS\n/g) ?? []).length).toBeGreaterThan(2);
    expect(dxf).toContain("EOF");
  });

  it("validates and applies bounded room actions without mutating the current program", () => {
    const before = defaultRoomProgram();
    const snapshot = structuredClone(before);
    const action = [{ op: "set", unit: "unit-a", roomId: "living-1", preferredArea: 40 }];
    const result = applyRoomActions(before, action, options());
    expect(result.ok).toBe(true);
    expect(before).toEqual(snapshot);
    if (result.ok) expect(result.program["unit-a"][0]?.preferredArea).toBe(40);
    expect(parseRoomActions([{ op: "add", unit: "unit-a", kind: "bedroom", coordinates: [1, 2] }])).toBeNull();
    expect(parseRoomActions([{ op: "add", unit: "unit-a", kind: "toString" }])).toBeNull();
    expect(parseRoomProgram({ ...before, "unit-a": [{ id: "../bad", kind: "bedroom", preferredArea: 20 }] })).toBeNull();
  });

  it("rejects room actions that would exceed the unit's available frontage", () => {
    const result = applyRoomActions(
      defaultRoomProgram(),
      [{ op: "add", unit: "unit-a", kind: "bedroom" }],
      options(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toMatch(/cannot fit/);
  });

  it("moves a room to a different site position while preserving the program", () => {
    const option = options()[0]!;
    const before = buildRoomPlan(option.geometry, defaultRoomProgram(), option.coreSide);
    const moved = applyRoomActions(
      defaultRoomProgram(),
      [{ op: "move", unit: "unit-a", roomId: "living-1", toIndex: 4 }],
      options(),
    );
    expect(before.ok && moved.ok).toBe(true);
    if (!before.ok || !moved.ok) return;
    const after = buildRoomPlan(option.geometry, moved.program, option.coreSide);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.plan.rooms.find((room) => room.id === "unit-a-living-1")?.rect.minY)
      .toBeGreaterThan(before.plan.rooms.find((room) => room.id === "unit-a-living-1")!.rect.minY);
    expect(after.plan.rooms).toHaveLength(before.plan.rooms.length);
  });
});
