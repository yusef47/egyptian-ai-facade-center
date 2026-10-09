import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/architect/blender-lab", () => ({
  isBlenderLabEnabled: vi.fn(),
  parseBlenderLabInput: vi.fn(),
  generateBlenderScript: vi.fn(),
  reviewBlenderScript: vi.fn(),
  runBlenderInSandbox: vi.fn(),
}));
vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));

import { GET, POST } from "../../app/api/architect/blender-lab/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { generateBlenderScript, isBlenderLabEnabled, parseBlenderLabInput, reviewBlenderScript, runBlenderInSandbox } from "../../lib/architect/blender-lab";
import { resetRequestGuards } from "../../lib/request-guards";

function request() {
  return new Request("http://localhost/api/architect/blender-lab", {
    method: "POST",
    headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: "building", siteWidth: 12, siteDepth: 20 }),
  });
}

beforeEach(() => {
  resetRequestGuards();
  vi.clearAllMocks();
  vi.mocked(isBlenderLabEnabled).mockReturnValue(true);
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "owner" });
  vi.mocked(parseBlenderLabInput).mockReturnValue({ instruction: "building", siteWidth: 12, siteDepth: 20 });
  vi.mocked(generateBlenderScript).mockResolvedValue({ script: "import bpy", reply: "تم" });
  vi.mocked(reviewBlenderScript).mockResolvedValue({ script: "import bpy\n# reviewed", reply: "تمت المراجعة" });
  vi.mocked(runBlenderInSandbox).mockResolvedValue(Buffer.from("glTF"));
});

describe("Blender Lab route cost gates", () => {
  it("does no paid work while the feature is disabled", async () => {
    vi.mocked(isBlenderLabEnabled).mockReturnValue(false);
    expect((await POST(request())).status).toBe(404);
    expect(authorizeArchitectPilot).not.toHaveBeenCalled();
    expect(generateBlenderScript).not.toHaveBeenCalled();
    expect(reviewBlenderScript).not.toHaveBeenCalled();
    expect(runBlenderInSandbox).not.toHaveBeenCalled();
  });

  it("does no paid work for a non-admin", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(request())).status).toBe(404);
    expect((await GET(request())).status).toBe(404);
    expect(generateBlenderScript).not.toHaveBeenCalled();
    expect(reviewBlenderScript).not.toHaveBeenCalled();
    expect(runBlenderInSandbox).not.toHaveBeenCalled();
  });

  it("runs the model and Sandbox only after all gates pass", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(generateBlenderScript).toHaveBeenCalledOnce();
    expect(reviewBlenderScript).toHaveBeenCalledWith({ instruction: "building", siteWidth: 12, siteDepth: 20 }, { script: "import bpy", reply: "تم" });
    expect(runBlenderInSandbox).toHaveBeenCalledWith("import bpy\n# reviewed");
    expect((await response.json()).glbBase64).toBe(Buffer.from("glTF").toString("base64"));
  });

  it("does not publish or execute a scene that fails the review gate", async () => {
    vi.mocked(reviewBlenderScript).mockRejectedValue(new Error("Reviewed Blender script still has geometry errors: opening outside wall"));
    const response = await POST(request());
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("لم يجتز مراجعة");
    expect(runBlenderInSandbox).not.toHaveBeenCalled();
  });
});
