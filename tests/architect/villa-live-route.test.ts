import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/architect/villa-live", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/architect/villa-live")>();
  return { ...original, generateVillaDesign: vi.fn(), buildVillaStages: vi.fn() };
});
vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));

import { POST } from "../../app/api/architect/villa-live/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { buildVillaStages, generateVillaDesign } from "../../lib/architect/villa-live";
import { resetRequestGuards } from "../../lib/request-guards";

beforeEach(() => {
  resetRequestGuards();
  vi.clearAllMocks();
  vi.stubEnv("QATTAN_BLENDER_LAB_ENABLED", "1");
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "owner" });
});

function request() {
  return new Request("http://localhost/api/architect/villa-live", {
    method: "POST",
    headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" },
    body: JSON.stringify({ brief: "a warm modern villa" }),
  });
}

describe("villa streaming route", () => {
  it("does no paid work for unauthorized visitors", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(request())).status).toBe(404);
    expect(generateVillaDesign).not.toHaveBeenCalled();
    expect(buildVillaStages).not.toHaveBeenCalled();
  });

  it("streams true exported stages and a completion event", async () => {
    vi.mocked(generateVillaDesign).mockResolvedValue({ design: { style: "warm", poolSide: "left" }, source: "model" });
    vi.mocked(buildVillaStages).mockImplementation(async function* () {
      yield { stage: 1, label: "site", glbBase64: "Z2xURg==" };
      yield { stage: 2, label: "house", glbBase64: "Z2xURg==" };
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string; stage?: number });
    expect(events.filter((event) => event.type === "stage").map((event) => event.stage)).toEqual([1, 2]);
    expect(events.at(-1)?.type).toBe("done");
  });
});
