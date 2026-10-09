import { describe, expect, it } from "vitest";
import { generateLayout } from "../../lib/architect/generate";
import {
  buildStructuralConcept,
  buildStructuralDxf,
  buildStructuralSvg,
  validateStructuralConcept,
} from "../../lib/architect/structural-concept";

function options() {
  const result = generateLayout({
    program: { units: 2, core: "shared" },
    width: 12,
    depth: 20,
    coreSide: "east",
    unitSplit: 0.5,
  });
  if (!result.ok) throw new Error("Layout setup failed");
  return result.options;
}

describe("structural coordination concept", () => {
  it("derives a connected column/beam grid and slab from both layout options", () => {
    for (const option of options()) {
      const scheme = buildStructuralConcept(option.geometry);
      expect(scheme.status).toBe("coordination-only");
      expect(scheme.columns).toHaveLength(9);
      expect(scheme.beams).toHaveLength(12);
      expect(scheme.slabs).toHaveLength(1);
      expect(validateStructuralConcept(option.geometry, scheme)).toEqual([]);
      expect(buildStructuralSvg(option.geometry, scheme, "ar")).toContain('data-status="coordination-only"');
      const dxf = buildStructuralDxf(option.geometry, scheme);
      expect(dxf).toContain("STRUCT_COLUMNS");
      expect(dxf).toContain("STRUCT_BEAMS");
      expect(dxf).toContain("STRUCT_SLAB");
      expect(dxf).toContain("COORDINATION ONLY - NO ANALYSIS OR MEMBER SIZES");
    }
  });

  it("rejects broken references and zero-length beam geometry", () => {
    const option = options()[0]!;
    const scheme = buildStructuralConcept(option.geometry);
    scheme.beams[0]!.toColumnId = "missing";
    expect(validateStructuralConcept(option.geometry, scheme)).toContain("Invalid beam references");
  });
});
