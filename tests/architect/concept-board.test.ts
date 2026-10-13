import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildConceptBoardPrompt,
  CONCEPT_BOARD_MODELS,
  generateConceptBoard,
  generateConceptDialogue,
  getSelectedPanelDataUrl,
  isConceptBoardAvailable,
  parseConceptDialogue,
  parseConceptDialogueInput,
  parseSelectedConcept,
} from "../../lib/architect/concept-board";

const base = {
  title: "Central shared spine",
  strategy: "central-spine",
  siteWidthM: 20,
  siteDepthM: 20,
  idea: "A clear central spine separates the shared entrance from the private residential wings.",
  circulation: "A short shared corridor connects the stair to both private apartment doors.",
  program: ["two apartments", "three bedrooms each", "shared stair"],
  zones: [{ name: "Apartment A", location: "northwest wing", areaShare: 0.48 }, { name: "Apartment B", location: "southeast wing", areaShare: 0.48 }, { name: "Shared stair", location: "center", areaShare: 0.04 }],
};
const concepts = [
  { ...base, id: "A", strategy: "central-spine" },
  { ...base, id: "B", title: "Courtyard loop", strategy: "courtyard", idea: "A small courtyard gives the shared circulation daylight and organizes rooms around a calm center.", circulation: "A compact loop around the courtyard reaches the private apartment entrances." },
  { ...base, id: "C", title: "Split wings", strategy: "split-wing", idea: "Two offset wings create separate quiet zones while keeping the shared core legible.", circulation: "A split passage branches from the stair into each apartment wing." },
];

afterEach(() => vi.unstubAllEnvs());

describe("architect concept board contract", () => {
  it("is available only behind the pilot flag, server key, and a configured Sonnet model", () => {
    const sonnetEnv = { NODE_ENV: "test" as const, QATTAN_BLENDER_LAB_ENABLED: "1", OPENROUTER_API_KEY: "test", OPENROUTER_ARCHITECT_TEXT_MODEL: "anthropic/claude-sonnet-5.5" };
    expect(isConceptBoardAvailable(sonnetEnv)).toBe(true);
    expect(isConceptBoardAvailable({ ...sonnetEnv, QATTAN_BLENDER_LAB_ENABLED: "0" })).toBe(false);
    expect(isConceptBoardAvailable({ ...sonnetEnv, OPENROUTER_ARCHITECT_TEXT_MODEL: "anthropic/claude-haiku-5.5" })).toBe(false);
    expect(isConceptBoardAvailable({ NODE_ENV: "test", QATTAN_BLENDER_LAB_ENABLED: "1", OPENROUTER_ARCHITECT_TEXT_MODEL: "anthropic/claude-sonnet-5.5" })).toBe(false);
  });

  it("accepts exactly three distinct strategies with the same required program", () => {
    const parsed = parseConceptDialogue({ type: "concepts", reply: "Three options with the same room program.", concepts });
    expect(parsed?.type).toBe("concepts");
    if (parsed?.type === "concepts") expect(parsed.concepts.map((item) => item.id)).toEqual(["A", "B", "C"]);
    expect(parseConceptDialogue({ type: "concepts", reply: "Three options with the same room program.", concepts: [concepts[0], { ...concepts[1], strategy: "central-spine" }, concepts[2]] })).toBeNull();
    expect(parseConceptDialogue({ type: "concepts", reply: "Three options with the same room program.", concepts: [concepts[0], { ...concepts[1], program: ["different program"] }, concepts[2]] })).toBeNull();
    expect(parseConceptDialogue({ type: "concepts", reply: "Three options with the same room program.", concepts: [concepts[0], concepts[1], { ...concepts[2], siteWidthM: 16 }] })).toBeNull();
  });

  it("supports a single explicit clarification and bounded dialogue history", () => {
    expect(parseConceptDialogue({ type: "clarify", reply: "أحتاج معرفة المدخل.", question: "من أي جهة يقع مدخل الأرض؟" })).toEqual({ type: "clarify", reply: "أحتاج معرفة المدخل.", question: "من أي جهة يقع مدخل الأرض؟" });
    expect(parseConceptDialogueInput({ brief: "A valid brief", history: [{ role: "assistant", content: "What is the site entrance?" }] })).not.toBeNull();
    expect(parseConceptDialogueInput({ brief: "A valid brief", history: Array.from({ length: 9 }, () => ({ role: "user", content: "hello" })) })).toBeNull();
  });

  it("keeps the prompt a single three-concept board and overlays labels outside the image", () => {
    const prompt = buildConceptBoardPrompt(concepts as never);
    expect(prompt).toContain("THREE equal vertical panels");
    expect(prompt).toContain("Do not write any letters, numbers, captions");
    expect(prompt).toContain("central-spine");
    expect(prompt).toContain("courtyard");
    expect(prompt).toContain("split-wing");
  });

  it("uses configured Sonnet once for dialogue and validates its structured reply", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ type: "concepts", reply: "Three distinct layouts.", concepts }) } }], usage: { cost: 0.004 } }), { status: 200 }));
    const result = await generateConceptDialogue({ brief: "two apartments", history: [] }, fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchFn.mock.calls[0][1]?.body)).model).toBe("anthropic/claude-sonnet-5.5");
    expect(String(fetchFn.mock.calls[0][1]?.headers && new Headers(fetchFn.mock.calls[0][1]?.headers).get("Authorization"))).toBe("Bearer test-secret");
    expect(result.dialogue.type).toBe("concepts");
    expect(result.costUsd).toBe(0.004);
  });

  it("makes one text-to-image request for exactly one 16:9 Nano Banana 2 Lite board", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
    const png = await sharp({ create: { width: 900, height: 500, channels: 3, background: "white" } }).png().toBuffer();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64"), media_type: "image/png" }], usage: { cost: 0.012 } }), { status: 200 }));
    const result = await generateConceptBoard(concepts as never, fetchFn);
    expect(fetchFn).toHaveBeenCalledOnce();
    expect(fetchFn.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images");
    const payload = JSON.parse(String(fetchFn.mock.calls[0][1]?.body));
    expect(payload).toMatchObject({ model: CONCEPT_BOARD_MODELS.image, n: 1, resolution: "1K", aspect_ratio: "16:9", provider: { allow_fallbacks: false } });
    expect(payload.prompt.toLowerCase()).toContain("same required program");
    expect(payload.input_references).toBeUndefined();
    expect(result.imageDataUrl.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(result.imageDataUrl.length).toBeLessThan(2_000_000);
    expect(result.costUsd).toBe(0.012);
  });

  it("does not retry an image request after provider failure and rejects multi-image output", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-secret");
    const failedFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response("provider failed", { status: 503 }));
    await expect(generateConceptBoard(concepts as never, failedFetch)).rejects.toThrow("no automatic retry");
    expect(failedFetch).toHaveBeenCalledOnce();
    const multiFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: "a" }, { b64_json: "b" }] }), { status: 200 }));
    await expect(generateConceptBoard(concepts as never, multiFetch)).rejects.toThrow("exactly one");
    expect(multiFetch).toHaveBeenCalledOnce();
  });

  it("validates a selected concept and creates only that panel as a bounded CAD visual reference", async () => {
    const selected = parseSelectedConcept(concepts[1]);
    expect(selected?.id).toBe("B");
    expect(parseSelectedConcept({ ...concepts[1], zones: [] })).toBeNull();
    const board = await sharp({ create: { width: 900, height: 300, channels: 3, background: "white" } }).png().toBuffer();
    const url = `data:image/png;base64,${board.toString("base64")}`;
    const panel = await getSelectedPanelDataUrl(url, "B");
    expect(panel?.startsWith("data:image/jpeg;base64,")).toBe(true);
    const meta = await sharp(Buffer.from(panel!.split(",")[1], "base64")).metadata();
    expect(meta.width).toBe(300);
    expect(meta.height).toBe(300);
    expect(await getSelectedPanelDataUrl("https://invalid.example/image.png", "B")).toBeNull();
  });
});
