import { describe, expect, it } from "vitest";
import { buildDxfPlan, buildSvgPlan, DXF_LAYERS } from "../../lib/architect/export-plan";
import { buildResidentialFloorFixture } from "../../lib/architect/fixtures";
import { compileConceptProposal } from "../../lib/architect/concept-proposal";

function countDxfEntities(dxf: string, entity: string): number {
  return dxf.split(`  0\n${entity}\n`).length - 1;
}

describe("buildSvgPlan", () => {
  it("produces a meter-scaled SVG for the 12x20 site", () => {
    const fixture = buildResidentialFloorFixture();
    const svg = buildSvgPlan(fixture);
    expect(svg).toContain('data-units="meters"');
    // 12 wide + 2 x 1 m margin = 14 viewBox width; 20 + 2 = 22 height.
    expect(svg).toContain('viewBox="0 0 14 22"');
  });

  it("groups geometry into site, spaces, walls, openings, and dimensions layers", () => {
    const svg = buildSvgPlan(buildResidentialFloorFixture());
    for (const layer of ["site", "spaces", "walls", "openings", "dimensions"]) {
      expect(svg).toContain(`<g id="${layer}">`);
    }
  });

  it("keeps SVG coordinates Y-down (top of plan has the smallest Y)", () => {
    const fixture = buildResidentialFloorFixture();
    const svg = buildSvgPlan(fixture);
    // North wall (world y=20) maps to SVG y = margin (1) — the topmost line.
    expect(svg).toMatch(/id="wall-north-west" x1="1" y1="1"/);
    // South wall (world y=0) maps to SVG y = margin + 20 = 21.
    expect(svg).toMatch(/id="wall-south-west" x1="1" y1="21"/);
  });

  it("includes every space polygon and wall with element IDs", () => {
    const fixture = buildResidentialFloorFixture();
    const svg = buildSvgPlan(fixture);
    for (const space of fixture.spaces) {
      expect(svg).toContain(`id="${space.id}"`);
    }
    for (const wall of fixture.walls) {
      expect(svg).toContain(`id="${wall.id}"`);
    }
  });

  it("positions openings along their walls", () => {
    const svg = buildSvgPlan(buildResidentialFloorFixture());
    expect(svg).toMatch(/id="door-unit-a-core"[^/]*data-kind="door"/);
    expect(svg).toMatch(/id="window-unit-a-north"[^/]*data-kind="window"/);
  });

  it("keeps a label inside a concave cell and displays its true area", () => {
    const compiled = compileConceptProposal({
      version: 2,
      site: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }],
      cells: [
        { id: "living", name: "Living", kind: "living", points: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 8 }, { x: 0, y: 8 }] },
        { id: "bedroom", name: "Bedroom", kind: "bedroom", points: [{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 8 }, { x: 4, y: 8 }] },
      ],
      doors: [{ from: "living", to: "outside", width: 1, at: 0.5 }, { from: "living", to: "bedroom", width: 0.9, at: 0.5 }],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const svg = buildSvgPlan(compiled.geometry, { spaceFills: { living: "#e6f0e8" }, spaceLabelMetric: "area" });
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(doc.querySelector("parsererror")).toBeNull();
    expect(doc.querySelector('polygon#living')?.getAttribute("fill")).toBe("#e6f0e8");
    const label = doc.querySelector('g[data-space-label="living"]');
    expect(label?.textContent).toContain("48 m²");
    const x = Number(label?.querySelector("text")?.getAttribute("x"));
    const y = Number(label?.querySelector("text")?.getAttribute("y"));
    // World notch x>4,y>4 maps to SVG x>5,y<5.18. The anchor stays inside L.
    expect(x > 5 && y < 5.18).toBe(false);
  });
});

describe("buildDxfPlan", () => {
  it("emits a minimal AC1009 DXF with header, tables, entities, and EOF", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    expect(dxf).toContain("  0\nSECTION\n  2\nHEADER");
    expect(dxf).toContain("  9\n$ACADVER\n  1\nAC1009");
    expect(dxf).toContain("  9\n$EXTMAX\n 10\n12.00\n 20\n20.00");
    expect(dxf).toMatch(/\n  0\nENDSEC\n  0\nEOF\n$/);
    expect(dxf).not.toContain("\r");
  });

  it("declares one layer per semantic group", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    for (const layer of Object.values(DXF_LAYERS)) {
      expect(dxf).toContain(`  0\nLAYER\n  2\n${layer}\n`);
    }
  });

  it("places walls on the WALLS layer and the site boundary on the SITE layer", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    // 12 wall segments + 6 openings + 4 site rectangle edges = 22 LINE entities.
    expect(countDxfEntities(dxf, "LINE")).toBe(fixtureWallCount() + 6 + 4);
    expect(dxf).toContain(`  8\n${DXF_LAYERS.WALLS}\n 10\n0.00\n 20\n0.00\n 11\n6.00\n 21\n0.00`);
    expect(dxf).toContain(`  8\n${DXF_LAYERS.SITE}\n 10\n12.00\n 20\n0.00\n 11\n12.00\n 21\n20.00`);
  });

  it("routes doors and windows onto separate layers", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    // door-unit-a-core on the vertical wall x=9, offset 4, width 1 → y 14..15.
    expect(dxf).toContain(`  8\n${DXF_LAYERS.DOORS}\n 10\n9.00\n 20\n14.00\n 11\n9.00\n 21\n15.00`);
    // window-unit-b-south: south-east wall y=0 x=6..12, offset 1, width 2 → x 7..9.
    expect(dxf).toContain(`  8\n${DXF_LAYERS.WINDOWS}\n 10\n7.00\n 20\n0.00\n 11\n9.00\n 21\n0.00`);
  });

  it("keeps the same coordinate system as the geometry (Y-up, no mirroring)", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    // North wall (y=20) must appear at DXF y=20 (top), not flipped.
    expect(dxf).toContain(`  8\n${DXF_LAYERS.WALLS}\n 10\n0.00\n 20\n20.00\n 11\n9.00\n 21\n20.00`);
  });

  it("emits space labels as TEXT entities on the labels layer", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    expect(countDxfEntities(dxf, "TEXT")).toBe(3);
    // Labels carry the human-readable space names.
    expect(dxf).toContain("Unit A — living floor");
    expect(dxf).toContain("Unit B — full-width apartment");
    expect(dxf).toContain("Stair and services core");
  });

  it("skips openings with invalid wall references instead of crashing", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.openings.push({ id: "ghost", kind: "door", wallId: "nope", offset: 0, width: 1 });
    const dxf = buildDxfPlan(fixture);
    // The ghost opening exports nothing (no wall to project onto), while the
    // valid doors still do — the two unit-to-core doors.
    expect(dxf).toContain(`  8\n${DXF_LAYERS.DOORS}\n 10\n9.00\n 20\n14.00\n 11\n9.00\n 21\n15.00`);
    expect(dxf).toContain(`  8\n${DXF_LAYERS.DOORS}\n 10\n10.00\n 20\n10.00\n 11\n11.00\n 21\n10.00`);
  });
});

function fixtureWallCount(): number {
  return buildResidentialFloorFixture().walls.length;
}

describe("SVG serialization hardening (escape at the boundary)", () => {
  it("escapes quotes and markup in space ids, names, and text nodes", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.spaces[0]!.id = 'space-"x"<y>';
    fixture.spaces[0]!.name = "Room <b>&'</b>";
    const svg = buildSvgPlan(fixture);
    // No raw markup can escape an attribute or a text node.
    expect(svg).not.toContain("<b>");
    // Well-formedness: a raw quote or tag breaking an attribute would make
    // the XML unparseable.
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(parsed.querySelector("parsererror")).toBeNull();
    expect(svg).toContain('id="space-&quot;x&quot;&lt;y&gt;"');
    expect(svg).toContain('data-name="Room &lt;b&gt;&amp;&apos;&lt;/b&gt;"');
    expect(svg).toContain("Room &lt;b&gt;&amp;&apos;&lt;/b&gt;</text>");
    expect(svg).toContain(">9 × 10 m</text>");
  });

  it("escapes wall and opening ids", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.walls[0]!.id = 'wall-"a"&b';
    fixture.openings[0]!.id = "door-<x>";
    const svg = buildSvgPlan(fixture);
    expect(svg).toContain('id="wall-&quot;a&quot;&amp;b"');
    expect(svg).toContain('id="door-&lt;x&gt;"');
    expect(svg).not.toContain('id="door-<x>"');
  });

  it("leaves the canonical fixture output byte-for-byte unescaped", () => {
    const svg = buildSvgPlan(buildResidentialFloorFixture());
    // The fixture's IDs and names contain no XML-special characters.
    expect(svg).not.toContain("&amp;");
    expect(svg).not.toContain("&quot;");
    expect(svg).toContain('id="space-unit-a"');
    expect(svg).toContain('data-name="Unit A — living floor"');
    expect(svg).toContain(">UNIT A</text>");
    expect(svg).toContain(">9 × 10 m</text>");
  });

  it("uses short, separate Arabic labels without losing the full space name", () => {
    const svg = buildSvgPlan(buildResidentialFloorFixture(), { locale: "ar" });
    expect(svg).toContain('data-name="Unit A — living floor"');
    expect(svg).toContain(">الوحدة أ</text>");
    expect(svg).toContain(">النواة</text>");
    expect(svg).toContain(">9 × 10 م</text>");
    expect(svg).not.toContain(">Unit A — living floor 9×10m</text>");
  });
});

describe("DXF TEXT sanitization", () => {
  it("keeps CR/LF and DXF-looking group codes from breaking pair structure", () => {
    const fixture = buildResidentialFloorFixture();
    fixture.spaces[0]!.name = "Room\r\n 0\r\nLINE";
    const dxf = buildDxfPlan(fixture);

    // The document contains no carriage returns at all.
    expect(dxf).not.toContain("\r");
    // All three TEXT entities survive; LINE count is untouched (no injected entity).
    expect(dxf.split("  0\nTEXT\n").length - 1).toBe(3);
    expect(dxf.split("  0\nLINE\n").length - 1).toBe(fixtureWallCount() + 6 + 4);

    // The affected TEXT value stays on ONE line and the following group code
    // remains aligned — the injected "0 / LINE" pair is neutralized as text.
    const lines = dxf.split("\n");
    const valueIndex = lines.findIndex(
      (line, index) => lines[index - 1] === "  1" && line.includes("Room"),
    );
    expect(valueIndex).toBeGreaterThan(-1);
    expect(lines[valueIndex]).toBe("Room  0 LINE");
    expect(lines[valueIndex + 1]).toBe("  0");
  });

  it("preserves ordinary space names and group alignment", () => {
    const dxf = buildDxfPlan(buildResidentialFloorFixture());
    const lines = dxf.split("\n");
    const valueIndex = lines.findIndex(
      (line, index) => lines[index - 1] === "  1" && line.startsWith("Unit A"),
    );
    expect(valueIndex).toBeGreaterThan(-1);
    expect(lines[valueIndex]).toBe("Unit A — living floor");
    expect(lines[valueIndex + 1]).toBe("  0");
  });
});
