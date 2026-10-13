import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConceptStudioWorkspace } from "../../components/architect/ConceptStudioWorkspace";

const cadWorkspace = vi.fn((props: { selectedConcept?: { id: string; title: string }; sourceBrief?: string; conceptRunId?: string; conceptBoardDataUrl?: string }) => <div data-testid="cad-workspace">CAD concept {props.selectedConcept?.id}</div>);
vi.mock("../../components/architect/CadAgentWorkspace", () => ({ CadAgentWorkspace: (props: Parameters<typeof cadWorkspace>[0]) => cadWorkspace(props) }));
vi.mock("../../lib/supabase", () => ({ getSupabaseBrowserClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-admin-token" } } }) } }) }));

const concepts = [
  { id: "A", title: "Central spine", strategy: "central-spine", siteWidthM: 20, siteDepthM: 20, idea: "A central shared hallway organizes both apartments around their entries.", circulation: "A short shared corridor reaches separate private apartment doors.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "north side", areaShare: 0.48 }, { name: "Home B", location: "south side", areaShare: 0.48 }] },
  { id: "B", title: "Courtyard loop", strategy: "courtyard", siteWidthM: 20, siteDepthM: 20, idea: "A planted courtyard brings light into the middle of the shared arrangement.", circulation: "A compact route loops the courtyard and branches to each apartment.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "east side", areaShare: 0.48 }, { name: "Home B", location: "west side", areaShare: 0.48 }] },
  { id: "C", title: "Split wings", strategy: "split-wing", siteWidthM: 20, siteDepthM: 20, idea: "Two offset wings give both apartments distinct quiet and active zones.", circulation: "A fork from the shared stair leads directly into each separate wing.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "northwest", areaShare: 0.48 }, { name: "Home B", location: "southeast", areaShare: 0.48 }] },
];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); cadWorkspace.mockClear(); });

describe("Concept Studio state flow", () => {
  it("requires separate brief, one-board, panel-selection and continue actions before CAD", async () => {
    const board = "data:image/jpeg;base64,/9j/2Q==";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ type: "concepts", reply: "Three different concepts.", concepts }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageDataUrl: board, requestCount: 1, costUsd: 0.01, model: "Nano Banana 2 Lite" }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const { unmount } = render(<ConceptStudioWorkspace />);
    expect(screen.queryByTestId("cad-workspace")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    const sourceBrief = "على أرض 24×18 متر أريد شقتين؛ لا تحذف عدد الغرف أو المدخل المشترك عند تحويل الفكرة إلى CAD.";
    await user.clear(screen.getByLabelText("وصف المشروع"));
    await user.type(screen.getByLabelText("وصف المشروع"), sourceBrief);
    await user.click(screen.getByRole("button", { name: "حلّل الطلب واقترح مفاهيم" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/architect/concept-board");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ action: "dialogue", brief: sourceBrief });
    expect(screen.getByLabelText("وصف المشروع")).toBeDisabled();
    expect(screen.getByText("Courtyard loop", { exact: false })).toBeInTheDocument();
    expect(screen.queryByTestId("cad-workspace")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /أنشئ لوحة المقارنة/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.getByAltText("لوحة مفاهيم معمارية بثلاثة بدائل")).toBeInTheDocument();
    expect(screen.queryByTestId("cad-workspace")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "اختيار المفهوم B" }));
    expect(screen.getByText(/اختيارك: المفهوم B/)).toBeInTheDocument();
    expect(screen.queryByTestId("cad-workspace")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "تابع إلى CAD بالمفهوم B" }));
    expect(screen.getByTestId("cad-workspace")).toHaveTextContent("CAD concept B");
    expect(cadWorkspace).toHaveBeenCalledWith(expect.objectContaining({ selectedConcept: expect.objectContaining({ id: "B", strategy: "courtyard" }), sourceBrief, conceptRunId: expect.any(String), conceptBoardDataUrl: board }));
    const firstConceptRunId = cadWorkspace.mock.calls.at(-1)?.[0].conceptRunId;
    await user.click(screen.getByRole("button", { name: "تغيير الاختيار" }));
    await user.click(screen.getByRole("button", { name: "اختيار المفهوم A" }));
    await user.click(screen.getByRole("button", { name: "تابع إلى CAD بالمفهوم A" }));
    expect(cadWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ selectedConcept: expect.objectContaining({ id: "A" }), sourceBrief, conceptRunId: firstConceptRunId, conceptBoardDataUrl: board }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
    render(<ConceptStudioWorkspace />);
    await waitFor(() => expect(screen.getByAltText("لوحة مفاهيم معمارية بثلاثة بدائل")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("cad-workspace")).not.toBeInTheDocument();
  }, 15_000);

  it("carries the original brief and clarification answer into CAD", async () => {
    const board = "data:image/jpeg;base64,/9j/2Q==";
    const sourceBrief = "أريد شقتين على أرض 20×20 متر مع مدخل مشترك.";
    const clarification = "اجعل المبنى ثلاثة طوابق، وثلاث غرف نوم في كل شقة.";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ type: "clarify", reply: "قبل إعداد البدائل", question: "كم عدد الطوابق والغرف؟" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ type: "concepts", reply: "ثلاثة بدائل", concepts }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ imageDataUrl: board, requestCount: 1, costUsd: null }) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ConceptStudioWorkspace />);
    await user.clear(screen.getByLabelText("وصف المشروع"));
    await user.type(screen.getByLabelText("وصف المشروع"), sourceBrief);
    await user.click(screen.getByRole("button", { name: "حلّل الطلب واقترح مفاهيم" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await user.type(screen.getByPlaceholderText("أجب عن السؤال أو أضف تفضيلًا..."), clarification);
    await user.click(screen.getByRole("button", { name: "أرسل الإجابة" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: "حلّل الطلب واقترح مفاهيم" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /أنشئ لوحة المقارنة/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await user.click(screen.getByRole("button", { name: "اختيار المفهوم C" }));
    await user.click(screen.getByRole("button", { name: "تابع إلى CAD بالمفهوم C" }));
    expect(cadWorkspace).toHaveBeenLastCalledWith(expect.objectContaining({ sourceBrief: expect.stringContaining(sourceBrief), selectedConcept: expect.objectContaining({ id: "C" }) }));
    expect(cadWorkspace.mock.calls.at(-1)?.[0].sourceBrief).toContain(clarification);
  }, 15_000);
});
