import { describe, expect, it } from "vitest";
import { verifyCadProgressSnapshot } from "../../lib/architect/cad-agent-progress";

const current = { projectId: "a".repeat(24), siteWidth: 20, siteDepth: 20, inspection: { counts: { WALL: 9, DOOR: 1 }, objects: 14, segments: 37 } };
const saved = { projectId: current.projectId, brief: "draw selected plan", siteWidth: 20, siteDepth: 20, completedSteps: 2, counts: { WALL: 9, DOOR: 1 }, objects: 14, segments: 37 };

describe("CAD stage resume checkpoint", () => {
  it("resumes only when project identity, site, and observed saved geometry match", () => {
    expect(verifyCadProgressSnapshot(saved, current)).toMatchObject({ completedSteps: 2, brief: "draw selected plan" });
    expect(verifyCadProgressSnapshot({ ...saved, projectId: "b".repeat(24) }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, siteWidth: 19 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, objects: 13 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, counts: { WALL: 8, DOOR: 1 } }, current)).toBeNull();
  });

  it("rejects malformed, out-of-range, and empty-project checkpoints", () => {
    expect(verifyCadProgressSnapshot({ ...saved, completedSteps: 5 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, brief: "" }, current)).toBeNull();
    expect(verifyCadProgressSnapshot(saved, { ...current, inspection: null })).toBeNull();
  });
});
