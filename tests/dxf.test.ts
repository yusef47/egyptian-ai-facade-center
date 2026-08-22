import { describe, expect, it } from "vitest";
import { buildDxfFromSvg } from "../client/src/lib/dxf";

function countLines(dxf: string): number {
  return dxf.split("  0\nLINE\n").length - 1;
}

describe("DXF Potrace path vectorization", () => {
  it("writes ordered SVG contours as the verified minimal AC1009 LINE format", () => {
    const svg = '<svg viewBox="0 0 40 40"><path d="M 2 2 L 38 2 L 38 38 L 2 38 Z"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 40, height: 40 });

    expect(dxf).toContain("  0\nSECTION\n  2\nHEADER");
    expect(dxf).toContain("  9\n$ACADVER\n  1\nAC1009");
    expect(dxf).toContain("  9\n$EXTMIN\n 10\n0.0\n 20\n0.0");
    expect(dxf).toContain("  9\n$EXTMAX\n 10\n40.0\n 20\n40.0");
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
    expect(dxf).toContain("\n 20\n2.0\n");
    expect(dxf).toMatch(/\n  0\nENDSEC\n  0\nEOF\n$/);
  });

  it("flattens cubic paths while preserving their ordered contour direction", () => {
    const svg = '<svg viewBox="0 0 40 40"><path d="M 1 1 C 1 30 30 30 38 1 Z"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 40, height: 40 });

    expect(countLines(dxf)).toBeGreaterThan(2);
    expect(dxf).not.toMatch(/\d+\.\d{2}/);
    expect(dxf).not.toContain("  0\nPOLYLINE\n");
  });

  it("caps traced geometry at 5000 LINE entities", () => {
    const paths = Array.from({ length: 1300 }, (_, index) => {
      const x = (index % 65) * 20;
      const y = Math.floor(index / 65) * 20;
      return `<path d="M ${x} ${y} L ${x + 12} ${y} L ${x + 12} ${y + 12} L ${x} ${y + 12} Z"/>`;
    }).join("");
    const dxf = buildDxfFromSvg(`<svg>${paths}</svg>`, { width: 1300, height: 400 });

    expect(countLines(dxf)).toBeLessThanOrEqual(5000);
  });

  it("filters small text-like paths but keeps long thin structural paths", () => {
    const svg = [
      '<path d="M 1 1 L 7 1 L 7 7 L 1 7 Z"/>',
      '<path d="M 5 5 L 105 5 L 105 6 L 5 6 Z"/>',
    ].join("");
    const dxf = buildDxfFromSvg(`<svg>${svg}</svg>`, { width: 120, height: 20 });

    expect(countLines(dxf)).toBe(1);
    expect(dxf).toContain(" 10\n5.0\n 20\n15.0\n 11\n105.0\n 21\n15.0");
  });

  it("snaps near-horizontal and near-vertical segments to CAD orthogonal geometry", () => {
    const svg = '<svg><path d="M 1 2 L 51 7 M 60 2 L 65 52"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 80, height: 70 });
    const entities = dxf.split("  0\nLINE\n").slice(1);

    expect(entities).toHaveLength(2);
    expect(entities[0]).toContain(" 10\n1.0\n 20\n68.0\n 11\n51.0\n 21\n68.0\n");
    expect(entities[1]).toContain(" 10\n60.0\n 20\n68.0\n 11\n60.0\n 21\n18.0\n");
  });

  it("preserves preview orientation by flipping only the image Y axis", () => {
    const svg = '<svg><path d="M 2 3 L 52 3"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 60, height: 30 });

    expect(dxf).toContain(" 10\n2.0\n 20\n27.0\n 11\n52.0\n 21\n27.0\n");
    expect(dxf).not.toContain(" 10\n18.0\n");
  });

  it("merges nearby parallel segments into a single centerline", () => {
    const svg = '<svg><path d="M 2 10 L 42 10 M 2 12 L 42 12 M 60 10 L 110 10"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 120, height: 30 });

    expect(countLines(dxf)).toBe(2);
    expect(dxf).toContain(" 10\n2.0\n 20\n19.0\n 11\n42.0\n 21\n19.0\n");
    expect(dxf).toContain(" 10\n60.0\n 20\n20.0\n 11\n110.0\n 21\n20.0\n");
  });

  it("scales four-times traced coordinates back to native quadrant units", () => {
    const svg = '<svg><path d="M 8 12 L 168 12"/></svg>';
    const dxf = buildDxfFromSvg(svg, { width: 200, height: 200, scale: 0.25 });

    expect(dxf).toContain(" 10\n2.0\n 20\n47.0\n 11\n42.0\n 21\n47.0\n");
  });

  it("rejects SVG without usable ordered paths", () => {
    expect(() => buildDxfFromSvg("<svg><circle cx=\"2\" cy=\"2\" r=\"1\"/></svg>", { width: 10, height: 10 })).toThrow(/path|segment|geometry/i);
  });
});
