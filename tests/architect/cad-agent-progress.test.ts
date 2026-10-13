import { describe, expect, it } from "vitest";
import { formatCadRepairFeedback, verifyCadProgressSnapshot } from "../../lib/architect/cad-agent-progress";

const current = { projectId: "a".repeat(24), siteWidth: 20, siteDepth: 20, inspection: { counts: { WALL: 9, DOOR: 1 }, objects: 14, segments: 37 } };
const saved = { projectId: current.projectId, brief: "draw selected plan", siteWidth: 20, siteDepth: 20, completedSteps: 2, counts: { WALL: 9, DOOR: 1 }, objects: 14, segments: 37 };

describe("CAD stage resume checkpoint", () => {
  it("puts concrete blocking IDs before summary text and preserves them within the bounded feedback", () => {
    const feedback = formatCadRepairFeedback({
      verdict: "revise",
      summary: "A very long general summary ".repeat(20),
      issues: [
        { dimension: "clearance", severity: "improvement", objectIds: ["bed-a"], finding: "Bed close to door", proposedEdit: "Move bed" },
        { dimension: "circulation", severity: "blocking", objectIds: ["st-main", "d-entry"], finding: "Stair isolated from entry", proposedEdit: "Move stair beside shared access and retain a clear path" },
        { dimension: "clearance", severity: "blocking", objectIds: ["d-a-entry", "d-a-entry-copy"], finding: "Duplicate apartment entry door overlaps the existing door.", proposedEdit: "Delete d-a-entry-copy and keep one door." },
      ],
      rubric: [],
    }, []);
    expect(feedback).toContain("IDs=st-main,d-entry");
    expect(feedback).toContain("IDs=d-a-entry,d-a-entry-copy");
    expect(feedback.indexOf("IDs=d-a-entry")).toBeLessThan(feedback.indexOf("IDs=st-main"));
    expect(feedback.indexOf("IDs=st-main")).toBeLessThan(feedback.indexOf("IDs=bed-a"));
    expect(feedback.length).toBeLessThanOrEqual(1450);
    expect(feedback).toContain("Do not add another door");
  });

  it("resumes only when project identity, site, and observed saved geometry match", () => {
    expect(verifyCadProgressSnapshot(saved, current)).toMatchObject({ completedSteps: 2, brief: "draw selected plan" });
    expect(verifyCadProgressSnapshot({ ...saved, projectId: "b".repeat(24) }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, siteWidth: 19 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, objects: 13 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, counts: { WALL: 8, DOOR: 1 } }, current)).toBeNull();
  });

  it("rejects malformed, out-of-range, and empty-project checkpoints", () => {
    expect(verifyCadProgressSnapshot({ ...saved, completedSteps: 7 }, current)).toBeNull();
    expect(verifyCadProgressSnapshot({ ...saved, brief: "" }, current)).toBeNull();
    expect(verifyCadProgressSnapshot(saved, { ...current, inspection: null })).toBeNull();
  });
});
