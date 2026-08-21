import { describe, expect, it } from "vitest";
import { buildDxfFromSvg } from "../client/src/lib/dxf";

function countLines(dxf: string): number {
  return dxf.split("  0\nLINE\n").length - 1;
}

describe("DXF Potrace path vectorization", () => {
  it("writes ordered SVG contours as the verified minimal AC1009 LINE format", () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M 2 2 L 8 2 L 8 8 L 2 8 Z"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 10, height: 10 });

    expect(dxf).toContain("  0\nSECTION\n  2\nHEADER");
    expect(dxf).toContain("  9\n$ACADVER\n  1\nAC1009");
    expect(dxf).toContain("  9\n$EXTMIN\n 10\n0.0\n 20\n0.0");
    expect(dxf).toContain("  9\n$EXTMAX\n 10\n10.0\n 20\n10.0");
    expect(dxf).not.toContain("\r");
    expect(dxf).not.toContain("VPORT");
    expect(dxf).not.toContain("CAD_OUTLINE");
    expect(dxf).not.toContain("POLYLINE");
    expect(dxf).toContain("  2\nLTYPE\n 70\n1");
    expect(dxf).toContain("  2\nLAYER\n 70\n1");

    const entities = dxf.split("  0\nLINE\n").slice(1);
    expect(entities.length).toBe(4);
    for (const entity of entities) {
      expect(entity).toMatch(/^  8\n0\n 10\n-?\d+\.\d\n 20\n-?\d+\.\d\n 11\n-?\d+\.\d\n 21\n-?\d+\.\d\n/);
    }
    expect(dxf).toContain("\n 20\n8.0\n");
    expect(dxf).toMatch(/\n  0\nENDSEC\n  0\nEOF\n$/);
  });

  it("flattens cubic paths while preserving their ordered contour direction", () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M 1 1 C 1 8 8 8 8 1 Z"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 10, height: 10 });

    expect(countLines(dxf)).toBeGreaterThan(2);
    expect(dxf).not.toMatch(/\d+\.\d{2}/);
    expect(dxf).not.toContain("  0\nPOLYLINE\n");
  });

  it("caps traced geometry at 5000 LINE entities", () => {
    const paths = Array.from({ length: 1300 }, (_, index) => {
      const x = (index % 65) * 10;
      const y = Math.floor(index / 65) * 10;
      return `<path d="M ${x} ${y} L ${x + 6} ${y} L ${x + 6} ${y + 6} L ${x} ${y + 6} Z"/>`;
    }).join("");
    const dxf = buildDxfFromSvg(`<svg>${paths}</svg>`, { width: 650, height: 200 });

    expect(countLines(dxf)).toBeLessThanOrEqual(5000);
  });

  it("rejects SVG without usable ordered paths", () => {
    expect(() => buildDxfFromSvg("<svg><circle cx=\"2\" cy=\"2\" r=\"1\"/></svg>", { width: 10, height: 10 })).toThrow(/path|segment|geometry/i);
  });
});
