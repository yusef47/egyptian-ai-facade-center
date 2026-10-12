import { describe, expect, it } from "vitest";
import { CAD_AGENT, parseCadAction, parseCadInput, sandboxName } from "../../lib/architect/cad-agent";

const valid = {
  projectId: "0123456789abcdef01234567",
  instruction: "Design two apartments on a 20 m by 20 m site",
  siteWidth: 20,
  siteDepth: 20,
  step: 0,
};

describe("CAD agent input and execution contracts", () => {
  it("accepts a bounded project and rejects a forged or oversized request", () => {
    expect(parseCadInput(valid)).toEqual(valid);
    expect(parseCadInput({ ...valid, projectId: "../../other" })).toBeNull();
    expect(parseCadInput({ ...valid, siteWidth: 0 })).toBeNull();
    expect(parseCadInput({ ...valid, step: CAD_AGENT.maxSteps })).toBeNull();
    expect(parseCadInput({ ...valid, instruction: "a".repeat(CAD_AGENT.maxBrief + 1) })).toBeNull();
  });

  it("uses the authenticated owner as part of the persistent sandbox name", () => {
    expect(sandboxName("admin-one")).not.toBe(sandboxName("admin-two"));
    expect(sandboxName("admin-one")).toMatch(/^qattan-cad-[0-9a-f]{22}$/);
  });

  it("requires an actual FreeCAD action before accepting a model response", () => {
    expect(parseCadAction(JSON.stringify({ python: "doc.recompute()", summary: "تم", done: false }))).toEqual({ python: "doc.recompute()", summary: "تم", done: false });
    expect(parseCadAction(JSON.stringify({ python: "", summary: "تم", done: true }))).toBeNull();
    expect(parseCadAction(JSON.stringify({ python: "x".repeat(CAD_AGENT.maxCode + 1), summary: "تم", done: true }))).toBeNull();
  });
});
