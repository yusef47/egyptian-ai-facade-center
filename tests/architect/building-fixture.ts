import type { BuildingProposal } from "../../lib/architect/building-proposal";

/** Two genuinely different floor plans on one site with a continuous core. */
export function sampleBuildingProposal(): BuildingProposal {
  const site = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 20 }];
  const core = { id: "core", name: "Stair and lift core", kind: "core" as const, points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 8 }, { x: 0, y: 8 }] };
  return {
    kind: "building", version: 1, coreCellId: "core",
    floors: [
      { id: "ground", name: "Ground floor", elevation: 0, plan: {
        version: 2, site: structuredClone(site),
        cells: [structuredClone(core), { id: "living", name: "Living", kind: "living", points: [{ x: 3, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 3, y: 8 }] }],
        doors: [{ from: "core", to: "outside", width: 1, at: 0.5 }, { from: "core", to: "living", width: 0.9, at: 0.5 }],
        windows: [{ space: "living", edgeIndex: 1, width: 1.5, at: 0.5 }],
      } },
      { id: "first", name: "First floor", elevation: 3.2, plan: {
        version: 2, site: structuredClone(site),
        cells: [structuredClone(core), { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 3, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 3, y: 8 }] }],
        doors: [{ from: "core", to: "bedroom", width: 0.9, at: 0.5 }],
        windows: [{ space: "bedroom", edgeIndex: 1, width: 1.5, at: 0.5 }],
      } },
    ],
  };
}
