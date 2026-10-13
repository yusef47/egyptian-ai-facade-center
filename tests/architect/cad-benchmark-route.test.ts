import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/admin", () => ({ authorizeArchitectPilot: vi.fn() }));
vi.mock("../../lib/credits", () => ({ getSupabaseAdminClient: vi.fn() }));

import { POST } from "../../app/api/architect/cad-benchmark/route";
import { authorizeArchitectPilot } from "../../lib/admin";
import { getSupabaseAdminClient } from "../../lib/credits";
import { resetRequestGuards } from "../../lib/request-guards";

const model = "anthropic/claude-sonnet-5.5";
const request = (selected = model) => new Request("http://localhost:3000/api/architect/cad-benchmark", {
  method: "POST",
  headers: { Origin: "http://localhost:3000", Authorization: "Bearer test", "Content-Type": "application/json" },
  body: JSON.stringify({ model: selected }),
});

const originalKey = process.env.OPENROUTER_API_KEY;

beforeEach(() => {
  resetRequestGuards();
  process.env.OPENROUTER_API_KEY = "test-key";
  vi.mocked(getSupabaseAdminClient).mockReturnValue({} as never);
  vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "owner" });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
  else process.env.OPENROUTER_API_KEY = originalKey;
});

describe("CAD benchmark route", () => {
  it("blocks non-admin callers and unlisted models before any upstream call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: false, reason: "forbidden" });
    expect((await POST(request())).status).toBe(404);
    vi.mocked(authorizeArchitectPilot).mockResolvedValue({ authorized: true, userId: "owner" });
    expect((await POST(request("unlisted/model"))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("streams a medium-reasoning response and returns a parsed furnished spec", async () => {
    const output = { spec: { walls: [{}], openings: [{}], rooms: [{}] }, furniture: [{ name: "double_bed", at: [1000, 1000] }] };
    const event = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
    const source = event({ choices: [{ delta: { content: JSON.stringify(output).slice(0, 35) }, finish_reason: null }] })
      + event({ choices: [{ delta: { content: JSON.stringify(output).slice(35) }, finish_reason: "stop" }], usage: { cost: 0.01 } })
      + "data: [DONE]\n\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, { status: 200 })));
    const response = await POST(request());
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: result");
    expect(text).toContain('"validJson":true');
    expect(text).toContain('"cost":0.01');
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"reasoning":{"max_tokens":9000}'),
    }));
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"stream":true'),
    }));
  });

  it("keeps a truncated response for diagnosis and never marks it valid", async () => {
    const output = { spec: { walls: [{}], openings: [{}], rooms: [{}] }, furniture: [] };
    const source = `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(output) }, finish_reason: "length" }], usage: { completion_tokens: 18000 } })}\n\n`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(source, { status: 200 })));
    const response = await POST(request("anthropic/claude-opus-5.5"));
    const body = await response.text();
    expect(body).toContain('"finishReason":"length"');
    expect(body).toContain('"validJson":false');
    expect(body).toContain('"rawResponse":');
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      body: expect.stringContaining('"max_tokens":18000'),
    }));
  });
});
