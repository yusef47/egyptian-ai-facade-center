import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { CAD_AGENT, CadGeometryBoundsError, cadCompletionReady, compactCadInspection, compileCadCommands, critiqueCadPlan, parseCadArchitectureReview, parseCadAction, parseCadBoundsFailure, parseCadCommandAction, parseCadInput, proposeCadAction, proposeCadCommands, readCadInspection, sandboxName, type CadCommandRejection } from "../../lib/architect/cad-agent";
import { FREECAD_HARNESS } from "../../lib/architect/cad-agent-harness";

const valid = {
  projectId: "0123456789abcdef01234567",
  instruction: "Design two apartments on a 20 m by 20 m site",
  siteWidth: 20,
  siteDepth: 20,
  step: 0,
};

describe("CAD agent input and execution contracts", () => {
  it("enforces topology-phase command policy before accepting model edits", () => {
    const furniture = JSON.stringify({ commands: [{ op: "furniture", id: "bed-a", kind: "bed-double", at: [2000, 2000], width: 1600, depth: 2000 }], summary: "bed", selfReview: [], done: false });
    const wall = JSON.stringify({ commands: [{ op: "wall", id: "wall-a", from: [500, 500], to: [5000, 500], thickness: 200 }], summary: "wall", selfReview: [], done: false });
    const allowed = new Set(["wall", "opening", "room", "shaft", "stair", "delete", "move", "rotate"] as const);
    const rejection: CadCommandRejection = { category: "" };
    expect(parseCadCommandAction(furniture, 20, 20, null, rejection, 8, allowed, true)).toBeNull();
    expect(rejection.reasonCode).toBe("topology_phase_restriction");
    expect(parseCadCommandAction(wall, 20, 20, null, undefined, 8, allowed, true)?.commands[0].op).toBe("wall");
  });

  it("reports the exact opening host and offset constraint without exposing model text", () => {
    const rejection: CadCommandRejection = { category: "" };
    const invalid = JSON.stringify({ commands: [
      { op: "wall", id: "host-wall", from: [100, 100], to: [2100, 100], thickness: 200 },
      { op: "opening", id: "entry-door", wallId: "host-wall", offset: 1200, width: 900, kind: "DOOR" },
    ], summary: "x", done: false });
    expect(parseCadCommandAction(invalid, 3, 3, null, rejection)).toBeNull();
    expect(rejection).toMatchObject({ category: "invalid_command_contract", commandIndex: 1, op: "opening", reasonCode: "opening_invalid_offset", hostWallLengthMm: 2000, openingMaxOffsetMm: 1050 });

    const missingHost = JSON.stringify({ commands: [{ op: "opening", id: "entry-door", wallId: "missing-wall", offset: 500, width: 900, kind: "DOOR" }], summary: "x", done: false });
    expect(parseCadCommandAction(missingHost, 3, 3, null, rejection)).toBeNull();
    expect(rejection.reasonCode).toBe("opening_host_wall_missing");
    expect(rejection.hostWallLengthMm).toBeUndefined();
  });

  it("gives Sonnet the measured host span on retry and keeps a rejected batch atomic", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const selectedConcept = { id: "A" as const, title: "Selected courtyard", strategy: "courtyard" as const, idea: "Courtyard apartments", circulation: "Compact shared core", siteWidthM: 20, siteDepthM: 20, program: ["two apartments"], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] };
    const invalid = JSON.stringify({ commands: [
      { op: "wall", id: "host-wall", from: [100, 100], to: [2100, 100], thickness: 200 },
      { op: "room", id: "room-a", name: "Living", at: [1000, 1000] },
      { op: "opening", id: "entry-door", wallId: "host-wall", offset: 1200, width: 900, kind: "DOOR" },
    ], summary: "try", done: false });
    const repaired = JSON.stringify({ commands: [
      { op: "wall", id: "host-wall", from: [100, 100], to: [2100, 100], thickness: 200 },
      { op: "room", id: "room-a", name: "Living", at: [1000, 1000] },
      { op: "opening", id: "entry-door", wallId: "host-wall", offset: 500, width: 900, kind: "DOOR" },
    ], summary: "تم تصحيح الفتحة", done: false });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: invalid } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: repaired } }] }), { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await proposeCadCommands({ ...valid, selectedConcept }, null, null, fetchFn as unknown as typeof fetch);
      expect(result.commands.map((command) => command.op)).toEqual(["wall", "room", "opening"]);
      const retryBody = JSON.parse(fetchFn.mock.calls[1][1]?.body as string);
      expect(JSON.stringify(retryBody.messages)).toContain("host wall is 2000 mm long");
      expect(JSON.stringify(retryBody.messages)).toContain("offset must be 50..1050 mm");
      expect(warn).toHaveBeenCalledWith("[CAD_MODEL_OUTPUT_REJECTED]", expect.stringContaining('"reasonCode":"opening_invalid_offset"'));
      expect(fetchFn).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("compacts long inspections while retaining semantic issue targets and stable IDs", () => {
    const objects = Array.from({ length: 260 }, (_, i) => ({ id: `item-${i}`, label: `LABEL_${i}`, type: "Part::Feature", layer: "OTHER", semantic: i === 250 ? "furniture" : "line", boundsMm: [i, i, i + 100, i + 100], positionMm: [i, i], text: "x".repeat(300) }));
    const compact = compactCadInspection({ ok: true, objects, objectIds: objects.map((object) => object.id), counts: { OTHER: 260 }, warnings: [], qualityIssues: [{ code: "furniture_opening_clearance", severity: "blocking", ids: ["item-250"], message: "move furniture" }], segments: 260, siteMm: [20_000, 20_000] });
    expect(compact).toMatchObject({ objectCount: 260, listedObjectCount: 100, omittedObjectCount: 160 });
    expect(compact.objects[0].id).toBe("item-250");
    expect(compact.objects[0].text).toHaveLength(64);
    expect(JSON.stringify(compact)).not.toContain("LABEL_");
    expect(compact.objectIds).toContain("item-250");
  });

  it("retries a truncated selected-plan response with one concise 3-command batch and bounded tokens", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const selectedConcept = { id: "A" as const, title: "Selected courtyard", strategy: "courtyard" as const, idea: "Courtyard apartments", circulation: "Compact shared core", siteWidthM: 20, siteDepthM: 20, program: ["two apartments"], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] };
    const inspection = { ok: true, objects: Array.from({ length: 86 }, (_, i) => ({ id: `object-${i}`, label: `OBJECT_${i}`, type: "Part::Feature", layer: "OTHER", semantic: "furniture", boundsMm: [1000 + i, 1000, 2000 + i, 2000] })), counts: { OTHER: 86 }, warnings: [], segments: 86, siteMm: [20_000, 20_000] };
    const repaired = JSON.stringify({ commands: [{ op: "move", id: "object-85", delta: [200, 0] }], summary: "تعديل محدد", selfReview: ["راجعت مساحة الحركة"], requiredElements: [], unresolvedItems: ["تحتاج الغرف الأخرى مراجعة لاحقة"], done: false });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{\"commands\":[" } }], usage: { prompt_tokens: 12_000, completion_tokens: 6_000, completion_tokens_details: { reasoning_tokens: 6_000 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: repaired } }] }), { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const board = `data:image/jpeg;base64,${Buffer.from("board-image").toString("base64")}`;
      const result = await proposeCadCommands({ ...valid, selectedConcept, conceptBoardDataUrl: board }, inspection, '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', fetchFn as unknown as typeof fetch);
      expect(result.summary).toBe("تعديل محدد");
      const first = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      const retry = JSON.parse(fetchFn.mock.calls[1][1]?.body as string);
      const firstUser = first.messages.find((message: { role: string }) => message.role === "user");
      const firstPayload = JSON.parse(firstUser.content.find((part: { type: string }) => part.type === "text").text);
      expect(first.max_tokens).toBe(6_000);
      expect(first.reasoning).toEqual({ effort: "low" });
      expect(first.response_format).toEqual({ type: "json_object" });
      expect(firstPayload).toMatchObject({ commandLimit: 5, currentDrawing: { objectCount: 86, listedObjectCount: 72, omittedObjectCount: 14 } });
      expect(JSON.stringify(firstPayload.currentDrawing)).not.toContain('"label":"OBJECT_0"');
      expect(firstUser.content.some((part: { image_url?: { url?: string } }) => part.image_url?.url?.startsWith("data:image/jpeg;base64,"))).toBe(false);
      expect(firstUser.content.some((part: { image_url?: { url?: string } }) => part.image_url?.url?.startsWith("data:image/png;base64,"))).toBe(true);
      expect(retry.max_tokens).toBe(6_000);
      expect(retry.reasoning).toEqual({ effort: "low" });
      const retrySystem = retry.messages.find((message: { role: string }) => message.role === "system").content;
      const retryUser = retry.messages.find((message: { role: string }) => message.role === "user");
      const retryPayload = JSON.parse(retryUser.content.find((part: { type: string }) => part.type === "text").text);
      expect(retrySystem).toContain("at most 3 concise commands");
      expect(retryPayload.commandLimit).toBe(3);
      expect(warn).toHaveBeenCalledWith("[CAD_MODEL_OUTPUT_REJECTED]", expect.stringContaining('"visibleTokens":0'));
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const tooMany = { commands: Array.from({ length: 4 }, (_, i) => ({ op: "line", id: `line-${i}`, from: [i * 100, 0], to: [i * 100 + 50, 50] })), summary: "many" };
      expect(parseCadCommandAction(JSON.stringify(tooMany), 20, 20, null, undefined, 3)).toBeNull();
    } finally { warn.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("classifies an upstream model timeout without a second hidden retry", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const timeout = new Error("aborted"); timeout.name = "TimeoutError";
    const fetchFn = vi.fn().mockRejectedValue(timeout);
    try {
      await expect(proposeCadCommands({ ...valid, selectedConcept: { id: "A", title: "Court", strategy: "courtyard", idea: "Court", circulation: "Core", siteWidthM: 20, siteDepthM: 20, program: [], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] } }, null, null, fetchFn as unknown as typeof fetch)).rejects.toMatchObject({ name: "CadModelTimeoutError", attempt: 1 });
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally { vi.unstubAllEnvs(); }
  });

  it("runs Sonnet post-execution review with the actual preview and full inspected object set", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const dimensions = ["program", "room_logic", "circulation", "stair", "privacy", "daylight_ventilation", "clearance", "usability"];
    const objects = Array.from({ length: 86 }, (_, i) => ({ id: `object-${i}`, label: `OBJECT_${i}`, type: "Part::Feature", layer: "OTHER" }));
    const review = { verdict: "ready", summary: "المخطط واضح ويحتاج مراجعة بشرية", issues: [], rubric: dimensions.map((dimension) => ({ dimension, status: "reviewed", evidenceIds: ["object-0"], note: "Reviewed against preview and metadata" })) };
    const fetchFn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("anthropic/claude-sonnet-5.5");
      expect(body.max_tokens).toBe(7_000);
      expect(body.reasoning).toEqual({ effort: "medium" });
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(JSON.stringify(body.messages)).toContain("object-85");
      expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,");
      return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(review) } }] }), { status: 200 });
    });
    try {
      const result = await critiqueCadPlan({ ...valid, selectedConcept: { id: "A", title: "Courtyard", strategy: "courtyard", idea: "Court", circulation: "Loop", siteWidthM: 20, siteDepthM: 20, program: ["two homes"], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] } }, { ok: true, objects, counts: {}, warnings: [], segments: 80, siteMm: [20_000, 20_000] }, '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/></svg>', fetchFn as unknown as typeof fetch);
      expect(result).toMatchObject({ verdict: "ready", rubric: expect.arrayContaining([{ dimension: "program", status: "reviewed", evidenceIds: ["object-0"], note: "Reviewed against preview and metadata" }]) });
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally { vi.unstubAllEnvs(); }
  });

  it("preserves valid reviewer findings and marks missing rubric dimensions unresolved", () => {
    const inspection = { ok: true, objects: [{ id: "wall-a", label: "WALL_wall-a", type: "Part::Feature", layer: "WALL", semantic: "wall" }], counts: {}, warnings: [], segments: 1, siteMm: [20_000, 20_000] };
    const partial = JSON.stringify({
      verdict: "ready", summary: "The plan is reviewed.",
      issues: [{ dimension: "stair", severity: "blocking", ids: ["wall-a"], finding: "The stair is not accessible.", edit: "Move the stair near the shared entry." }],
      rubric: [{ dimension: "program", status: "reviewed", ids: ["wall-a"], note: "Wall geometry inspected." }],
    });
    const review = parseCadArchitectureReview(partial, inspection);
    expect(review?.verdict).toBe("revise");
    expect(review?.issues).toEqual([{ dimension: "stair", severity: "blocking", objectIds: ["wall-a"], finding: "The stair is not accessible.", proposedEdit: "Move the stair near the shared entry." }]);
    expect(review?.rubric.filter((item) => item.status === "unresolved")).toHaveLength(7);
    expect(review?.summary).toContain("Review is incomplete");
  });

  it("logs preview conversion failures by safe category before any critic API call", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchFn = vi.fn();
    try {
      const result = await critiqueCadPlan({ ...valid, selectedConcept: { id: "A", title: "Court", strategy: "courtyard", idea: "Court", circulation: "Core", siteWidthM: 20, siteDepthM: 20, program: [], zones: [{ name: "A", location: "east", areaShare: 0.5 }, { name: "B", location: "west", areaShare: 0.5 }] } }, { ok: true, objects: [], counts: {}, warnings: [], segments: 0, siteMm: [20_000, 20_000] }, "not a valid svg preview", fetchFn as unknown as typeof fetch);
      expect(result).toBeNull();
      expect(fetchFn).not.toHaveBeenCalled();
      expect(warning).toHaveBeenCalledWith("[CAD_REVIEW_FAILED]", expect.stringContaining('"category":"preview_conversion_failed"'));
    } finally { warning.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("accepts a bounded project and rejects a forged or oversized request", () => {
    expect(parseCadInput(valid)).toEqual(valid);
    expect(parseCadInput({ ...valid, projectId: "../../other" })).toBeNull();
    expect(parseCadInput({ ...valid, siteWidth: 0 })).toBeNull();
    expect(parseCadInput({ ...valid, step: CAD_AGENT.maxSteps })).toBeNull();
    expect(parseCadInput({ ...valid, instruction: "a".repeat(CAD_AGENT.maxBrief + 1) })).toBeNull();
  });

  it("accepts the chosen structured concept and bounded board reference, rejecting malformed visual context", () => {
    const selectedConcept = { id: "B", title: "Courtyard loop", strategy: "courtyard", siteWidthM: 20, siteDepthM: 20, idea: "A small courtyard gives the shared circulation daylight and organizes rooms around a calm center.", circulation: "A compact loop around the courtyard reaches each private apartment entrance.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "east side", areaShare: 0.48 }, { name: "Home B", location: "west side", areaShare: 0.48 }] };
    const board = `data:image/jpeg;base64,${Buffer.from("encoded-preview").toString("base64")}`;
    expect(parseCadInput({ ...valid, selectedConcept, conceptBoardDataUrl: board })).toMatchObject({ selectedConcept: { id: "B", strategy: "courtyard" }, conceptBoardDataUrl: board });
    expect(parseCadInput({ ...valid, selectedConcept, conceptBoardDataUrl: "https://example.com/image.jpg" })).toBeNull();
    expect(parseCadInput({ ...valid, conceptBoardDataUrl: board })).toBeNull();
    expect(parseCadInput({ ...valid, selectedConcept: { ...selectedConcept, zones: [] } })).toBeNull();
    expect(parseCadInput({ ...valid, siteWidth: 18, selectedConcept })).toBeNull();
  });

  it("uses the authenticated owner as part of the persistent sandbox name", () => {
    expect(sandboxName("admin-one")).not.toBe(sandboxName("admin-two"));
    expect(sandboxName("admin-one")).toMatch(/^qattan-cad-[0-9a-f]{22}$/);
  });

  it("requires an actual FreeCAD action before accepting a model response", () => {
    expect(parseCadAction(JSON.stringify({ python: "doc.recompute()", summary: "تم", done: false }))).toEqual({ python: "doc.recompute()", summary: "تم", done: false });
    expect(parseCadAction(JSON.stringify({ python: "", summary: "تم", done: true }))).toBeNull();
    expect(parseCadAction(JSON.stringify({ python: "x".repeat(CAD_AGENT.maxCode + 1), summary: "تم", done: true }))).toBeNull();
  });

  it("accepts bounded structured CAD commands and rejects code, duplicate IDs, and out-of-site geometry", () => {
    const validAction = JSON.stringify({ commands: [{ op: "wall", id: "outer-north", from: [100, 100], to: [19900, 100], thickness: 200 }, { op: "beam", id: "beam-a", from: [1000, 4000], to: [8000, 4000], width: 250 }, { op: "opening", id: "entry-door", wallId: "outer-north", offset: 1000, kind: "DOOR", width: 900 }, { op: "dimension", id: "lot-width", from: [100, 500], to: [19900, 500], offset: 400 }, { op: "stair", id: "stair-1", kind: "flight", at: [10000, 1000], width: 1000, depth: 3000, treads: 12 }, { op: "furniture", id: "bed-1", kind: "bed", at: [3000, 3000], width: 1800, depth: 2000 }, { op: "room", id: "living-label", name: "Living", at: [5000, 5000] }], summary: "تم رسم الحائط والغرفة", selfReview: ["wall clear"], requiredElements: [], unresolvedItems: [], done: false });
    const parsed = parseCadCommandAction(validAction, 20, 20);
    expect(parsed?.commands).toHaveLength(7);
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "wall", id: "a", from: [0, 0], to: [21_000, 0], thickness: 200 }], summary: "x", selfReview: [], done: false }), 20, 20)).toBeNull();
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "opening", id: "unhosted", wallId: "missing", offset: 0, kind: "DOOR", width: 900 }], summary: "x", done: false }), 20, 20)).toBeNull();
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "line", id: "same", from: [0, 0], to: [1000, 0] }, { op: "delete", id: "same" }], summary: "x", done: false }), 20, 20)).toBeNull();
    expect(parseCadCommandAction('{"python":"import os; os.remove(\"/\")","summary":"x","done":true}', 20, 20)).toBeNull();
    const compiled = compileCadCommands(parsed!);
    expect(compiled).toContain("CadAgentId");
    expect(compiled).toContain("Part.makePolygon");
    expect(compiled).toContain("BEAM_beam-a");
    expect(compiled).toContain("_nx=-_dy/_length*125");
    expect(compiled).toContain("_wall_shape(_host)");
    expect(compiled).toContain("CadOpenings=json.dumps(_preserved)");
    expect(compiled).toContain("for _existing_wall in list(doc.Objects):");
    expect(compiled).toContain("ux=dx/length; uy=dy/length; nx=-uy; ny=ux; half=float(obj.CadWallThickness)/2");
    expect(compiled).toContain("x0=a.x+ux*lo; y0=a.y+uy*lo; x1=a.x+ux*hi; y1=a.y+uy*hi");
    expect(compiled).not.toContain("p=a.add(u.multiply(lo))");
    expect(compiled).toContain("%0.0f mm");
    expect(compiled).toContain("Part.makeCompound(_edges)");
    expect(compiled).toContain("_i in range(1,13)");
    expect(compiled).toContain("_h*.82");
    expect(compiled).not.toContain("Part.makeCompound([])");
    expect(compiled).not.toContain("import os");
  });

  it("accepts a bounded semantic ventilation shaft and compiles a real plan symbol", () => {
    const parsed = parseCadCommandAction(JSON.stringify({ commands: [
      { op: "shaft", id: "bath-vent", kind: "ventilation", at: [5000, 5000], width: 900, depth: 900 },
    ], summary: "ventilation shaft", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 20, 20);
    expect(parsed?.commands).toHaveLength(1);
    const code = compileCadCommands(parsed!);
    expect(code).toContain("SHAFT_bath-vent");
    expect(code).toContain("VENT SHAFT");
    expect(code).toContain('obj.CadKind="ventilation"');
    // Simulate an update to an already saved shaft with the same stable ID:
    // remove the old object before creating it, and add CadKind only once.
    const findExisting = code.indexOf('_obj=_find("bath-vent")');
    const removeExisting = code.indexOf("doc.removeObject(_obj.Name)", findExisting);
    const createReplacement = code.indexOf('obj=doc.addObject(\'Part::Feature\',"CAD_bath_vent")');
    expect(findExisting).toBeGreaterThan(-1);
    expect(removeExisting).toBeGreaterThan(findExisting);
    expect(createReplacement).toBeGreaterThan(removeExisting);
    expect(code.match(/obj\.addProperty\('App::PropertyString','CadKind'\)/g)).toHaveLength(1);
    expect(code.match(/obj\.CadKind="ventilation"/g)).toHaveLength(1);
    expect(parseCadCommandAction(JSON.stringify({ commands: [
      { op: "shaft", id: "oversize-shaft", kind: "ventilation", at: [5000, 5000], width: 300, depth: 900 },
    ], summary: "bad shaft", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 20, 20)).toBeNull();
  });

  it("replaces same-ID room, stair, furniture, and opening objects before adding semantic properties", () => {
    const cases = [
      { id: "room-main", commands: [{ op: "room", id: "room-main", name: "Living", at: [1000, 1000] }] },
      { id: "stair-main", commands: [{ op: "stair", id: "stair-main", kind: "flight", at: [1000, 1000], width: 1000, depth: 3000, treads: 12 }] },
      { id: "bed-main", commands: [{ op: "furniture", id: "bed-main", kind: "bed-double", at: [1000, 1000], width: 1800, depth: 2000 }] },
      { id: "entry-door", commands: [
        { op: "wall", id: "host-wall", from: [100, 100], to: [5000, 100], thickness: 200 },
        { op: "opening", id: "entry-door", wallId: "host-wall", offset: 1000, width: 900, kind: "DOOR" },
      ] },
    ];
    for (const item of cases) {
      const action = parseCadCommandAction(JSON.stringify({ commands: item.commands, summary: "update", done: false }), 20, 20);
      expect(action).not.toBeNull();
      const code = compileCadCommands(action!);
      const safeName = item.id.replace(/[^a-zA-Z0-9_]/g, "_");
      const createAt = code.indexOf(`obj=doc.addObject('Part::Feature',"CAD_${safeName}")`);
      expect(createAt).toBeGreaterThan(-1);
      expect(code.slice(0, createAt)).toMatch(/doc\.removeObject\(_(?:obj|old)\.Name\)/);
      expect(code.match(/obj\.addProperty\('App::PropertyString','CadKind'\)/g)?.length ?? 0).toBeLessThanOrEqual(1);
    }
  });

  it("creates bounded hatches only from closed boundaries and produces recognizable furniture and car geometry", () => {
    const hatchInput = JSON.stringify({ commands: [
      { op: "polyline", id: "zone", points: [[1000, 1000], [7000, 1000], [7000, 5000], [1000, 5000]], closed: true, layer: "OTHER" },
      { op: "hatch", id: "zone-hatch", targetId: "zone", pattern: "tile", spacing: 400, angle: 0 },
      { op: "furniture", id: "sedan", kind: "car-sedan", at: [8000, 1000], width: 1800, depth: 4300, angle: 0 },
      { op: "furniture", id: "bed-main", kind: "bed-double", at: [10000, 1000], width: 1800, depth: 2000, angle: 0 },
      { op: "furniture", id: "wc-main", kind: "toilet", at: [12000, 1000], width: 700, depth: 700, angle: 0 },
    ], summary: "symbols", selfReview: [], requiredElements: [], unresolvedItems: [], done: false });
    const parsed = parseCadCommandAction(hatchInput, 20, 20);
    expect(parsed?.commands).toHaveLength(5);
    const compiled = compileCadCommands(parsed!);
    expect(compiled).toContain("CadHatchHost");
    expect(compiled).toContain("CadPattern");
    expect(compiled).toContain("HATCH_zone-hatch");
    expect(compiled).toContain("Hatch stroke limit exceeded");
    expect(compiled).toContain("getattr(_old_hatch,'CadHatchHost','') == \"zone\" and getattr(_old_hatch,'CadPattern','') == \"tile\"");
    expect(compiled).toContain("phase=pmin+spacing/2.0");
    expect(compiled).toContain("if phase>=pmax: phase=(pmin+pmax)/2.0");
    expect(compiled).toContain("_x+_w*.18"); // recognizable vehicle silhouette
    expect(compiled).toContain("_x+_w*.22"); // cabin outline
    expect(compiled).toContain("bed-double");
    expect(compiled).toContain("Part.makeCompound(_edges)");
    const moved = parseCadCommandAction(JSON.stringify({ commands: [
      { op: "move", id: "moving-zone", delta: [100, 200] },
    ], summary: "edit", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 20, 20, {
      ok: true, objects: [{ id: "moving-zone", label: "OTHER_zone", type: "Part::Feature", layer: "OTHER", closed: true, polylinePointsMm: [[1000, 1000], [4000, 1000], [4000, 4000], [1000, 4000]] }], counts: {}, warnings: [], segments: 4, siteMm: [20000, 20000],
    });
    expect(moved).not.toBeNull();
    expect(compileCadCommands(moved!)).toContain("CadPolylinePoints=json.dumps([[p[0]+_delta.x,p[1]+_delta.y]");
    const openingOnHatchedWall = parseCadCommandAction(JSON.stringify({ commands: [
      { op: "wall", id: "hatched-wall", from: [1000, 1000], to: [9000, 1000], thickness: 200 },
      { op: "hatch", id: "wall-hatch", targetId: "hatched-wall", pattern: "diagonal", spacing: 500, angle: 45 },
      { op: "opening", id: "wall-door", wallId: "hatched-wall", offset: 1500, width: 900, kind: "DOOR" },
    ], summary: "opening edit", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 20, 20);
    const openingEditCode = compileCadCommands(openingOnHatchedWall!);
    expect(openingEditCode).toContain("if getattr(_child,'CadHatchHost','') == getattr(_host,'CadAgentId',''):");
    expect(openingEditCode).toContain("doc.removeObject(_child.Name)");
    expect(parseCadCommandAction(JSON.stringify({ commands: [
      { op: "polyline", id: "open-zone", points: [[1000, 1000], [7000, 1000], [7000, 5000]], closed: false },
      { op: "hatch", id: "bad-hatch", targetId: "open-zone", pattern: "diagonal", spacing: 400, angle: 45 },
    ], summary: "invalid", done: false }), 20, 20)).toBeNull();
    expect(parseCadCommandAction(JSON.stringify({ commands: [
      { op: "polyline", id: "flat-zone", points: [[1000, 1000], [3000, 1000], [5000, 1000]], closed: true, layer: "OTHER" },
    ], summary: "invalid degenerate outline", done: false }), 20, 20)).toBeNull();
    expect(parseCadCommandAction(JSON.stringify({ commands: [
      { op: "furniture", id: "oversized-car", kind: "car-sedan", at: [1000, 1000], width: 8000, depth: 12000 },
    ], summary: "invalid", done: false }), 20, 20)).toBeNull();
    expect(FREECAD_HARNESS).toContain("'HATCH':'#6ca6a3'");
    expect(FREECAD_HARNESS).toContain("pair(0,'LINE',8,kind");
  });

  it("classifies furniture contract failures with bounded reason codes", () => {
    const invalidFurniture = (command: Record<string, unknown>) => JSON.stringify({ commands: [{ op: "furniture", id: "furn-1", kind: "bed-double", at: [1000, 1000], width: 1800, depth: 2000, ...command }], summary: "test", done: false });
    const rejection: CadCommandRejection = { category: "" };
    expect(parseCadCommandAction(invalidFurniture({ kind: "unknown-sofa" }), 20, 20, null, rejection)).toBeNull();
    expect(rejection.reasonCode).toBe("unsupported_furniture_kind");
    expect(parseCadCommandAction(invalidFurniture({ at: [19_500, 1000] }), 20, 20, null, rejection)).toBeNull();
    expect(rejection.reasonCode).toBe("furniture_outside_site");
    expect(parseCadCommandAction(invalidFurniture({ width: 30_000 }), 20, 20, null, rejection)).toBeNull();
    expect(rejection.reasonCode).toBe("invalid_furniture_dimensions");
    expect(parseCadCommandAction(invalidFurniture({ kind: "car-sedan", width: 800, depth: 1200 }), 20, 20, null, rejection)).toBeNull();
    expect(rejection.reasonCode).toBe("invalid_vehicle_scale");
  });

  it("uses the furniture rejection code in its single bounded repair prompt", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const invalid = JSON.stringify({ commands: [{ op: "furniture", id: "bed-1", kind: "bed-double", at: [19_500, 1000], width: 1800, depth: 2000 }], summary: "bed", done: false });
    const repaired = JSON.stringify({ commands: [{ op: "furniture", id: "bed-1", kind: "bed-double", at: [17_000, 1000], width: 1800, depth: 2000 }], summary: "bed", done: false });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: invalid } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: repaired } }] }), { status: 200 }));
    try {
      await expect(proposeCadCommands({ ...valid, siteWidth: 20, siteDepth: 20 }, null, null, fetchFn as unknown as typeof fetch)).resolves.toMatchObject({ commands: [{ op: "furniture", at: [17_000, 1000] }] });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse(String(fetchFn.mock.calls[1][1]?.body));
      expect(retryBody.messages[1].content[0].text).toContain("reason furniture_outside_site");
    } finally { vi.unstubAllEnvs(); }
  });

  it("centers hatch strokes inside narrow wall bands instead of aligning them to an edge", () => {
    const narrowWall = parseCadCommandAction(JSON.stringify({ commands: [
      { op: "wall", id: "south-edge-wall", from: [100, 100], to: [9900, 100], thickness: 200 },
      { op: "hatch", id: "south-wall-hatch", targetId: "south-edge-wall", pattern: "diagonal", spacing: 500, angle: 0 },
    ], summary: "wall hatch", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 10, 10);
    expect(narrowWall).not.toBeNull();
    const python = compileCadCommands(narrowWall!);
    expect(python).toContain("projections=[p.x*nx+p.y*ny for p in points]; pmin=min(projections); pmax=max(projections); span=pmax-pmin");
    expect(python).toContain("phase=pmin+spacing/2.0");
    expect(python).toContain("if phase>=pmax: phase=(pmin+pmax)/2.0");
    expect(python).toContain("t=phase+k*spacing; hits=[]");
    expect(python).toContain("_target_kind='wall'");
    expect(python).toContain("HATCH_EMPTY:target=south-edge-wall;kind=");
    expect(python).toContain("_x0=_a.x+_ux*_lo; _y0=_a.y+_uy*_lo; _x1=_a.x+_ux*_hi; _y1=_a.y+_uy*_hi");
    expect(python).not.toContain("_a.add(_u.multiply(_lo))");
  });

  it("replaces hatch revisions by stable ID or same target and pattern while retaining different patterns", () => {
    const action = parseCadCommandAction(JSON.stringify({ commands: [
      { op: "polyline", id: "hatch-zone", points: [[1000, 1000], [7000, 1000], [7000, 5000], [1000, 5000]], closed: true, layer: "OTHER" },
      { op: "hatch", id: "zone-tile", targetId: "hatch-zone", pattern: "tile", spacing: 400, angle: 0 },
      { op: "hatch", id: "zone-cross", targetId: "hatch-zone", pattern: "cross", spacing: 600, angle: 45 },
    ], summary: "distinct fills", selfReview: [], requiredElements: [], unresolvedItems: [], done: false }), 20, 20);
    expect(action).not.toBeNull();
    const python = compileCadCommands(action!);
    expect(python).toContain("getattr(_old_hatch,'CadAgentId','') == \"zone-tile\"");
    expect(python).toContain("getattr(_old_hatch,'CadAgentId','') == \"zone-cross\"");
    expect(python).toContain("getattr(_old_hatch,'CadHatchHost','') == \"hatch-zone\" and getattr(_old_hatch,'CadPattern','') == \"tile\"");
    expect(python).toContain("getattr(_old_hatch,'CadHatchHost','') == \"hatch-zone\" and getattr(_old_hatch,'CadPattern','') == \"cross\"");
  });

  it("rejects moving or rotating attached opening symbols independently of their host wall", () => {
    const inspection = { ok: true, objects: [
      { id: "north-wall", label: "WALL_north-wall", type: "Part::Feature", layer: "WALL", wallStartMm: [100, 100], wallEndMm: [1900, 100], wallThicknessMm: 200, wallOpenings: ["front-door"] },
      { id: "front-door", label: "DOOR_front-door", type: "Part::Feature", layer: "DOOR", hostWallId: "north-wall", text: "DOOR" },
    ], counts: {}, warnings: [], segments: 4, siteMm: [3000, 3000] } as const;
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "move", id: "front-door", delta: [100, 0] }], summary: "move", selfReview: [], done: false }), 3, 3, inspection as never)).toBeNull();
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "rotate", id: "front-door", center: [100, 100], angle: 90 }], summary: "rotate", selfReview: [], done: false }), 3, 3, inspection as never)).toBeNull();
  });

  it("uses semantic host metadata for door and wall completion counts", () => {
    expect(FREECAD_HARNESS).toContain("counts['WALL']=sum(1 for o in summary if 'wallStartMm' in o and 'wallEndMm' in o)");
    expect(FREECAD_HARNESS).toContain("counts['DOOR']=sum(1 for o in summary if o.get('hostWallId') in wall_ids and o.get('text')=='DOOR')");
    expect(FREECAD_HARNESS).toContain("entry['text'] = str(obj.Text)[:90]");
  });

  it("requires brief-specific evidence IDs and no unresolved items before reporting completion", () => {
    const approved = { done: true, requiredElements: [{ requirement: "two apartments", status: "met" as const, evidenceIds: ["room-a", "room-b"], evidence: "two labeled spaces" }], unresolvedItems: [] };
    const drawing = { warnings: [], objects: [{ id: "room-a", semantic: "room", text: "Flat A" }, { id: "room-b", semantic: "room", text: "Flat B" }] };
    expect(cadCompletionReady(approved, drawing)).toBe(true);
    expect(cadCompletionReady({ ...approved, unresolvedItems: ["access path not checked"] }, drawing)).toBe(false);
    expect(cadCompletionReady(approved, { ...drawing, objects: [{ id: "room-a" }] })).toBe(false);
    expect(cadCompletionReady(approved, { ...drawing, objects: [{ id: "room-a", semantic: "room", text: "Flat A" }, { id: "room-b", semantic: "circle", text: "Flat B" }] })).toBe(false);
    expect(cadCompletionReady(approved, { ...drawing, warnings: ["door gap mismatch"] })).toBe(false);
    const unsupportedCompletion = parseCadCommandAction(JSON.stringify({ commands: [{ op: "line", id: "line-a", from: [100, 100], to: [500, 100] }], summary: "x", selfReview: [], requiredElements: [{ requirement: "room", status: "met", evidenceIds: [], evidence: "proof" }], unresolvedItems: [], done: true }), 3, 3);
    expect(unsupportedCompletion).toMatchObject({ done: false, requiredElements: [{ status: "unresolved", evidenceIds: [] }] });
    expect(unsupportedCompletion?.unresolvedItems).toContain("Evidence pending: room");
    const noWallMutation = { done: true, requiredElements: [{ requirement: "No existing walls were moved or deleted", status: "met" as const, evidenceIds: ["wall-a"], evidence: "Stable wall baseline comparison is empty" }], unresolvedItems: [] };
    const wallInspection = { warnings: [], objects: [{ id: "wall-a", semantic: "wall", wallStartMm: [0, 0], wallEndMm: [1000, 0] }], wallBaselineReady: true, wallBaselineIds: ["wall-a"], wallCurrentIds: ["wall-a"], wallChanges: [] };
    expect(cadCompletionReady(noWallMutation, wallInspection)).toBe(true);
    expect(cadCompletionReady(noWallMutation, { ...wallInspection, wallBaselineReady: false })).toBe(false);
    expect(cadCompletionReady(noWallMutation, { ...wallInspection, wallChanges: [{ id: "wall-a", kind: "modified" as const, beforeStartMm: [0, 0], beforeEndMm: [1000, 0], afterStartMm: [0, 100], afterEndMm: [1000, 100] }] })).toBe(false);
    expect(cadCompletionReady(noWallMutation, { ...wallInspection, wallChanges: [{ id: "wall-a", kind: "deleted" as const, beforeStartMm: [0, 0], beforeEndMm: [1000, 0] }] })).toBe(false);
    expect(cadCompletionReady(noWallMutation, { ...wallInspection, wallCurrentIds: [] })).toBe(false);
  });

  it("tracks the initial wall baseline and returns stable mutation evidence from FreeCAD", () => {
    expect(FREECAD_HARNESS).toContain("WALL_BASELINE = ROOT + '/wall-baseline.json'");
    expect(FREECAD_HARNESS).toContain("'wallBaselineReady':bool(comparison)");
    expect(FREECAD_HARNESS).toContain("'wallBaselineIds':baseline_ids");
    expect(FREECAD_HARNESS).toContain("'wallCurrentIds':current_ids");
    expect(FREECAD_HARNESS).toContain("'kind':'deleted'");
    expect(FREECAD_HARNESS).toContain("'kind':'modified'");
    expect(FREECAD_HARNESS).toContain("if baseline_created and os.path.exists(WALL_BASELINE): os.remove(WALL_BASELINE)");
  });

  it("runs deterministic opening, room, and schematic object checks and reports unverified enclosure", () => {
    expect(FREECAD_HARNESS).toContain("opening metadata does not match opening symbols");
    expect(FREECAD_HARNESS).toContain("wall geometry crossing its declared gap");
    expect(FREECAD_HARNESS).toContain("label position is outside the site");
    expect(FREECAD_HARNESS).toContain("has invalid plan bounds");
    expect(FREECAD_HARNESS).toContain("Room-to-exit connectivity is a simple planning heuristic");
  });

  it("returns bounded structured outside-site geometry details without trusting labels", () => {
    const encoded = JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }]);
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${encoded}`)).toEqual([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }]);
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "<script>secret</script>", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }])}`)).toBeNull();
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-572_045_069_455.7, -69079.3, 572_619_157_977.5, 1_144_662_415_835.8], siteMm: [20_000, 20_000] }])}`)).toEqual([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-1_000_000, -69079.3, 1_000_000, 1_000_000], siteMm: [20_000, 20_000], extremeBounds: true }]);
    const normalized = parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-572_045_069_455.7, -69079.3, 572_619_157_977.5, 1_144_662_415_835.8], siteMm: [20_000, 20_000] }])}`)!;
    const repairMessage = new CadGeometryBoundsError(normalized).message;
    expect(repairMessage).toContain("id=door-west");
    expect(repairMessage).toContain("numerically extreme");
    expect(repairMessage).not.toContain("572045069455");
    expect(FREECAD_HARNESS).toContain("CAD_BOUNDS_ERROR:");
    expect(FREECAD_HARNESS).toContain("'boundsMm'");
    expect(FREECAD_HARNESS).toContain("'extremeBounds':extreme_bounds");
    expect(FREECAD_HARNESS).toContain("math.isfinite(v)");
    expect(FREECAD_HARNESS).toContain("geometry_errors[:8]");
  });

  it("recovers inspection from the saved FCStd when result.json contains a failed-stage record", async () => {
    const root = `/vercel/sandbox/cad-projects/${valid.projectId}`;
    const recoveredInspection = { ok: true, objects: [{ id: "wall-north", label: "WALL_wall-north", type: "Part::Feature", layer: "WALL" }], objectIds: ["wall-north"], counts: { WALL: 1 }, warnings: [], segments: 4, siteMm: [20_000, 20_000] };
    let inspectRan = false;
    const sandbox = {
      readFileToBuffer: vi.fn(async ({ path }: { path: string }) => {
        if (path === `${root}/result.json`) return Buffer.from(inspectRan ? JSON.stringify(recoveredInspection) : JSON.stringify({ ok: false, error: "old stage error" }));
        if (path === `${root}/plan.svg`) return Buffer.from("<svg/>");
        if (path === `${root}/site.json`) return Buffer.from(JSON.stringify({ width: 20, depth: 20 }));
        return null;
      }),
      runCommand: vi.fn(async (command: string | { cmd: string; env?: Record<string, string> }) => {
        if (typeof command === "object" && command.cmd.includes("AppRun")) {
          expect(command.env?.QATTAN_CAD_INSPECT_ONLY).toBe("1");
          inspectRan = true;
        }
        return { exitCode: 0, stdout: async () => typeof command === "string" ? "existing" : "", stderr: async () => "" };
      }),
      writeFiles: vi.fn(async (files: { path: string; content: string }[]) => {
        if (files.some((file) => file.path.endsWith("/action.py"))) expect(files.find((file) => file.path.endsWith("/action.py"))?.content).toBe("pass");
      }),
      update: vi.fn(async () => {}),
    };
    const result = await readCadInspection(sandbox as never, valid.projectId);
    expect(result).toEqual({ inspection: recoveredInspection, preview: "<svg/>" });
    expect(inspectRan).toBe(true);
    expect(sandbox.runCommand).toHaveBeenCalledTimes(4);
  });

  it("keeps failed-stage diagnostics separate from the last successful inspection", () => {
    expect(FREECAD_HARNESS).toContain("FAILURE = ROOT + '/failure.json'");
    expect(FREECAD_HARNESS).toContain("json.dump({'ok':True,**details},open(RESULT");
    expect(FREECAD_HARNESS).toContain("json.dump({'ok':False,'error':str(err)[:900]},open(FAILURE");
    expect(FREECAD_HARNESS).not.toContain("open(RESULT,'w',encoding='utf-8'))\n    if doc:");
  });

  it("blocks another model stage when saved-document inspection recovery fails", async () => {
    const root = `/vercel/sandbox/cad-projects/${valid.projectId}`;
    const sandbox = {
      readFileToBuffer: vi.fn(async ({ path }: { path: string }) => {
        if (path === `${root}/result.json`) return Buffer.from(JSON.stringify({ ok: false, error: "failed prior stage" }));
        if (path === `${root}/plan.svg`) return Buffer.from("<svg/>");
        if (path === `${root}/site.json`) return Buffer.from(JSON.stringify({ width: 20, depth: 20 }));
        return null;
      }),
      runCommand: vi.fn(async (command: string | { cmd: string; env?: Record<string, string> }) => ({
        exitCode: typeof command === "object" && command.cmd.includes("AppRun") ? 1 : 0,
        stdout: async () => "existing", stderr: async () => "inspect failed",
      })),
      writeFiles: vi.fn(async () => {}),
      update: vi.fn(async () => {}),
    };
    await expect(readCadInspection(sandbox as never, valid.projectId)).rejects.toThrow("no new drawing step was run");
  });

  it("defaults perimeter door swings and dimensions toward the site interior", () => {
    const reversedSouthWall = JSON.stringify({ commands: [
      { op: "wall", id: "south-wall", from: [19_900, 100], to: [100, 100], thickness: 200 },
      { op: "opening", id: "south-door", wallId: "south-wall", offset: 1000, kind: "DOOR", width: 900 },
      { op: "dimension", id: "south-dim", from: [19_900, 100], to: [100, 100], offset: 400 },
    ], summary: "interior-safe defaults", selfReview: [], done: false });
    const parsed = parseCadCommandAction(reversedSouthWall, 20, 20);
    expect(parsed?.commands.find((command) => command.op === "opening")).toMatchObject({ swingSide: -1 });
    const compiled = compileCadCommands(parsed!);
    expect(compiled).toContain("_mx=(_x1+_x2)/2; _my=(_y1+_y2)/2; _toward_x=SITE_WIDTH_MM/2-_mx; _toward_y=SITE_DEPTH_MM/2-_my");
    expect(compiled).toContain("if _toward_x*_nx+_toward_y*_ny<0: _nx=-_nx; _ny=-_ny");
    expect(compiled).toContain("Position'); obj.Position=Vector((_ax+_bx)/2+_ox,(_ay+_by)/2+_oy,0)");
    expect(compiled).toContain("_nx=-_uy*-1; _ny=_ux*-1");
    expect(compiled).toContain("_arc_points=[Vector(_p0.x+_ux*900*math.cos(i*math.pi/32)");
    expect(compiled).not.toContain("Part.Arc(_closed,_mid,_open)");
  });

  it("rejects existing-object transforms that would move geometry outside the site", () => {
    const inspection = { ok: true, objects: [
      { id: "north-wall", label: "WALL_north-wall", type: "Part::Feature", layer: "WALL", boundsMm: [100, 100, 1000, 1000], wallStartMm: [100, 100], wallEndMm: [1000, 100] },
    ], counts: {}, warnings: [], segments: 4, siteMm: [3000, 3000] } as const;
    const rejection: { category: string } = { category: "" };
    const move = parseCadCommandAction(JSON.stringify({ commands: [{ op: "move", id: "north-wall", delta: [2200, 0] }], summary: "move", selfReview: [], done: false }), 3, 3, inspection as never, rejection);
    expect(move).toBeNull();
    expect(rejection.category).toBe("transform_outside_site");
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "rotate", id: "north-wall", center: [3000, 1500], angle: 180 }], summary: "rotate", selfReview: [], done: false }), 3, 3, inspection as never)).toBeNull();
  });

  it("reserves output tokens for the CAD action with the production text model", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe("anthropic/claude-haiku-5.5");
        expect(body.max_tokens).toBe(12000);
        expect(body.reasoning).toEqual({ enabled: false });
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: '{"python":"doc.recompute()","summary":"تم","done":false}' } }] }), { status: 200 });
      });
      await expect(proposeCadAction(valid, null, null, fetchFn as unknown as typeof fetch))
        .resolves.toEqual({ python: "doc.recompute()", summary: "تم", done: false });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses bounded medium reasoning for structured CAD planning and requires a self-review field", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe("anthropic/claude-haiku-5.5");
        expect(body.max_tokens).toBe(10_000);
        expect(body.reasoning).toEqual({ max_tokens: 3_000 });
        expect(body.messages[0].content).toContain("requiredElements");
        expect(body.messages[0].content).toContain('"op":"hatch"');
        expect(body.messages[0].content).toContain("car-sedan");
        expect(body.messages[0].content).toContain('"pattern":"diagonal"|"cross"|"tile"');
        expect(body.messages[0].content).toContain("rotated extents of furniture, cars, and stairs");
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ commands: [{ op: "wall", id: "north", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "تم", selfReview: ["حدود الأرض"], requiredElements: [], unresolvedItems: [], done: false }) } }] }), { status: 200 });
      });
      await expect(proposeCadCommands({ ...valid, siteWidth: 3, siteDepth: 3 }, null, null, fetchFn as unknown as typeof fetch))
        .resolves.toMatchObject({ summary: "تم", selfReview: ["حدود الأرض"], done: false });
    } finally { vi.unstubAllEnvs(); }
  });

  it("sends only the selected concept and its selected panel as structured CAD context", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const selectedConcept = { id: "B" as const, title: "Courtyard loop", strategy: "courtyard" as const, siteWidthM: 20, siteDepthM: 20, idea: "A small courtyard gives the shared circulation daylight and organizes rooms around a calm center.", circulation: "A compact loop around the courtyard reaches each private apartment entrance.", program: ["two homes", "shared stair"], zones: [{ name: "Home A", location: "east side", areaShare: 0.48 }, { name: "Home B", location: "west side", areaShare: 0.48 }] };
      const image = await sharp({ create: { width: 900, height: 300, channels: 3, background: "white" } }).png().toBuffer();
      const conceptBoardDataUrl = `data:image/png;base64,${image.toString("base64")}`;
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
        expect(body.model).toBe("anthropic/claude-sonnet-5.5");
        expect(body.messages[0].content).toContain("visual references, never metric inputs");
        expect(body.reasoning).toEqual({ effort: "low" });
        expect(body.response_format).toEqual({ type: "json_object" });
        expect(body.messages[1].content).toContain("do not treat an earlier request for three alternatives as a CAD requirement");
        const userContent = body.messages[2].content;
        const cadContext = JSON.parse(userContent[0].text);
        expect(cadContext.userBrief).toBe(originalBrief);
        expect(cadContext.selectedConceptDrawingScope).toMatchObject({ mode: "draw_selected_concept_only", selectedId: "B" });
        expect(cadContext.selectedConceptDrawingScope.instruction).toContain("do not treat an earlier request to propose multiple concepts as a CAD drawing requirement");
        expect(userContent[0].text).toContain('"id":"B"');
        expect(userContent[0].text).toContain('"strategy":"courtyard"');
        expect(userContent.filter((part: { type: string }) => part.type === "image_url")).toHaveLength(1);
        expect(userContent.find((part: { type: string }) => part.type === "image_url").image_url.url.startsWith("data:image/jpeg;base64,")).toBe(true);
        return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "تم", done: false }) } }] }), { status: 200 });
      });
      const originalBrief = "أريد شقتين وثلاث غرف نوم لكل شقة، وعلى الأرض 20×20 متر. اقترح ثلاث توزيعات مختلفة للحركة والخصوصية.";
      await expect(proposeCadCommands({ ...valid, instruction: originalBrief, selectedConcept, conceptBoardDataUrl }, null, null, fetchFn as unknown as typeof fetch)).resolves.toMatchObject({ done: false });
      expect(fetchFn).toHaveBeenCalledOnce();
    } finally { vi.unstubAllEnvs(); }
  });

  it("accepts unresolved brief items without invented evidence and safely retries invalid commands once", async () => {
    const unresolved = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "start", requiredElements: [{ requirement: "two apartments", status: "unresolved" }], done: false });
    expect(parseCadCommandAction(unresolved, 3, 3)?.requiredElements[0].evidenceIds).toEqual([]);
    expect(parseCadCommandAction(unresolved, 3, 3)?.requiredElements[0].evidence).toBe("Not evaluated yet");

    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const invalid = JSON.stringify({ commands: [{ op: "unsafe-secret-marker", id: "bad-wall" }], summary: "bad", done: false });
    const repaired = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "تم", done: false });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: invalid } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: repaired } }] }), { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(proposeCadCommands({ ...valid, siteWidth: 3, siteDepth: 3 }, null, null, fetchFn as unknown as typeof fetch)).resolves.toMatchObject({ summary: "تم" });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse(fetchFn.mock.calls[1][1]?.body as string);
      expect(retryBody.max_tokens).toBe(7_000);
      expect(JSON.stringify(retryBody.messages)).toContain("invalid_command_contract");
      expect(JSON.stringify(retryBody.messages)).toContain("command index 0");
      expect(JSON.stringify(retryBody.messages)).not.toContain("unsafe-secret-marker");
      expect(warn).toHaveBeenCalledWith("[CAD_MODEL_OUTPUT_REJECTED]", expect.stringContaining('"op":"unknown"'));
    } finally { warn.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("defaults omitted done to false and reports safe field-level schema diagnostics on retry", async () => {
    const missingDone = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }] });
    expect(parseCadCommandAction(missingDone, 3, 3)?.done).toBe(false);
    expect(parseCadCommandAction(missingDone, 3, 3)?.summary).toBe("تم تحديث عناصر الرسم");
    const malformed = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "bad schema", selfReview: ["geometry checked", 42], requiredElements: [{ requirement: "two apartments", status: "met", evidenceIds: [] }], done: false });
    const rejection: { category: string; schemaFields?: string[] } = { category: "" };
    expect(parseCadCommandAction(malformed, 3, 3, null, rejection)).toBeNull();
    expect(rejection).toMatchObject({ category: "invalid_top_level_schema", schemaFields: ["selfReview[1]:expected_string_max_240"] });

    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const repaired = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "تم" });
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: malformed } }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: repaired } }] }), { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(proposeCadCommands({ ...valid, siteWidth: 3, siteDepth: 3 }, null, null, fetchFn as unknown as typeof fetch)).resolves.toMatchObject({ done: false });
      const retryBody = JSON.parse(fetchFn.mock.calls[1][1]?.body as string);
      expect(JSON.stringify(retryBody.messages)).toContain("selfReview[1]:expected_string_max_240");
      expect(warn).toHaveBeenCalledWith("[CAD_MODEL_OUTPUT_REJECTED]", expect.stringContaining('"schemaFields":["selfReview[1]:expected_string_max_240"]'));
      expect(JSON.stringify(retryBody.messages)).not.toContain("bad schema");
    } finally { warn.mockRestore(); vi.unstubAllEnvs(); }
  });

  it("fails with bounded response metadata after one invalid-output repair attempt", async () => {
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    const truncated = JSON.stringify({ choices: [{ finish_reason: "length", message: { content: "{not complete" } }] });
    const fetchFn = vi.fn(async () => new Response(truncated, { status: 200 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(proposeCadCommands({ ...valid, siteWidth: 3, siteDepth: 3 }, null, null, fetchFn as unknown as typeof fetch)).rejects.toMatchObject({
        name: "CadCommandValidationError", diagnostic: { category: "response_truncated", attempt: 2, finishReason: "length" },
      });
      expect(fetchFn).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(2);
    } finally { warn.mockRestore(); vi.unstubAllEnvs(); }
  });
});
