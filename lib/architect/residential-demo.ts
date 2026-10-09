import type { Point2 } from "./geometry";
import type { BuildingProposal } from "./building-proposal";
import type { ConceptCell, ConceptProposal } from "./concept-proposal";

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Point2[] {
  return [
    { x: minX, y: minY }, { x: maxX, y: minY },
    { x: maxX, y: maxY }, { x: minX, y: maxY },
  ];
}

/** A reproducible four-storey reference for checking the geometry pipeline. */
export function createFourFloorResidentialDemo(): BuildingProposal {
  const site = rectangle(0, 0, 12, 20);
  const floorPlan = (ground: boolean): ConceptProposal => {
    const cells: ConceptCell[] = [
      { id: "core", name: "سلم", kind: "core", points: rectangle(0, 0, 3, 8) },
      { id: "corridor", name: "ممر", kind: "corridor", points: rectangle(3, 0, 5, 20) },
      { id: "a-living", name: "معيشة أ", kind: "living", points: rectangle(5, 0, 12, 3) },
      { id: "a-hall", name: "ممر", kind: "corridor", points: rectangle(5, 3, 6.5, 10) },
      { id: "a-kitchen", name: "مطبخ أ", kind: "kitchen", points: rectangle(6.5, 3, 12, 5.5) },
      { id: "a-bath", name: "حمام أ", kind: "bathroom", points: rectangle(6.5, 5.5, 12, 7.5) },
      { id: "a-bed", name: "نوم أ", kind: "bedroom", points: rectangle(6.5, 7.5, 12, 10) },
      { id: "b-living", name: "معيشة ب", kind: "living", points: rectangle(5, 17, 12, 20) },
      { id: "b-hall", name: "ممر", kind: "corridor", points: rectangle(5, 10, 6.5, 17) },
      { id: "b-kitchen", name: "مطبخ ب", kind: "kitchen", points: rectangle(6.5, 14.5, 12, 17) },
      { id: "b-bath", name: "حمام ب", kind: "bathroom", points: rectangle(6.5, 12.5, 12, 14.5) },
      { id: "b-bed", name: "نوم ب", kind: "bedroom", points: rectangle(6.5, 10, 12, 12.5) },
    ];
    return {
      version: 2,
      site: structuredClone(site),
      cells,
      doors: [
        ...(ground ? [{ from: "core", to: "outside" as const, width: 1.1, at: 0.12 }] : []),
        { from: "core", to: "corridor", width: 0.9, at: 0.68 },
        { from: "corridor", to: "a-living", width: 0.9, at: 0.5 },
        { from: "a-living", to: "a-hall", width: 0.8, at: 0.5 },
        { from: "a-hall", to: "a-kitchen", width: 0.8, at: 0.5 },
        { from: "a-hall", to: "a-bath", width: 0.7, at: 0.5 },
        { from: "a-hall", to: "a-bed", width: 0.8, at: 0.5 },
        { from: "corridor", to: "b-living", width: 0.9, at: 0.5 },
        { from: "b-living", to: "b-hall", width: 0.8, at: 0.5 },
        { from: "b-hall", to: "b-kitchen", width: 0.8, at: 0.5 },
        { from: "b-hall", to: "b-bath", width: 0.7, at: 0.5 },
        { from: "b-hall", to: "b-bed", width: 0.8, at: 0.5 },
      ],
      windows: [
        { space: "a-living", edgeIndex: 0, width: 2, at: 0.5 },
        { space: "a-kitchen", edgeIndex: 1, width: 1.2, at: 0.5 },
        { space: "a-bath", edgeIndex: 1, width: 0.6, at: 0.5 },
        { space: "a-bed", edgeIndex: 1, width: 1, at: 0.5 },
        { space: "b-living", edgeIndex: 2, width: 2, at: 0.5 },
        { space: "b-kitchen", edgeIndex: 1, width: 1.2, at: 0.5 },
        { space: "b-bath", edgeIndex: 1, width: 0.6, at: 0.5 },
        { space: "b-bed", edgeIndex: 1, width: 1, at: 0.5 },
      ],
    };
  };
  const floorIds = ["ground", "first", "second", "third"] as const;
  const floorNames = ["الدور الأرضي", "الدور الأول", "الدور الثاني", "الدور الثالث"] as const;
  return {
    kind: "building",
    version: 1,
    coreCellId: "core",
    floors: floorIds.map((id, index) => ({
      id,
      name: floorNames[index],
      elevation: index * 3.2,
      plan: floorPlan(index === 0),
    })),
    stairs: floorIds.slice(1).map((upperId, index) => ({
      id: `stair-${index + 1}`,
      lowerFloorId: floorIds[index],
      upperFloorId: upperId,
      start: { x: 1.5, y: 1.1 },
      end: { x: 1.5, y: 6.3 },
      width: 1.2,
      risers: 19,
      landingLength: 0.8,
    })),
  };
}
