import { render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ArchitectWorkspace from "../../components/architect/ArchitectWorkspace";
import { sampleBuildingProposal } from "./building-fixture";
import { parseProjectDraft } from "../../lib/architect/project-draft";

/** Queue of scripted POST responses; each entry may be a promise (pending). */
let postResponses: Array<
  { status: number; body: unknown } | Promise<{ status: number; body: unknown }>
> = [];
let probeResponse: { available: boolean; cost: number } = { available: true, cost: 1 };
let fetchMock: ReturnType<typeof vi.fn>;

const originalConcept = {
  version: 2,
  site: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 20 }, { x: 0, y: 20 }],
  cells: [
    { id: "living", name: "Living", kind: "living", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 10 }, { x: 0, y: 10 }] },
    { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 10 }, { x: 8, y: 10 }] },
  ],
  doors: [
    { from: "living", to: "outside", width: 1, at: 0.5 },
    { from: "living", to: "bedroom", width: 0.9, at: 0.5 },
  ],
  windows: [{ space: "bedroom", edgeIndex: 1, width: 1.5, at: 0.5 }],
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function patchOutcome(patch: unknown, reply: string) {
  return { ok: true, outcome: { type: "patch", patch, reply }, creditsRemaining: 9, cost: 1 };
}
function messageOutcome(type: "clarify" | "unsupported", reply: string) {
  return { ok: true, outcome: { type, reply }, creditsRemaining: 9, cost: 1 };
}

function postCalls(): RequestInit[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => init as RequestInit);
}

beforeEach(() => {
  window.localStorage.clear();
  postResponses = [];
  probeResponse = { available: true, cost: 1 };
  fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (!init || init.method !== "POST") return jsonResponse(probeResponse);
    const next = postResponses.shift() ?? { status: 200, body: patchOutcome({ version: 1 }, "ok") };
    const value = await next;
    return jsonResponse(value.body, value.status);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text: string) {
  const textarea = screen.getByRole("textbox", { name: /Plan assistant|مساعد المخطط/ });
  await user.click(textarea);
  await user.keyboard(text);
  await user.keyboard("{Enter}");
}

describe("ArchitectWorkspace layout and canvas", () => {
  it("edits a stair locally, rejects a blocked core door and preserves it in the saved draft", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    const raw = readFileSync("examples/architect-two-floor-demo.json", "utf8");
    const file = new File([raw], "architect-two-floor-demo.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => raw });
    await user.upload(screen.getByLabelText("Open project"), file);
    expect(await screen.findByText("Floor connection review")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit stairs and landings" }));
    const startX = screen.getByLabelText("Start X");
    await user.clear(startX);
    await user.type(startX, "2.6");
    await user.click(screen.getByRole("button", { name: "Validate and apply" }));
    expect(screen.getByRole("alert")).toHaveTextContent("The stair blocks a core doorway");
    await user.clear(startX);
    await user.type(startX, "1.4");
    await user.click(screen.getByRole("button", { name: "Validate and apply" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").conceptProposal.stairs[0].start.x).toBe(1.4));
    expect(postCalls()).toHaveLength(0);
  });

  it("opens the supplied two-floor demo project without a model call", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="ar" />);
    const raw = readFileSync("examples/architect-two-floor-demo.json", "utf8");
    expect(parseProjectDraft(JSON.parse(raw))).not.toBeNull();
    const file = new File([raw], "architect-two-floor-demo.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => raw });
    await user.upload(screen.getByLabelText("فتح مشروع"), file);
    expect(await screen.findByText("تصور مبنى متعدد الأدوار")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /الدور الأول/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "اسم المشروع" })).toHaveValue("معاينة مبنى دورين");
    expect(screen.getByRole("link", { name: "SVG + تنسيق" })).toHaveAttribute("download", "qattan-ground-concept-coordination.svg");
    expect(screen.getByRole("link", { name: "DXF + تنسيق" })).toHaveAttribute("download", "qattan-ground-concept-coordination.dxf");
    expect(document.querySelectorAll('polygon[data-structural-kind="column"]')).toHaveLength(6);
    expect(document.querySelectorAll('polygon[data-structural-kind="beam"]')).toHaveLength(0);
    await user.click(screen.getByRole("tab", { name: /الدور الأول/ }));
    expect(document.querySelectorAll('polygon[data-structural-kind="beam"]')).toHaveLength(7);
    await user.click(screen.getByRole("checkbox", { name: "إظهار شبكة إنشائية غير محسوبة" }));
    expect(document.querySelector('g#structural-coordination')).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "إظهار شبكة إنشائية غير محسوبة" }));
    await user.click(screen.getByRole("button", { name: "نموذج المبنى 3D" }));
    expect(await screen.findByRole("img", { name: "معاينة طبقات المبنى ثلاثية الأبعاد" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "إظهار شبكة إنشائية غير محسوبة" })).toBeChecked();
    expect(screen.getByRole("link", { name: "تنزيل بيانات التنسيق الإنشائي JSON" })).toHaveAttribute(
      "download", "qattan-structural-coordination.json",
    );
    expect(screen.getByText(/6 عمود · 7 كمرة/)).toBeInTheDocument();
    expect(postCalls()).toHaveLength(0);
  });

  it("stages structural edits, rejects a blocked core, saves a valid edit and undoes it without a model call", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    const raw = readFileSync("examples/architect-two-floor-demo.json", "utf8");
    const file = new File([raw], "architect-two-floor-demo.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => raw });
    await user.upload(screen.getByLabelText("Open project"), file);
    await user.click(screen.getByRole("button", { name: "3D building model" }));
    await user.click(screen.getByRole("button", { name: "Edit columns and beams" }));
    const firstX = within(screen.getByRole("region", { name: "Columns" })).getAllByLabelText("X (m)")[0]!;
    await user.clear(firstX);
    await user.type(firstX, "1");
    await user.click(screen.getByRole("button", { name: "Validate and apply grid" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Column blocks the circulation core");
    expect(screen.getByRole("button", { name: "Validate and apply grid" })).toBeInTheDocument();
    expect(postCalls()).toHaveLength(0);

    await user.clear(firstX);
    await user.type(firstX, "4.5");
    await user.click(screen.getByRole("button", { name: "Validate and apply grid" }));
    expect(screen.queryByRole("button", { name: "Validate and apply grid" })).not.toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").conceptProposal.structure.columns[0].position.x).toBe(4.5));
    await user.click(screen.getByRole("button", { name: "Undo last edit" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").conceptProposal.structure.columns[0].position.x).toBe(4));
    await user.click(screen.getByRole("button", { name: "Edit columns and beams" }));
    await user.click(screen.getByRole("button", { name: "Remove grid from project" }));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").conceptProposal.structure).toBeUndefined());
    expect(screen.queryByRole("link", { name: "Download structural coordination JSON" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo last edit" }));
    expect(screen.getByRole("link", { name: "Download structural coordination JSON" })).toBeInTheDocument();
    expect(postCalls()).toHaveLength(0);
  });

  it("saves a valid draft locally and restores it when the workspace reopens", async () => {
    const user = userEvent.setup();
    const first = render(<ArchitectWorkspace locale="en" />);
    const width = screen.getByLabelText("Site width (m)");
    await user.clear(width);
    await user.type(width, "14");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").brief?.siteWidth).toBe(14));
    first.unmount();
    render(<ArchitectWorkspace locale="en" />);
    await waitFor(() => expect(screen.getByLabelText("Site width (m)")).toHaveValue(14));
    expect(screen.getByRole("link", { name: "Download project" })).toHaveAttribute("download", "qattan-architect-project.json");
  });

  it("renders the workspace shell with disclaimer, cost label, both options, and a live preview", async () => {
    render(<ArchitectWorkspace locale="en" />);

    expect(screen.getByRole("heading", { level: 1, name: "Architect Workspace" })).toBeInTheDocument();
    expect(screen.getByText(/Concept planning only/)).toBeInTheDocument();
    expect(screen.getByText(/Egyptian code compliance are not assessed/)).toBeInTheDocument();
    // Message cost is visible up front; local actions are declared free.
    expect(screen.getByText(/Each message costs 1 credit/)).toBeInTheDocument();
    expect(screen.getByText(/Undo are free/)).toBeInTheDocument();

    const option1 = screen.getByRole("article", { name: "Option 1" });
    const option2 = screen.getByRole("article", { name: "Option 2" });
    expect(within(option1).getByText("Core side: East")).toBeInTheDocument();
    expect(within(option2).getByText("Core side: West")).toBeInTheDocument();

    // Localized tradeoff (facts from the geometry) instead of engine prose.
    expect(screen.getByText(/Core on the east side/)).toBeInTheDocument();
    const areaItems = Array.from(document.querySelectorAll("li")).map((li) => li.textContent);
    expect(areaItems.some((text) => /Unit A\s*102\.9\s*m²/.test(text ?? ""))).toBe(true);
    expect(areaItems.some((text) => /Unit B\s*102\.9\s*m²/.test(text ?? ""))).toBe(true);
    expect(areaItems.some((text) => /Shared core\s*34\.3\s*m²/.test(text ?? ""))).toBe(true);

    await waitFor(() => expect(document.querySelector('svg[role="img"]')).toBeTruthy());
    expect(document.querySelectorAll('svg[role="img"]')).toHaveLength(1);
    expect(document.querySelector('g#walls')).toBeTruthy();
    expect(document.querySelector('g#dimensions')?.textContent).toContain("UNIT A");

    // Downloads hang off the selected option only.
    expect(screen.getByRole("link", { name: "Download SVG" })).toHaveAttribute(
      "download",
      "concept-preview-option-1.svg",
    );
    expect(screen.getByRole("link", { name: "Download DXF" })).toHaveAttribute(
      "download",
      "concept-preview-option-1.dxf",
    );
    // Compact direct controls are present for corrections.
    expect(screen.getByText("Direct controls")).toBeInTheDocument();
    expect((screen.getByRole("textbox", { name: "Plan assistant" }) as HTMLTextAreaElement).placeholder).toMatch(
      /add a bedroom to Unit A/,
    );
  });

  it("switches the focused plan and both download targets together", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    await user.click(screen.getByRole("radio", { name: "Select option 2" }));
    expect(screen.getByRole("radio", { name: "Select option 2" })).toBeChecked();
    expect(screen.getByRole("img", { name: /core on the West side/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download SVG" })).toHaveAttribute("download", "concept-preview-option-2.svg");
    expect(screen.getByRole("link", { name: "Download DXF" })).toHaveAttribute("download", "concept-preview-option-2.dxf");
  });

  it("toggles to illustrative massing while downloads remain editable 2D exports", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="ar" />);
    await user.click(screen.getByRole("button", { name: "كتل مجسّمة" }));
    expect(screen.getByRole("button", { name: "كتل مجسّمة" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("img", { name: "معاينة كتل مجسّمة تقريبية لنفس المخطط" })).toBeInTheDocument();
    expect(document.querySelector('svg[data-preview="concept-massing"]')).toBeTruthy();
    expect(screen.getByText(/ليست نموذجًا إنشائيًا/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تنزيل DXF" })).toHaveAttribute("download", "concept-preview-option-1.dxf");
    await user.click(screen.getByRole("button", { name: "مخطط 2D" }));
    expect(document.querySelector('svg[data-schema-version]')).toBeTruthy();
  });

  it("shows a clearly unanalysed structural grid with a coordination data export", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="ar" />);
    await user.click(screen.getByRole("button", { name: "إنشائي مبدئي" }));
    expect(screen.getByRole("img", { name: "شبكة أعمدة وكمرات وبلاطة للتنسيق فقط" })).toBeInTheDocument();
    expect(document.querySelectorAll("[data-column]")).toHaveLength(9);
    expect(document.querySelectorAll("[data-beam]")).toHaveLength(12);
    expect(screen.getByText(/بلا تحليل أو مقاسات/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تنزيل بيانات التنسيق JSON" })).toHaveAttribute("download", "concept-preview-option-1-structure.json");
    expect(screen.getByRole("link", { name: "تنزيل DXF" })).toHaveAttribute("download", "concept-preview-option-1-structure.dxf");
  });

  it("adds a room, regenerates the detailed plan and exports matching room CAD", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    const depth = screen.getByLabelText("Site depth (m)");
    await user.clear(depth);
    await user.type(depth, "24");
    await user.click(screen.getByText("Room program"));
    const buttons = screen.getAllByRole("button", { name: "+ Add room" });
    await user.click(buttons[0]!);
    await user.click(screen.getByRole("button", { name: "Rooms" }));
    expect(screen.getByRole("img", { name: "Concept room layout with corridor and doors" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-room^="unit-a-"]')).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Download SVG" })).toHaveAttribute("download", "concept-preview-option-1-rooms.svg");
    expect(screen.getByRole("link", { name: "Download DXF" })).toHaveAttribute("download", "concept-preview-option-1-rooms.dxf");
  });

  it("keeps direct numeric edits local: no model call, no credits, plan updates", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    const width = screen.getByLabelText("Site width (m)");
    await user.clear(width);
    await user.type(width, "14");

    expect(width).toHaveValue(14);
    await waitFor(() => {
      expect(screen.getAllByText(/keeps the full 14\.00 m frontage/).length).toBeGreaterThan(0);
    });
    // Only the availability probe ever hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(postCalls()).toHaveLength(0);
  });

  it("shows structured errors beside the direct controls for an infeasible width", async () => {
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    const width = screen.getByLabelText("Site width (m)");
    await user.clear(width);
    await user.type(width, "2");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveAttribute("id", "site-errors");
    expect(alert.textContent).toMatch(/cannot hold/);
    expect(width).toHaveAttribute("aria-describedby", "site-errors");
    // No fabricated plan while the brief is invalid, and sending is blocked.
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText(/Fix the site values or room program/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

describe("ArchitectWorkspace chat", () => {
  it("renders and saves a model-proposed free plan, sends it as edit context and restores it", async () => {
    postResponses = [
      { status: 200, body: { ok: true, outcome: { type: "concept", proposal: originalConcept, reply: "A new plan is ready." }, creditsRemaining: 9, cost: 1 } },
      { status: 200, body: { ok: true, outcome: { type: "concept", proposal: originalConcept, reply: "I kept the layout." }, creditsRemaining: 8, cost: 1 } },
    ];
    const user = userEvent.setup();
    const first = render(<ArchitectWorkspace locale="en" />);
    await sendMessage(user, "Design a new living and bedroom plan");
    expect(await screen.findByText("Plan from your conversation")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("img", { name: "Original concept floor plan" })).toBeInTheDocument());
    expect(document.querySelector('#cp-window-1[data-kind="window"]')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DXF" })).toHaveAttribute("download", "qattan-concept.dxf");
    expect(screen.getAllByText("Bedroom").length).toBeGreaterThan(0);
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").activeMode).toBe("concept"));

    await sendMessage(user, "Keep the layout but review it");
    await screen.findByText("I kept the layout.");
    const secondBody = JSON.parse(String(postCalls()[1]?.body)) as { conceptProposal?: unknown; wallMeshPreset?: unknown };
    expect(secondBody.conceptProposal).toEqual(originalConcept);
    expect(secondBody.wallMeshPreset).toEqual({ roofRise: 3.2, doorHeadHeight: 2.1, windowSillHeight: 0.9, windowHeadHeight: 2.1, slabThickness: 0.2 });

    first.unmount();
    render(<ArchitectWorkspace locale="en" />);
    expect(await screen.findByText("Plan from your conversation")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Starter layout" }));
    expect(screen.getByRole("article", { name: "Option 1" })).toBeInTheDocument();
  }, 15_000);

  it("shows authored floors, switches vector exports and restores the building draft", async () => {
    const building = sampleBuildingProposal();
    postResponses = [{ status: 200, body: { ok: true, outcome: { type: "concept", proposal: building, reply: "Two floors proposed." }, creditsRemaining: 9, cost: 1 } }];
    const user = userEvent.setup();
    const first = render(<ArchitectWorkspace locale="en" />);
    await sendMessage(user, "Design a two-floor building");
    expect(await screen.findByText("Multi-floor concept")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ground floor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "DXF" })).toHaveAttribute("download", "qattan-ground-concept.dxf");
    await user.click(screen.getByRole("tab", { name: /First floor/ }));
    expect(screen.getByRole("heading", { name: "First floor" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SVG" })).toHaveAttribute("download", "qattan-first-concept.svg");
    await user.click(screen.getByRole("button", { name: "3D building model" }));
    expect(screen.getByRole("button", { name: "Solid model" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(screen.getByRole("img", { name: "Illustrative 3D building floor stack" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Download building OBJ" })).toHaveAttribute("download", "qattan-building-concept.obj");
    const roofRise = screen.getByLabelText("Last storey height (m)");
    await user.clear(roofRise);
    await user.type(roofRise, "1");
    expect(screen.getByRole("alert")).toHaveTextContent("An opening head exceeds an available storey height.");
    expect(screen.queryByRole("link", { name: "Download building OBJ" })).not.toBeInTheDocument();
    await user.clear(roofRise);
    await user.type(roofRise, "3.5");
    expect(screen.getByRole("link", { name: "Download building OBJ" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "SVG layers" }));
    expect(document.querySelector('[data-stack-floor="first"]')).toHaveAttribute("data-selected", "true");
    const before = document.querySelector('[data-floor-plate="first"]')?.getAttribute("points");
    await user.click(screen.getByRole("button", { name: "Rotate right" }));
    await waitFor(() => expect(document.querySelector('[data-floor-plate="first"]')?.getAttribute("points")).not.toBe(before));
    await user.click(screen.getByRole("button", { name: "Floor plan" }));
    expect(screen.getByRole("link", { name: "DXF" })).toHaveAttribute("download", "qattan-first-concept.dxf");
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").conceptProposal).toEqual(building));
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}").wallMeshPreset.roofRise).toBe(3.5));
    first.unmount();
    render(<ArchitectWorkspace locale="en" />);
    expect(await screen.findByText("Multi-floor concept")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /First floor/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "3D building model" }));
    expect(screen.getByLabelText("Last storey height (m)")).toHaveValue(3.5);
  });

  it("starts a coordination grid on a building that has no structure", async () => {
    postResponses = [{ status: 200, body: { ok: true, outcome: {
      type: "concept", proposal: sampleBuildingProposal(), reply: "Two floors proposed.",
    }, creditsRemaining: 9, cost: 1 } }];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    await sendMessage(user, "Design a two-floor building");
    await screen.findByText("Multi-floor concept");
    await user.click(screen.getByRole("button", { name: "3D building model" }));
    await user.click(screen.getByRole("button", { name: "Edit columns and beams" }));
    await user.click(screen.getByRole("button", { name: "Add column" }));
    await user.click(screen.getByRole("button", { name: "Add column" }));
    const columns = within(screen.getByRole("region", { name: "Columns" }));
    for (const [index, x] of ["4", "10"].entries()) {
      await user.clear(columns.getAllByLabelText("X (m)")[index]!);
      await user.type(columns.getAllByLabelText("X (m)")[index]!, x);
      await user.clear(columns.getAllByLabelText("Y (m)")[index]!);
      await user.type(columns.getAllByLabelText("Y (m)")[index]!, "2");
    }
    await user.click(screen.getByRole("button", { name: "Add beam" }));
    await user.click(screen.getByRole("button", { name: "Validate and apply grid" }));
    expect(screen.queryByRole("button", { name: "Validate and apply grid" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download structural coordination JSON" })).toBeInTheDocument();
    expect(screen.getByText(/2 columns · 1 beams/)).toBeInTheDocument();
    expect(postCalls()).toHaveLength(1);
  });

  it("keeps a past concept while editing site dimensions without showing it as the current plan", async () => {
    postResponses = [{ status: 200, body: { ok: true, outcome: { type: "concept", proposal: originalConcept, reply: "A new plan is ready." }, creditsRemaining: 9, cost: 1 } }];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    await sendMessage(user, "Design a concept");
    await screen.findByText("Plan from your conversation");
    await user.click(screen.getByRole("button", { name: "Starter layout" }));
    const width = screen.getByLabelText("Site width (m)");
    await user.clear(width);
    await user.type(width, "14");
    expect(screen.getByRole("button", { name: "Original concept" })).toBeDisabled();
    expect(screen.getByText(/Site dimensions changed/)).toBeInTheDocument();
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem("qattan:architect:draft:v1") ?? "{}");
      expect(saved.brief?.siteWidth).toBe(14);
      expect(saved.conceptProposal).toEqual(originalConcept);
    });
    await user.clear(width);
    await user.type(width, "12");
    expect(screen.getByRole("button", { name: "Original concept" })).toBeEnabled();
  });

  it("applies a model room edit and Undo restores the previous room program", async () => {
    postResponses = [{
      status: 200,
      body: {
        ok: true,
        outcome: {
          type: "room_actions",
          actions: [{ op: "set", unit: "unit-a", roomId: "living-1", preferredArea: 40 }],
          reply: "Proposed a larger living room.",
        },
        creditsRemaining: 9,
        cost: 1,
      },
    }];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);
    await sendMessage(user, "make unit A living room bigger");
    await screen.findByText("Proposed a larger living room.");
    await user.click(screen.getByText("Room program"));
    expect(screen.getByLabelText("Preferred area living-1 unit-a")).toHaveValue(40);
    await user.click(screen.getByRole("button", { name: "Undo last edit" }));
    expect(screen.getByLabelText("Preferred area living-1 unit-a")).toHaveValue(24);
  });

  it("applies a multi-field edit from the model and exposes Undo", async () => {
    postResponses = [
      {
        status: 200,
        body: patchOutcome(
          { version: 1, siteWidth: 15, coreSide: "west" },
          "Widened to 15 m and moved the core west.",
        ),
      },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "Make it 15 m wide with the core on the west");

    const reply = await screen.findByText("Widened to 15 m and moved the core west.");
    expect(reply).toBeInTheDocument();
    expect(screen.getByText("You")).toBeInTheDocument();

    // Brief applied through applyBriefPatch: inputs and plan agree.
    await waitFor(() => {
      expect(screen.getByLabelText("Site width (m)")).toHaveValue(15);
    });
    expect(screen.getByRole("radio", { name: "West" })).toBeChecked();
    expect(within(screen.getByRole("article", { name: "Option 1" })).getByText("Core side: West")).toBeInTheDocument();

    // The request carried the message, the pre-edit brief, and bounded history.
    const body = JSON.parse(String(postCalls()[0]?.body)) as {
      message: string;
      brief: { siteWidth: number; coreSide: string };
      history: { role: string; content: string }[];
    };
    expect(body.message).toContain("15 m wide");
    expect(body.brief).toEqual({
      siteWidth: 12,
      siteDepth: 20,
      unitBSharePercent: 50,
      coreSide: "east",
    });
    expect(body.history).toHaveLength(0);

    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeEnabled();
  });

  it("shows the pending state while the model is thinking", async () => {
    let release!: (value: { status: number; body: unknown }) => void;
    postResponses = [
      new Promise((resolve) => {
        release = resolve;
      }),
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "nudge the depth");

    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(screen.getByLabelText("Site width (m)")).toBeDisabled();
    expect(screen.getByLabelText("Site depth (m)")).toBeDisabled();
    expect(screen.getByLabelText("Unit B area share (%)")).toBeDisabled();
    expect(screen.getByRole("radio", { name: "West" })).toBeDisabled();

    release({ status: 200, body: patchOutcome({ version: 1, siteDepth: 22 }, "Depth now 22 m.") });
    expect(await screen.findByText("Depth now 22 m.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Site depth (m)")).toHaveValue(22));
  });

  it("locks Undo while a later model reply is pending", async () => {
    let release!: (value: { status: number; body: unknown }) => void;
    postResponses = [
      { status: 200, body: patchOutcome({ version: 1, siteWidth: 15 }, "Width now 15 m.") },
      new Promise((resolve) => { release = resolve; }),
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "make it 15 m wide");
    await screen.findByText("Width now 15 m.");
    const undo = screen.getByRole("button", { name: "Undo last edit" });
    expect(undo).toBeEnabled();

    await sendMessage(user, "make it 22 m deep");
    expect(await screen.findByText("Thinking…")).toBeInTheDocument();
    expect(undo).toBeDisabled();
    await user.click(undo);
    expect(screen.getByLabelText("Site width (m)")).toHaveValue(15);

    release({ status: 200, body: patchOutcome({ version: 1, siteDepth: 22 }, "Depth now 22 m.") });
    await screen.findByText("Depth now 22 m.");
    expect(screen.getByLabelText("Site width (m)")).toHaveValue(15);
    expect(screen.getByLabelText("Site depth (m)")).toHaveValue(22);
    expect(undo).toBeEnabled();
  });

  it("Undoes an applied edit back to the previous brief and plan", async () => {
    postResponses = [
      { status: 200, body: patchOutcome({ version: 1, siteWidth: 15 }, "Widened to 15 m.") },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "wider");
    await screen.findByText("Widened to 15 m.");
    await waitFor(() => expect(screen.getByLabelText("Site width (m)")).toHaveValue(15));

    await user.click(screen.getByRole("button", { name: "Undo last edit" }));

    await waitFor(() => expect(screen.getByLabelText("Site width (m)")).toHaveValue(12));
    expect(within(screen.getByRole("article", { name: "Option 1" })).getByText("Core side: East")).toBeInTheDocument();
    // The local notice is labelled as workspace output, not a model reply.
    expect(screen.getByText("Previous plan restored.")).toBeInTheDocument();
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
    // Undo never reaches the model.
    expect(postCalls()).toHaveLength(1);
  });

  it("shows a clarification without mutating the plan", async () => {
    postResponses = [
      { status: 200, body: messageOutcome("clarify", "How deep should the site be?") },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "make it bigger");
    expect(await screen.findByText("How deep should the site be?")).toBeInTheDocument();

    expect(screen.getByLabelText("Site width (m)")).toHaveValue(12);
    expect(screen.getByLabelText("Site depth (m)")).toHaveValue(20);
    expect(screen.getByRole("radio", { name: "East" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
  });

  it("explains an unsupported request honestly and leaves the plan unchanged", async () => {
    postResponses = [
      {
        status: 200,
        body: messageOutcome(
          "unsupported",
          "Detailed rooms and setbacks are outside this concept slice, so I did not change the plan.",
        ),
      },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "add three bedrooms and a 2 m setback");

    expect(
      await screen.findByText(/Detailed rooms and setbacks are outside this concept slice/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Site width (m)")).toHaveValue(12);
    expect(within(screen.getByRole("article", { name: "Option 1" })).getByText("Core side: East")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
  });

  it("surfaces a failed upstream call as an error and never mutates the plan", async () => {
    postResponses = [
      {
        status: 502,
        body: {
          error: "The architect assistant is temporarily unavailable. Please try again in a moment.",
          creditsRemaining: 10,
        },
      },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="en" />);

    await sendMessage(user, "wider please");

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/temporarily unavailable/);
    expect(screen.getByLabelText("Site width (m)")).toHaveValue(12);
    expect(screen.getByRole("button", { name: "Undo last edit" })).toBeDisabled();
  });

  it("shows a clear unavailable state when the text model is not configured", async () => {
    probeResponse = { available: false, cost: 1 };
    render(<ArchitectWorkspace locale="en" />);

    expect(
      await screen.findByText(/The text model is not configured on this server/),
    ).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Plan assistant" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    // No message can be sent at all.
    expect(postCalls()).toHaveLength(0);
  });
});

describe("ArchitectWorkspace Arabic locale", () => {
  it("renders RTL Arabic UI with an Arabic tradeoff instead of English prose", async () => {
    render(<ArchitectWorkspace locale="ar" />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("dir", "rtl");
    expect(main).toHaveAttribute("lang", "ar");
    expect(screen.getByRole("heading", { level: 1, name: "مساحة العمل المعمارية" })).toBeInTheDocument();
    expect(screen.getByText(/توزيع الغرف والمساحات تقديري/)).toBeInTheDocument();
    expect(screen.getByText("المحادثة")).toBeInTheDocument();
    expect(screen.getByText("المخطط")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرسال" })).toBeInTheDocument();

    // Tradeoff paragraph is Arabic — no English "Tradeoff:" on this page.
    const option1 = screen.getByRole("article", { name: "الخيار 1" });
    expect(screen.getByText("المقايضة")).toBeInTheDocument();
    expect(screen.getByText(/اختيار جانب النواة يغيّر موضع المدخل/)).toBeInTheDocument();
    expect(screen.queryByText(/Tradeoff:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Core on the/)).not.toBeInTheDocument();
    expect(within(option1).getByText("جانب النواة: شرق")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('g#dimensions')?.textContent).toContain("الوحدة أ"));
    expect(document.querySelector('g#dimensions')?.textContent).not.toContain("UNIT A");

    // Cost notice is Arabic too.
    expect(screen.getByText(/كل رسالة تكلف كريديت واحدًا/)).toBeInTheDocument();
  });

  it("applies an Arabic chat edit through the same contract", async () => {
    postResponses = [
      { status: 200, body: patchOutcome({ version: 1, coreSide: "west" }, "تم نقل النواة إلى الغرب.") },
    ];
    const user = userEvent.setup();
    render(<ArchitectWorkspace locale="ar" />);

    await sendMessage(user, "انقل النواة إلى الغرب");
    expect(await screen.findByText("تم نقل النواة إلى الغرب.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("radio", { name: "غرب" })).toBeChecked());
  });
});
