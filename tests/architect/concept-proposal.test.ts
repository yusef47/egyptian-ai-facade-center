import { describe, expect, it } from "vitest";
import { compileConceptProposal, parseConceptProposal } from "../../lib/architect/concept-proposal";
import { buildDxfPlan, buildSvgPlan } from "../../lib/architect/export-plan";

const squareSite = [
  { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 },
];

const freeform = {
  version: 2,
  site: squareSite,
  cells: [
    {
      id: "living", name: "Living and circulation", kind: "living",
      points: [
        { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 },
        { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 },
      ],
    },
    {
      id: "bedroom", name: "Bedroom", kind: "bedroom",
      points: [{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 8 }, { x: 4, y: 8 }],
    },
  ],
  doors: [
    { from: "living", to: "bedroom", width: 0.9, at: 0.5 },
    { from: "living", to: "outside", width: 1, at: 0.5 },
  ],
};

describe("concept proposal compiler", () => {
  it("turns a non-template L-shaped arrangement into shared walls and a usable door", () => {
    const result = compileConceptProposal(freeform);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.geometry.spaces).toHaveLength(2);
    expect(result.geometry.walls.filter((wall) => wall.sharedWith.length === 2)).toHaveLength(2);
    expect(result.geometry.openings).toHaveLength(2);
    const doorWall = result.geometry.walls.find((wall) => wall.id === result.geometry.openings[0]!.wallId)!;
    expect(doorWall.sharedWith).toEqual(["living", "bedroom"]);
    expect(buildSvgPlan(result.geometry)).toContain("Living and circulation");
    expect(buildDxfPlan(result.geometry)).toContain("DOORS");
  });

  it("compiles an authored exterior window into both vector exports", () => {
    const proposal = { ...freeform, windows: [{ space: "bedroom", edgeIndex: 1, width: 1.5, at: 0.5 }] };
    const result = compileConceptProposal(proposal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const window = result.geometry.openings.find((opening) => opening.kind === "window");
    expect(window).toMatchObject({ id: "cp-window-1", width: 1.5 });
    expect(result.geometry.walls.find((wall) => wall.id === window?.wallId)?.sharedWith).toEqual(["bedroom"]);
    expect(buildSvgPlan(result.geometry)).toContain('id="cp-window-1" data-kind="window"');
    expect(buildDxfPlan(result.geometry)).toContain("  8\nWINDOWS\n");
    expect(result.proposal.windows).toEqual(proposal.windows);
  });

  it("rejects windows on shared walls and windows overlapping doors", () => {
    const shared = compileConceptProposal({ ...freeform, windows: [{ space: "bedroom", edgeIndex: 0, width: 1.5, at: 0.5 }] });
    expect(shared).toEqual({ ok: false, errors: ["WINDOW_HAS_NO_EXTERIOR_WALL:bedroom:0"] });

    const collision = compileConceptProposal({ ...freeform, windows: [{ space: "living", edgeIndex: 0, width: 2, at: 0.5 }] });
    expect(collision.ok).toBe(false);
    if (!collision.ok) expect(collision.errors.some((error) => error.startsWith("OPENING_OVERLAP:"))).toBe(true);
  });

  it("splits a long edge at another cell's T junction and stores each shared wall once", () => {
    const proposal = {
      version: 2, site: squareSite,
      cells: [
        { id: "left", name: "Left", kind: "living", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 8 }, { x: 0, y: 8 }] },
        { id: "lower", name: "Lower", kind: "corridor", points: [{ x: 4, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }] },
        { id: "upper", name: "Upper", kind: "bedroom", points: [{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 8 }, { x: 4, y: 8 }] },
      ],
      doors: [
        { from: "left", to: "lower", width: 0.9, at: 0.5 },
        { from: "lower", to: "upper", width: 0.9, at: 0.5 },
        { from: "left", to: "outside", width: 1, at: 0.5 },
      ],
    };
    const result = compileConceptProposal(proposal);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const shared = result.geometry.walls.filter((wall) => wall.sharedWith.length === 2);
    expect(shared).toHaveLength(3);
    expect(shared.some((wall) => wall.sharedWith.includes("left") && wall.sharedWith.includes("lower"))).toBe(true);
    expect(shared.some((wall) => wall.sharedWith.includes("left") && wall.sharedWith.includes("upper"))).toBe(true);
    expect(shared.some((wall) => wall.sharedWith.includes("lower") && wall.sharedWith.includes("upper"))).toBe(true);
  });

  it("rejects overlapping cells and a door between non-neighboring cells", () => {
    const overlap = structuredClone(freeform);
    overlap.cells[1]!.points = [
      { x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 },
    ];
    const overlapResult = compileConceptProposal(overlap);
    expect(overlapResult.ok).toBe(false);
    if (!overlapResult.ok) expect(overlapResult.errors.some((error) => error.startsWith("SPACE_OVERLAP:"))).toBe(true);

    const isolated = structuredClone(freeform);
    isolated.cells[1]!.points = [
      { x: 5, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 7 }, { x: 5, y: 7 },
    ];
    const isolatedResult = compileConceptProposal(isolated);
    expect(isolatedResult).toEqual({ ok: false, errors: ["DOOR_HAS_NO_SUITABLE_WALL:living:bedroom"] });
  });

  it("rejects malformed, oversized and unsafe model proposals before compilation", () => {
    expect(parseConceptProposal({ ...freeform, site: [{ x: Number.NaN, y: 0 }, ...squareSite.slice(1)] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, site: [{ x: 1001, y: 0 }, ...squareSite.slice(1)] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, cells: [{ ...freeform.cells[0], id: "<script>" }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, cells: [{ ...freeform.cells[0], name: "Bad\nDXF" }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, cells: [{ ...freeform.cells[0], id: "outside" }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, cells: [{ ...freeform.cells[0], kind: "launchpad" }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, cells: Array(31).fill(freeform.cells[0]) })).toBeNull();
    expect(parseConceptProposal({ ...freeform, doors: [{ from: "living", to: "bedroom", width: 999, at: 0.5 }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, windows: [{ space: "living", edgeIndex: 99, width: 1, at: 0.5 }] })).toBeNull();
    expect(parseConceptProposal({ ...freeform, windows: [{ space: "living", edgeIndex: 0, width: 1, at: "middle" }] })).toBeNull();
  });

  it("rejects spaces with no door path to open air", () => {
    const noEntry = structuredClone(freeform);
    noEntry.doors = noEntry.doors.filter((door) => door.to !== "outside");
    const result = compileConceptProposal(noEntry);
    expect(result).toEqual({
      ok: false,
      errors: ["SPACE_WITHOUT_ACCESS:living", "SPACE_WITHOUT_ACCESS:bedroom"],
    });
  });

  it("does not make a bedroom the required passage to a public room", () => {
    const proposal = {
      version: 2, site: squareSite,
      cells: [
        { id: "entry", name: "Entry", kind: "corridor", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 8 }, { x: 0, y: 8 }] },
        { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 3, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 8 }, { x: 3, y: 8 }] },
        { id: "kitchen", name: "Kitchen", kind: "kitchen", points: [{ x: 6, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 6, y: 8 }] },
      ],
      doors: [
        { from: "entry", to: "outside", width: 1, at: 0.5 },
        { from: "entry", to: "bedroom", width: 0.9, at: 0.5 },
        { from: "bedroom", to: "kitchen", width: 0.8, at: 0.5 },
      ],
    };
    expect(compileConceptProposal(proposal)).toEqual({ ok: false, errors: ["ACCESS_THROUGH_PRIVATE_SPACE:kitchen"] });
  });

  it("allows an en-suite bathroom reached through its bedroom", () => {
    const proposal = {
      version: 2, site: squareSite,
      cells: [
        { id: "entry", name: "Entry", kind: "corridor", points: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 8 }, { x: 0, y: 8 }] },
        { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 3, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 8 }, { x: 3, y: 8 }] },
        { id: "bath", name: "En-suite", kind: "bathroom", points: [{ x: 6, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 6, y: 8 }] },
      ],
      doors: [
        { from: "entry", to: "outside", width: 1, at: 0.5 },
        { from: "entry", to: "bedroom", width: 0.9, at: 0.5 },
        { from: "bedroom", to: "bath", width: 0.8, at: 0.5 },
      ],
    };
    expect(compileConceptProposal(proposal).ok).toBe(true);
  });

  it("migrates old named cells without inventing semantic types", () => {
    const old = {
      ...freeform, version: 1,
      cells: freeform.cells.map(({ kind: _kind, ...cell }) => cell),
    };
    const migrated = parseConceptProposal(old);
    expect(migrated?.version).toBe(2);
    expect(migrated?.cells.map((cell) => cell.kind)).toEqual(["other", "other"]);
  });
});
