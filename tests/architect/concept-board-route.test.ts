import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));
import { POST } from "../../app/api/architect/concept-board/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { resetRequestGuards } from "../../lib/request-guards";

const concepts = [
  { id: "A", title: "Central spine", strategy: "central-spine", siteWidthM: 20, siteDepthM: 20, idea: "A central shared hallway organizes both apartments around their entries.", circulation: "A short shared corridor reaches separate private apartment doors.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "north side", areaShare: 0.48 }, { name: "Home B", location: "south side", areaShare: 0.48 }] },
  { id: "B", title: "Courtyard loop", strategy: "courtyard", siteWidthM: 20, siteDepthM: 20, idea: "A planted courtyard brings light into the middle of the shared arrangement.", circulation: "A compact route loops the courtyard and branches to each apartment.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "east side", areaShare: 0.48 }, { name: "Home B", location: "west side", areaShare: 0.48 }] },
  { id: "C", title: "Split wings", strategy: "split-wing", siteWidthM: 20, siteDepthM: 20, idea: "Two offset wings give both apartments distinct quiet and active zones.", circulation: "A fork from the shared stair leads directly into each separate wing.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "northwest", areaShare: 0.48 }, { name: "Home B", location: "southeast", areaShare: 0.48 }] },
];
function request(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost/api/architect/concept-board", { method: "POST", headers: { Origin: origin, Authorization: "Bearer admin-session", "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.clearAllMocks(); resetRequestGuards();
  vi.stubEnv("QATTAN_BLENDER_LAB_ENABLED", "1");
  vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
  vi.stubEnv("OPENROUTER_API_KEY", "test-key");
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
});

describe("concept board route security and contract", () => {
  it("requires pilot authorization and same-site origin before generation", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(request({ action: "board", concepts }))).status).toBe(404);
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
    expect((await POST(request({ action: "board", concepts }, "https://evil.example"))).status).toBe(403);
  });

  it("returns schema errors before invoking any upstream service", async () => {
    const response = await POST(request({ action: "board", concepts: [{ id: "A" }] }));
    expect(response.status).toBe(400);
  });
});
