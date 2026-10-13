import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/architect/cad-agent", () => ({
  cadAgentAvailable: vi.fn(), cadCompletionReady: vi.fn(() => false), getCadSandbox: vi.fn(), parseCadInput: vi.fn(),
  proposeCadAction: vi.fn(), proposeCadCommands: vi.fn(), compileCadCommands: vi.fn(() => "generated-safe-action"), rollbackCadProject: vi.fn(), readCadDownload: vi.fn(), readCadInspection: vi.fn(),
  retryCadSetup: vi.fn(), runCadAction: vi.fn(), setupCadSandbox: vi.fn(),
}));
vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));

import { GET, POST } from "../../app/api/architect/cad-agent/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { cadAgentAvailable, cadCompletionReady, getCadSandbox, parseCadInput, proposeCadCommands, readCadInspection, runCadAction, setupCadSandbox } from "../../lib/architect/cad-agent";
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
});
