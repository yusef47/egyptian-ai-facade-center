import { describe, expect, it, vi } from "vitest";
import { CAD_AGENT, cadCompletionReady, compileCadCommands, parseCadAction, parseCadBoundsFailure, parseCadCommandAction, parseCadInput, proposeCadAction, proposeCadCommands, sandboxName } from "../../lib/architect/cad-agent";
import { FREECAD_HARNESS } from "../../lib/architect/cad-agent-harness";

const valid = {
  projectId: "0123456789abcdef01234567",
  instruction: "Design two apartments on a 20 m by 20 m site",
  siteWidth: 20,
  siteDepth: 20,
  step: 0,
};

describe("CAD agent input and execution contracts", () => {
  it("accepts a bounded project and rejects a forged or oversized request", () => {
    expect(parseCadInput(valid)).toEqual(valid);
    expect(parseCadInput({ ...valid, projectId: "../../other" })).toBeNull();
    expect(parseCadInput({ ...valid, siteWidth: 0 })).toBeNull();
    expect(parseCadInput({ ...valid, step: CAD_AGENT.maxSteps })).toBeNull();
    expect(parseCadInput({ ...valid, instruction: "a".repeat(CAD_AGENT.maxBrief + 1) })).toBeNull();
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
    expect(compiled).toContain("_n=_n.multiply(125)");
    expect(compiled).toContain("_wall_shape(_host)");
    expect(compiled).toContain("CadOpenings=json.dumps(_preserved)");
    expect(compiled).toContain("%0.0f mm");
    expect(compiled).toContain("Part.makeCompound(_edges)");
    expect(compiled).toContain("_i in range(1,13)");
    expect(compiled).toContain("_h*.82");
    expect(compiled).not.toContain("Part.makeCompound([])");
    expect(compiled).not.toContain("import os");
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
      { op: "furniture", id: "oversized-car", kind: "car-sedan", at: [1000, 1000], width: 8000, depth: 12000 },
    ], summary: "invalid", done: false }), 20, 20)).toBeNull();
    expect(FREECAD_HARNESS).toContain("'HATCH':'#6ca6a3'");
    expect(FREECAD_HARNESS).toContain("pair(0,'LINE',8,kind");
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
    expect(parseCadCommandAction(JSON.stringify({ commands: [{ op: "line", id: "line-a", from: [100, 100], to: [500, 100] }], summary: "x", selfReview: [], requiredElements: [{ requirement: "room", status: "met", evidenceIds: [], evidence: "proof" }], unresolvedItems: [], done: true }), 3, 3)).toBeNull();
  });

  it("runs deterministic opening, room, and schematic object checks and reports unverified enclosure", () => {
    expect(FREECAD_HARNESS).toContain("opening metadata does not match opening symbols");
    expect(FREECAD_HARNESS).toContain("wall geometry crossing its declared gap");
    expect(FREECAD_HARNESS).toContain("label position is outside the site");
    expect(FREECAD_HARNESS).toContain("has invalid plan bounds");
    expect(FREECAD_HARNESS).toContain("Room enclosure and room-to-exit accessibility are not automatically verified");
  });

  it("returns bounded structured outside-site geometry details without trusting labels", () => {
    const encoded = JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }]);
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${encoded}`)).toEqual([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }]);
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "<script>secret</script>", boundsMm: [-120, 2500, 900, 3400], siteMm: [20_000, 20_000] }])}`)).toBeNull();
    expect(parseCadBoundsFailure(`CAD_BOUNDS_ERROR:${JSON.stringify([{ code: "OUTSIDE_SITE", id: "door-west", label: "DOOR_door-west", boundsMm: [-300_000, 2500, 900, 3400], siteMm: [20_000, 20_000] }])}`)).toBeNull();
    expect(FREECAD_HARNESS).toContain("CAD_BOUNDS_ERROR:");
    expect(FREECAD_HARNESS).toContain("'boundsMm'");
    expect(FREECAD_HARNESS).toContain("geometry_errors[:8]");
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
    expect(compiled).toContain("_toward=_center.sub(_mid)");
    expect(compiled).toContain("if _toward.x*_n.x+_toward.y*_n.y<0: _n=_n.multiply(-1)");
    expect(compiled).toContain("_normal=_n.multiply(-1)");
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
    vi.stubEnv("OPENROUTER_ARCHITECT_TEXT_MODEL", "anthropic/claude-sonnet-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    try {
      const fetchFn = vi.fn(async (_url: unknown, options: RequestInit) => {
        const body = JSON.parse(options.body as string);
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

  it("accepts unresolved brief items without invented evidence and safely retries invalid commands once", async () => {
    const unresolved = JSON.stringify({ commands: [{ op: "wall", id: "north-wall", from: [100, 100], to: [1900, 100], thickness: 200 }], summary: "start", requiredElements: [{ requirement: "two apartments", status: "unresolved", evidenceIds: [] }], done: false });
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
