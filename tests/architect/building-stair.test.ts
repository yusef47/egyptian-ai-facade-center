import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileBuildingProposal, parseBuildingProposal } from "../../lib/architect/building-proposal";
import { buildBuildingModelObj } from "../../lib/architect/building-model-obj";
import { DEFAULT_WALL_MESH_PRESET } from "../../lib/architect/wall-mesh";
import { sampleBuildingProposal } from "./building-fixture";
import { buildStairFloorOverlay } from "../../lib/architect/stair-plan-overlay";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";
import { buildBuildingSlabObj } from "../../lib/architect/slab-mesh";
import { corePlatformPieces } from "../../lib/architect/core-platform";
import { stairVoidFootprint, validateBuildingStairs } from "../../lib/architect/building-stair";
import { hasCoreWalkingPath } from "../../lib/architect/stair-access";

function area(points: { x: number; y: number }[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!;
    return sum + point.x * next.y - next.x * point.y;
  }, 0)) / 2;
}

function withStair() {
  const proposal = sampleBuildingProposal();
  proposal.stairs = [{
    id: "s1", lowerFloorId: "ground", upperFloorId: "first",
    start: { x: 1.5, y: 1.1 }, end: { x: 1.5, y: 6.3 },
    width: 1.2, risers: 19, landingLength: 0.8,
  }];
  return proposal;
}

describe("authored concept stairs", () => {
  it("cuts rotated openings out of a concave core without creating slab area", () => {
    const core = [
      { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 },
      { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 },
    ];
    const diamond = [{ x: 2, y: 1 }, { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 1, y: 2 }];
    const second = [{ x: 1, y: 5 }, { x: 2, y: 5 }, { x: 2, y: 6 }, { x: 1, y: 6 }];
    const pieces = corePlatformPieces(core, [diamond, second]);
    expect(pieces).not.toBeNull();
    expect(pieces!.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(45, 6);
  });

  it("compiles a bounded straight flight and exports each tread and landing", () => {
    const compiled = compileBuildingProposal(withStair());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.links[0]!.status).toBe("concept-stair-authored");
    const model = buildBuildingModelObj(compiled, DEFAULT_WALL_MESH_PRESET);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.stairSolids).toBe(20);
    expect(model.obj).toContain("o stair-s1-lower-landing");
    expect(model.obj).toContain("o stair-s1-tread-18");
    expect(model.obj).toContain("o stair-s1-upper-landing");
  });

  it("models upper core platforms around the same flight void used by the walking check", () => {
    const compiled = compileBuildingProposal(withStair());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    const core = compiled.floors[1]!.geometry.spaces.find((space) => space.id === "core")!.polygon.points;
    const voidPolygon = stairVoidFootprint(compiled.proposal.stairs![0]!);
    const pieces = corePlatformPieces(core, [voidPolygon]);
    expect(pieces).not.toBeNull();
    expect(pieces!.reduce((sum, piece) => sum + area(piece), 0)).toBeCloseTo(area(core) - area(voidPolygon), 6);
    const slabs = buildBuildingSlabObj(compiled, 0.2);
    expect(slabs.ok).toBe(true);
    if (!slabs.ok) return;
    expect(slabs.obj).toContain("o first_core_platform_1");
    const firstCorePlatforms = [...slabs.obj.matchAll(/^o first_core_platform_\d+$/gm)];
    expect(firstCorePlatforms).toHaveLength(pieces!.length);
    const vertices: number[][] = [];
    let platform = false;
    let topArea = 0;
    for (const line of slabs.obj.split("\n")) {
      if (line.startsWith("o ")) platform = line.startsWith("o first_core_platform_");
      if (line.startsWith("v ")) vertices.push(line.slice(2).split(" ").map(Number));
      if (!platform || !line.startsWith("f ")) continue;
      const face = line.slice(2).split(" ").map((part) => vertices[Number(part) - 1]!);
      if (face.length !== 3 || !face.every((point) => point[2] === 3.2)) continue;
      const [a, b, c] = face;
      topArea += Math.abs((b![0]! - a![0]!) * (c![1]! - a![1]!)
        - (b![1]! - a![1]!) * (c![0]! - a![0]!)) / 2;
    }
    expect(topArea).toBeCloseTo(area(core) - area(voidPolygon), 6);

    const entry = { x: 2.625, y: 4 };
    const landing = { x: 1.5, y: 6.7 };
    const support = { base: true, voids: [voidPolygon], bridges: [
      [{ x: 0.9, y: 6.3 }, { x: 2.1, y: 6.3 }, { x: 2.1, y: 7.1 }, { x: 0.9, y: 7.1 }],
    ] };
    expect(hasCoreWalkingPath(core, [], entry, landing, support)).toBe(true);
    expect(hasCoreWalkingPath(core, [], entry, landing, { base: false, voids: [], bridges: support.bridges })).toBe(false);
  });

  it("rejects a flight departing from an unmodeled upper core floor", () => {
    const proposal = withStair();
    const second = structuredClone(proposal.floors[1]!);
    second.id = "second";
    second.elevation = 6.4;
    proposal.floors.push(second);
    proposal.stairs![0]!.lowerFloorId = "first";
    proposal.stairs![0]!.upperFloorId = "second";
    const result = compileBuildingProposal(proposal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("STAIR_LEVEL_UNSUPPORTED:s1:first");
      expect(result.errors).toContain("STAIR_DOOR_UNREACHABLE:s1:first:cp-door-1");
    }
    const withoutStair = compileBuildingProposal({ ...proposal, stairs: [] });
    expect(withoutStair.ok).toBe(true);
    if (!withoutStair.ok || withoutStair.kind !== "building") return;
    const contexts = withoutStair.floors.map((floor) => ({
      id: floor.id, elevation: floor.elevation,
      core: floor.geometry.spaces.find((space) => space.id === "core")!.polygon.points,
      geometry: { ...floor.geometry, openings: floor.id === "first" ? [] : floor.geometry.openings },
    }));
    expect(validateBuildingStairs(proposal.stairs!, contexts, "core"))
      .toContain("STAIR_LEVEL_UNSUPPORTED:s1:first");
  });

  it("rejects a run outside the core, a blocked door and nonadjacent floors", () => {
    const outside = withStair();
    outside.stairs![0]!.start.x = 4;
    outside.stairs![0]!.end.x = 4;
    const result = compileBuildingProposal(outside);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("STAIR_OUTSIDE_CORE:s1");

    const blocked = withStair();
    blocked.stairs![0]!.start.x = 2.55;
    blocked.stairs![0]!.end.x = 2.55;
    const blockedResult = compileBuildingProposal(blocked);
    expect(blockedResult.ok).toBe(false);
    if (!blockedResult.ok) expect(blockedResult.errors).toContain("STAIR_BLOCKS_CORE_DOOR:s1:ground");

    const wrong = withStair();
    wrong.stairs![0]!.upperFloorId = "ground";
    expect(compileBuildingProposal(wrong)).toEqual({ ok: false, errors: ["STAIR_FLOORS_NOT_ADJACENT:s1"] });
  });

  it("rejects malformed stair data at the parse boundary", () => {
    const proposal = withStair();
    expect(parseBuildingProposal({ ...proposal, stairs: [{ ...proposal.stairs![0], width: Infinity }] })).toBeNull();
    expect(parseBuildingProposal({ ...proposal, stairs: [{ ...proposal.stairs![0], risers: 2.5 }] })).toBeNull();
    expect(parseBuildingProposal({ ...proposal, stairs: [{ ...proposal.stairs![0], surprise: true }] })).toBeNull();
  });

  it("keeps the shipped two-floor demo stair in the 3D export", () => {
    const project = JSON.parse(readFileSync("examples/architect-two-floor-demo.json", "utf8"));
    const compiled = compileBuildingProposal(project.conceptProposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.links[0]!.status).toBe("concept-stair-authored");
    const model = buildBuildingModelObj(compiled, project.wallMeshPreset);
    expect(model.ok).toBe(true);
    if (!model.ok) return;
    expect(model.stairSolids).toBe(20);
  });

  it("permits flights stacked at the same core coordinates in separate storeys", () => {
    const proposal = withStair();
    const second = structuredClone(proposal.floors[1]!);
    second.id = "second";
    second.elevation = 6.4;
    proposal.floors.push(second);
    proposal.stairs!.push({ ...structuredClone(proposal.stairs![0]!), id: "s2",
      lowerFloorId: "first", upperFloorId: "second" });
    const compiled = compileBuildingProposal(proposal);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    expect(compiled.circulation.links.map((link) => link.status)).toEqual([
      "concept-stair-authored", "concept-stair-authored",
    ]);
  });

  it("puts the same authored treads in both floor SVG and DXF plans", () => {
    const compiled = compileBuildingProposal(withStair());
    expect(compiled.ok).toBe(true);
    if (!compiled.ok || compiled.kind !== "building") return;
    for (const floor of compiled.floors) {
      const overlay = buildStairFloorOverlay(compiled.proposal.stairs!, floor.id);
      const svg = buildSvgPlan(floor.geometry, { stairOverlay: overlay.svg });
      const dxf = buildDxfPlan(floor.geometry, overlay.dxf);
      const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
      expect(doc.querySelectorAll("#stair-concept [data-stair-kind='tread']")).toHaveLength(18);
      expect(doc.querySelectorAll("#stair-concept [data-stair-kind='landing']")).toHaveLength(2);
      expect(dxf).toContain("STAIR_TREADS");
      expect(dxf).toContain("STAIR_LANDINGS");
      expect(dxf).toContain("S1 CONCEPT STAIR");
    }
  });

  it("rejects a stair that leaves no walking route from a core door to its lower landing", () => {
    const proposal = withStair();
    const topRoom = { id: "top-room", name: "Top room", kind: "kitchen" as const,
      points: [{ x: 0, y: 8 }, { x: 3, y: 8 }, { x: 3, y: 11 }, { x: 0, y: 11 }] };
    proposal.floors[0]!.plan.cells.push(topRoom);
    proposal.floors[0]!.plan.doors = [
      { from: "core", to: "top-room", width: 0.9, at: 0.5 },
      { from: "top-room", to: "outside", width: 1, at: 0.5 },
      { from: "living", to: "outside", width: 1, at: 0.5 },
    ];
    proposal.floors[1]!.plan.cells = [proposal.floors[1]!.plan.cells[0]!, structuredClone(topRoom)];
    proposal.floors[1]!.plan.doors = [{ from: "core", to: "top-room", width: 0.9, at: 0.5 }];
    proposal.floors[1]!.plan.windows = [];
    proposal.stairs![0]!.width = 2.8; // Fits a 3 m core, but leaves only 0.1 m at each side.
    const result = compileBuildingProposal(proposal);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain("STAIR_DOOR_UNREACHABLE:s1:ground:cp-door-1");
  });
});
