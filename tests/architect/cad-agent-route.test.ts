import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/architect/cad-agent", () => ({
  CadGeometryBoundsError: class CadGeometryBoundsError extends Error { constructor(readonly violations: { label: string; id: string; boundsMm: number[]; siteMm: number[] }[]) { super(`CAD validation failed: geometry outside the site boundary: ${violations.map((item) => `${item.label} (id=${item.id}, boundsMm=[${item.boundsMm.join(",")}], siteMm=[0,0,${item.siteMm.join(",")}])`).join("; ")}. Keep the full geometry inside the site, including wall thicknesses, door swing arcs, dimensions, and rotated symbols.`) } },
  CadCommandValidationError: class CadCommandValidationError extends Error { constructor(readonly diagnostic: unknown) { super("CAD model output invalid") } },
  CadFreeCADExecutionError: class CadFreeCADExecutionError extends Error { constructor(message: string, readonly operation?: string, readonly objectId?: string) { super(message); this.name = "CadFreeCADExecutionError" } },
  CadModelTimeoutError: class CadModelTimeoutError extends Error { constructor(readonly attempt: number) { super("CAD model request timed out"); this.name = "CadModelTimeoutError" } },
  cadAgentAvailable: vi.fn(), cadCompletionReady: vi.fn(() => false), getCadSandbox: vi.fn(), parseCadInput: vi.fn(),
  proposeCadAction: vi.fn(), proposeCadCommands: vi.fn(), critiqueCadPlan: vi.fn(), compileCadCommands: vi.fn(() => "generated-safe-action"), rollbackCadProject: vi.fn(), readCadDownload: vi.fn(), readCadInspection: vi.fn(),
  retryCadSetup: vi.fn(), runCadAction: vi.fn(), setupCadSandbox: vi.fn(),
}));
vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));

import { GET, POST } from "../../app/api/architect/cad-agent/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { CadFreeCADExecutionError, CadGeometryBoundsError, CadModelTimeoutError, cadAgentAvailable, cadCompletionReady, critiqueCadPlan, getCadSandbox, parseCadInput, proposeCadCommands, readCadInspection, runCadAction, setupCadSandbox } from "../../lib/architect/cad-agent";
import { resetRequestGuards } from "../../lib/request-guards";

const projectId = "0123456789abcdef01234567";
const input = { projectId, instruction: "two apartments", siteWidth: 20, siteDepth: 20, step: 0 };
const sandbox = { stop: vi.fn().mockResolvedValue(undefined) };
const request = () => new Request("http://localhost/api/architect/cad-agent", {
  method: "POST", headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" },
  body: JSON.stringify(input),
});

beforeEach(() => {
  vi.clearAllMocks(); resetRequestGuards();
  vi.mocked(cadAgentAvailable).mockReturnValue(true);
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "owner" });
  vi.mocked(parseCadInput).mockReturnValue(input);
  vi.mocked(getCadSandbox).mockResolvedValue(sandbox as never);
  vi.mocked(setupCadSandbox).mockResolvedValue("ready");
  vi.mocked(readCadInspection).mockResolvedValue({ inspection: null, preview: null });
  vi.mocked(critiqueCadPlan).mockResolvedValue(null);
  vi.mocked(proposeCadCommands).mockResolvedValue({ commands: [{ op: "wall", id: "wall-a", from: [0, 0], to: [1000, 0], thickness: 200 }], summary: "رسمت", selfReview: [], requiredElements: [], unresolvedItems: [], done: false });
  vi.mocked(runCadAction).mockResolvedValue({ inspection: { ok: true, counts: { WALL: 8 }, warnings: [], objects: [], segments: 20, siteMm: [20000, 20000] }, preview: "<svg/>" });
});

describe("CAD agent route", () => {
  it("does not create a sandbox for public or disabled callers", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(request())).status).toBe(404);
    expect((await GET(new Request(`http://localhost/api/architect/cad-agent?projectId=${projectId}`))).status).toBe(404);
    expect(getCadSandbox).not.toHaveBeenCalled();
    vi.mocked(cadAgentAvailable).mockReturnValue(false);
    expect((await POST(request())).status).toBe(404);
    expect(getCadSandbox).not.toHaveBeenCalled();
  });

  it("executes FreeCAD only after setup and model output are valid", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect((await response.json()).done).toBe(false);
    expect(cadCompletionReady).toHaveBeenCalledOnce();
    expect(proposeCadCommands).toHaveBeenCalledWith(input, null, null);
    expect(runCadAction).toHaveBeenCalledWith(sandbox, input, expect.objectContaining({ summary: "رسمت", done: false, python: "generated-safe-action" }));
    expect(sandbox.stop).toHaveBeenCalledOnce();
    vi.mocked(setupCadSandbox).mockResolvedValue("installing");
    expect((await POST(request())).status).toBe(202);
    expect(proposeCadCommands).toHaveBeenCalledTimes(1);
    expect(runCadAction).toHaveBeenCalledTimes(1);
  });

  it("returns an actionable timeout while leaving the last saved drawing untouched", async () => {
    vi.mocked(proposeCadCommands).mockRejectedValueOnce(new CadModelTimeoutError(2));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request());
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body.error).toContain("الرسم المحفوظ لم يتغير");
      expect(runCadAction).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith("[CAD_STEP_FAILED]", expect.stringContaining('"kind":"model_timeout","attempt":2'));
    } finally { log.mockRestore(); }
  });

  it("runs post-execution critique on every selected-concept stage and fails visibly when it is unavailable", async () => {
    const concept = { id: "A", title: "Court", strategy: "court", idea: "Court", circulation: "Core", siteWidthM: 20, siteDepthM: 20, program: [], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] };
    vi.mocked(parseCadInput).mockReturnValue({ ...input, selectedConcept: concept } as never);
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(critiqueCadPlan).toHaveBeenCalledOnce();
    expect(body.done).toBe(false);
    expect(body.architectureReview.verdict).toBe("revise");
    expect(body.unresolvedItems).toContain("Post-execution visual critique did not return a validated review; architectural status remains unverified");
  });

  it("logs an unexpected critic exception without forwarding its message", async () => {
    const concept = { id: "A", title: "Court", strategy: "court", idea: "Court", circulation: "Core", siteWidthM: 20, siteDepthM: 20, program: [], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] };
    vi.mocked(parseCadInput).mockReturnValue({ ...input, selectedConcept: concept } as never);
    vi.mocked(critiqueCadPlan).mockRejectedValueOnce(new TypeError("private raw provider response"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await POST(request());
      const body = await response.json();
      expect(response.status).toBe(200);
      expect(body.architectureReview.verdict).toBe("revise");
      expect(warning).toHaveBeenCalledWith("[CAD_REVIEW_FAILED]", JSON.stringify({ category: "unexpected_exception", errorName: "TypeError" }));
      expect(JSON.stringify(warning.mock.calls)).not.toContain("private raw provider response");
    } finally { warning.mockRestore(); }
  });

  it("returns actionable bounded geometry details so the admin retry can correct the offending ID", async () => {
    const violation = { code: "OUTSIDE_SITE" as const, id: "door-west", label: "DOOR_door-west", boundsMm: [-120, 2500, 900, 3400] as [number, number, number, number], siteMm: [20_000, 20_000] as [number, number] };
    vi.mocked(runCadAction).mockRejectedValueOnce(new CadGeometryBoundsError([violation]));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request());
      const body = await response.json();
      expect(response.status).toBe(502);
      expect(body.error).toContain("FreeCAD action failed:");
      expect(body.error).toContain("id=door-west");
      expect(body.error).toContain("boundsMm=[-120,2500,900,3400]");
      expect(body.error).toContain("rotated symbols");
      expect(log).toHaveBeenCalledWith("[CAD_STEP_FAILED]", JSON.stringify({ kind: "geometry_outside_site", violations: [violation] }));
    } finally { log.mockRestore(); }
  });

  it("logs only validated FreeCAD operation context for execution failures", async () => {
    vi.mocked(runCadAction).mockRejectedValueOnce(new CadFreeCADExecutionError("FreeCAD action failed: private raw traceback", "move", "st-main"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await POST(request());
      expect(response.status).toBe(502);
      expect(log).toHaveBeenCalledWith("[CAD_STEP_FAILED]", JSON.stringify({ kind: "freecad_execution_failed", errorName: "CadFreeCADExecutionError", operation: "move", id: "st-main" }));
      expect(JSON.stringify(log.mock.calls)).not.toContain("private raw traceback");
    } finally { log.mockRestore(); }
  });
});
