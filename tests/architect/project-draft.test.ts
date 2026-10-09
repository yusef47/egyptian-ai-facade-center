import { describe, expect, it } from "vitest";
import {
  createProjectDraft,
  parseProjectDraft,
} from "../../lib/architect/project-draft";
import { defaultRoomProgram } from "../../lib/architect/room-plan";
import { sampleBuildingProposal } from "./building-fixture";
import { DEFAULT_WALL_MESH_PRESET } from "../../lib/architect/wall-mesh";
import { expandTypicalFloor } from "../../lib/architect/typical-floor";

const brief = { siteWidth: 12, siteDepth: 20, unitBSharePercent: 50, coreSide: "east" as const };
const concept = {
  version: 2 as const,
  site: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 20 }],
  cells: [{ id: "living", name: "Living", kind: "living" as const, points: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }, { x: 0, y: 6 }] }],
  doors: [{ from: "living", to: "outside", width: 1, at: 0.5 }],
  windows: [{ space: "living", edgeIndex: 1, width: 1.2, at: 0.5 }],
};

describe("portable project draft", () => {
  it("saves an original project on a 200 m2 site even when the unrelated starter room program does not fit", () => {
    const site = { ...brief, siteWidth: 10, siteDepth: 20 };
    const plan = {
      version: 2,
      site: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
      cells: [
        { id: "unit-a", name: "Unit A", kind: "living", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 10 }, { x: 0, y: 10 }] },
        { id: "core", name: "Core", kind: "core", points: [{ x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10 }, { x: 4, y: 10 }] },
        { id: "unit-b", name: "Unit B", kind: "living", points: [{ x: 6, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 6, y: 10 }] },
      ],
      doors: [
        { from: "core", to: "outside", width: 1, at: 0.5 },
        { from: "core", to: "unit-a", width: 0.9, at: 0.5 },
        { from: "core", to: "unit-b", width: 0.9, at: 0.5 },
      ],
      windows: [],
    };
    const building = expandTypicalFloor(plan, "core", 3)!;
    const draft = createProjectDraft("200 m2 project", site, defaultRoomProgram(), 1, "concept", building);
    expect(draft?.conceptProposal).toEqual(building);
    expect(parseProjectDraft(JSON.parse(JSON.stringify(draft)))?.brief).toEqual(site);
  });

  it("round trips a valid named project and regenerates its rooms", () => {
    const draft = createProjectDraft("بيت العائلة", brief, defaultRoomProgram(), 2);
    expect(draft).not.toBeNull();
    const imported = parseProjectDraft(JSON.parse(JSON.stringify(draft)));
    expect(imported?.name).toBe("بيت العائلة");
    expect(imported?.selectedOption).toBe(2);
    expect(imported?.roomProgram["unit-a"]).toHaveLength(5);
  });

  it("rejects incompatible versions, injected fields and infeasible room plans", () => {
    const draft = createProjectDraft("Project", brief, defaultRoomProgram(), 1)!;
    expect(parseProjectDraft({ ...draft, schemaVersion: 99 })).toBeNull();
    expect(parseProjectDraft({ ...draft, script: "alert(1)" })).toBeNull();
    expect(parseProjectDraft({ ...draft, brief: { ...brief, siteDepth: 17 } })).toBeNull();
    expect(parseProjectDraft({ ...draft, name: "" })).toBeNull();
  });

  it("preserves an original concept across export/import and migrates old drafts", () => {
    const draft = createProjectDraft("Original", brief, defaultRoomProgram(), 1, "concept", concept);
    expect(draft?.activeMode).toBe("concept");
    expect(parseProjectDraft(JSON.parse(JSON.stringify(draft)))?.conceptProposal).toEqual(concept);
    expect(parseProjectDraft({ ...draft, conceptProposal: { ...concept, doors: [] } })).toBeNull();
    expect(parseProjectDraft({
      ...draft,
      conceptProposal: {
        ...concept,
        site: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 6, y: 20 }, { x: 6, y: 10 }, { x: 0, y: 10 }],
      },
    })).toBeNull();

    const changedSite = { ...brief, siteWidth: 14 };
    const templateWithOldConcept = createProjectDraft("Edited site", changedSite, defaultRoomProgram(), 1, "template", concept);
    expect(templateWithOldConcept?.conceptProposal).toEqual(concept);
    expect(createProjectDraft("Edited site", changedSite, defaultRoomProgram(), 1, "concept", concept)).toBeNull();

    const legacy = {
      schemaVersion: 1, name: "Legacy", brief,
      roomProgram: defaultRoomProgram(), selectedOption: 1,
    };
    const migrated = parseProjectDraft(legacy);
    expect(migrated?.schemaVersion).toBe(3);
    expect(migrated?.activeMode).toBe("template");
    expect(migrated?.conceptProposal).toBeNull();
    expect(migrated?.wallMeshPreset).toEqual(DEFAULT_WALL_MESH_PRESET);

    const previousVersion: Record<string, unknown> = { ...draft, schemaVersion: 2 };
    delete previousVersion.wallMeshPreset;
    expect(parseProjectDraft(previousVersion)?.wallMeshPreset).toEqual(DEFAULT_WALL_MESH_PRESET);
  });

  it("round trips a multi-floor concept through the portable project file", () => {
    const building = sampleBuildingProposal();
    const draft = createProjectDraft("Family building", brief, defaultRoomProgram(), 1, "concept", building);
    expect(draft?.conceptProposal).toEqual(building);
    expect(parseProjectDraft(JSON.parse(JSON.stringify(draft)))?.conceptProposal).toEqual(building);
    const changed = createProjectDraft("Family building", brief, defaultRoomProgram(), 1, "concept", building,
      { ...DEFAULT_WALL_MESH_PRESET, roofRise: 3.5, slabThickness: 0.25 });
    expect(parseProjectDraft(changed)?.wallMeshPreset.roofRise).toBe(3.5);
    expect(parseProjectDraft(changed)?.wallMeshPreset.slabThickness).toBe(0.25);
    const oldMesh = { ...changed, wallMeshPreset: { roofRise: 3.5, doorHeadHeight: 2.1, windowSillHeight: 0.9, windowHeadHeight: 2.1 } };
    expect(parseProjectDraft(oldMesh)?.wallMeshPreset.slabThickness).toBe(0.2);
    expect(parseProjectDraft({ ...changed, wallMeshPreset: { ...DEFAULT_WALL_MESH_PRESET, roofRise: Infinity } })).toBeNull();
    building.floors[1]!.plan.cells[0]!.points[1]!.x = 2;
    expect(createProjectDraft("Broken core", brief, defaultRoomProgram(), 1, "concept", building)).toBeNull();
  });
});
