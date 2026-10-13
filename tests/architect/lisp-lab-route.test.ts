import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("../../lib/architect/concept-board", () => ({ isConceptBoardAvailable: vi.fn(() => true) }));
vi.mock("../../lib/architect/lisp-lab", () => ({ LISP_LAB_LIMITS: { brief: 2000 }, generateAutoLisp: vi.fn() }));

import { POST } from "../../app/api/architect/lisp-lab/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { generateAutoLisp } from "../../lib/architect/lisp-lab";
import { resetRequestGuards } from "../../lib/request-guards";

const makeRequest = (brief = "plan", origin = "http://localhost:3000") => new Request("http://localhost/api/architect/lisp-lab", {
  method: "POST", headers: { Origin: origin, Authorization: "Bearer test", "Content-Type": "application/json" }, body: JSON.stringify({ brief }),
});

beforeEach(() => {
  vi.clearAllMocks(); resetRequestGuards();
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
  vi.mocked(generateAutoLisp).mockResolvedValue({ source: "(defun c:QATTANPLAN ())\n", model: "anthropic/claude-sonnet-5.5", usage: { promptTokens: 20, completionTokens: 50, costUsd: 0.001 } });
});

describe("AutoLISP route", () => {
  it("uses admin and same-origin gates before generating", async () => {
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(makeRequest())).status).toBe(404);
    expect(generateAutoLisp).not.toHaveBeenCalled();
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "pilot-owner" });
    expect((await POST(makeRequest("plan", "https://evil.example"))).status).toBe(403);
    expect(generateAutoLisp).not.toHaveBeenCalled();
  });

  it("returns downloadable-source data only after one valid generation", async () => {
    const response = await POST(makeRequest("20 m two-apartment plan"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ source: "(defun c:QATTANPLAN ())\n", verified: false, executed: false });
    expect(generateAutoLisp).toHaveBeenCalledExactlyOnceWith("20 m two-apartment plan");
  });

  it("rejects oversized briefs before model generation", async () => {
    expect((await POST(makeRequest("x".repeat(2001)))).status).toBe(400);
    expect(generateAutoLisp).not.toHaveBeenCalled();
  });
});
