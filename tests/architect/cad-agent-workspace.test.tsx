import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CadAgentWorkspace } from "../../components/architect/CadAgentWorkspace";

vi.mock("../../lib/supabase", () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-admin-token" } } }) } }) }));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("CAD workspace selected concept state", () => {
  it("keeps the frozen source brief when starting a new CAD project", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, json: async () => ({ state: "ready", previewSvg: null, inspection: null }) }));
    vi.stubGlobal("fetch", fetchMock);
    const sourceBrief = "أريد شقتين مستقلتين، ثلاث غرف نوم لكل شقة، ومدخلًا مشتركًا على أرض 24×18 متر.";
    const selectedConcept = { id: "B" as const, title: "Courtyard loop", strategy: "courtyard" as const, siteWidthM: 24, siteDepthM: 18, idea: "A courtyard organizes the rooms around a bright center.", circulation: "A compact circulation loop reaches each private apartment.", program: ["two apartments"], zones: [{ name: "Apartment A", location: "north wing", areaShare: 0.45 }, { name: "Apartment B", location: "south wing", areaShare: 0.45 }] };
    const user = userEvent.setup();
    render(<CadAgentWorkspace selectedConcept={selectedConcept} sourceBrief={sourceBrief} conceptRunId="run-1" />);
    const instruction = screen.getByPlaceholderText("اوصف المخطط أو التعديل اللي عايزه...");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(instruction).toHaveValue(sourceBrief);
    await user.click(screen.getByRole("button", { name: "مشروع جديد" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(instruction).toHaveValue(sourceBrief);
    const ids = fetchMock.mock.calls.map(([input]) => new URL(String(input), "https://example.test").searchParams.get("projectId"));
    expect(ids[0]).not.toBe(ids[1]);
  });
});
