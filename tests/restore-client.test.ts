import { describe, expect, it, vi } from "vitest";
import { restoreFacade } from "../client/src/lib/restore";
import type { ToolId } from "../tools/registry";

function okFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
  });
}

describe("restore client toolId contract", () => {
  it("sends the selected toolId in the request body", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({
      imageDataUrl: "data:image/jpeg;base64,AAAA",
      prompt: "Design the space",
      toolId: "interior",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { toolId?: string };
    expect(body.toolId).toBe("interior");
  });

  it("keeps the legacy facade request working without a toolId", async () => {
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({
      imageDataUrl: "data:image/jpeg;base64,AAAA",
      prompt: "Restore the facade",
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { toolId?: string };
    expect(body.toolId).toBeUndefined();
  });

  it("throws the structured server error message on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Unsupported tool: hologram." }),
      }),
    );

    await expect(
      restoreFacade({
        imageDataUrl: "data:image/jpeg;base64,AAAA",
        prompt: "Design",
        toolId: "hologram" as ToolId,
      }),
    ).rejects.toThrow(/unsupported tool/i);
  });
});
