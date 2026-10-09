import {
  parseWorkspaceBrief,
  toLayoutBrief,
  type WorkspaceBrief,
} from "./brief-patch";
import { generateLayout } from "./generate";
import { buildRoomPlan, parseRoomProgram, type RoomProgram } from "./room-plan";
import { compileDesignProposal, designMatchesSite, type DesignProposal } from "./building-proposal";
import { DEFAULT_WALL_MESH_PRESET, parseWallMeshPreset, type WallMeshPreset } from "./wall-mesh";

export const PROJECT_DRAFT_SCHEMA_VERSION = 3;
export const PROJECT_DRAFT_STORAGE_KEY = "qattan:architect:draft:v1";

export type ProjectDraft = {
  schemaVersion: 3;
  name: string;
  brief: WorkspaceBrief;
  roomProgram: RoomProgram;
  selectedOption: 1 | 2;
  activeMode: "template" | "concept";
  conceptProposal: DesignProposal | null;
  wallMeshPreset: WallMeshPreset;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A portable, untrusted project draft. Validate every imported field and
 * regenerate all dependent geometry; imported JSON never supplies SVG,
 * structural approval, arbitrary coordinates or executable content.
 */
export function parseProjectDraft(value: unknown): ProjectDraft | null {
  if (!record(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== PROJECT_DRAFT_SCHEMA_VERSION)) return null;
  const legacy = value.schemaVersion === 1;
  const current = value.schemaVersion === PROJECT_DRAFT_SCHEMA_VERSION;
  const expected = legacy
    ? "brief,name,roomProgram,schemaVersion,selectedOption"
    : current
      ? "activeMode,brief,conceptProposal,name,roomProgram,schemaVersion,selectedOption,wallMeshPreset"
      : "activeMode,brief,conceptProposal,name,roomProgram,schemaVersion,selectedOption";
  if (Object.keys(value).sort().join(",") !== expected) return null;
  if (typeof value.name !== "string" || value.name.trim().length < 1 || value.name.length > 80) return null;
  if (value.selectedOption !== 1 && value.selectedOption !== 2) return null;
  const briefResult = parseWorkspaceBrief(value.brief);
  const roomProgram = parseRoomProgram(value.roomProgram);
  if (!briefResult.ok || !briefResult.brief || !roomProgram) return null;
  const activeMode = legacy ? "template" : value.activeMode;
  if (activeMode !== "template" && activeMode !== "concept") return null;
  const layout = generateLayout(toLayoutBrief(briefResult.brief));
  if (!layout.ok || (activeMode === "template" && layout.options.some((option) =>
    !buildRoomPlan(option.geometry, roomProgram, option.coreSide).ok
  ))) return null;
  const wallMeshPreset = current ? parseWallMeshPreset(value.wallMeshPreset) : { ...DEFAULT_WALL_MESH_PRESET };
  if (!wallMeshPreset) return null;
  const compiled = legacy || value.conceptProposal === null
    ? null
    : compileDesignProposal(value.conceptProposal);
  if (compiled && !compiled.ok) return null;
  if (activeMode === "concept" && !compiled?.ok) return null;
  if (activeMode === "concept" && compiled?.ok
      && !designMatchesSite(compiled.proposal, briefResult.brief.siteWidth, briefResult.brief.siteDepth)) return null;
  return {
    schemaVersion: 3,
    name: value.name.trim(),
    brief: briefResult.brief,
    roomProgram,
    selectedOption: value.selectedOption,
    activeMode,
    conceptProposal: compiled?.ok ? compiled.proposal : null,
    wallMeshPreset,
  };
}

export function createProjectDraft(
  name: string,
  brief: WorkspaceBrief,
  roomProgram: RoomProgram,
  selectedOption: 1 | 2,
  activeMode: "template" | "concept" = "template",
  conceptProposal: DesignProposal | null = null,
  wallMeshPreset: WallMeshPreset = DEFAULT_WALL_MESH_PRESET,
): ProjectDraft | null {
  return parseProjectDraft({
    schemaVersion: PROJECT_DRAFT_SCHEMA_VERSION,
    name,
    brief,
    roomProgram,
    selectedOption,
    activeMode,
    conceptProposal,
    wallMeshPreset,
  });
}
