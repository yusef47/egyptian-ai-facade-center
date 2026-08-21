import { describe, expect, it } from "vitest";
import { buildDxfFromRaster } from "../client/src/lib/dxf";

describe("DXF raster vectorization", () => {
  it("writes the verified minimal AutoCAD 2027 AC1009 LINE format", () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 2; x <= 7; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }

    const dxf = buildDxfFromRaster({ width, height, data });

    expect(dxf).toContain("  0\nSECTION\n  2\nHEADER");
    expect(dxf).toContain("  9\n$ACADVER\n  1\nAC1009");
    expect(dxf).toContain("  9\n$EXTMIN\n 10\n0.0\n 20\n0.0");
    expect(dxf).toContain("  9\n$EXTMAX\n 10\n10.0\n 20\n10.0");
    expect(dxf).not.toContain("AC1032");
    expect(dxf).not.toContain("\r");
    expect(dxf).not.toContain("VPORT");
    expect(dxf).not.toContain("INSBASE");
    expect(dxf).not.toContain("INSUNITS");
    expect(dxf).not.toContain("CAD_OUTLINE");
    expect(dxf).not.toContain("POLYLINE");
    expect(dxf).not.toContain("VERTEX");
    expect(dxf).not.toContain("SEQEND");
    expect(dxf).toContain("  0\nSECTION\n  2\nTABLES");
    expect(dxf).toContain("  2\nLTYPE\n 70\n1");
    expect(dxf).toContain("  2\nCONTINUOUS");
    expect(dxf).toContain("  2\nLAYER\n 70\n1");
    expect(dxf).toContain("  2\n0\n 70\n0\n 62\n7\n  6\nCONTINUOUS");
    expect(dxf).toContain("  0\nSECTION\n  2\nENTITIES");

    const entities = dxf.split("  0\nLINE\n").slice(1);
    expect(entities.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(entity).toMatch(/^  8\n0\n 10\n-?\d+\.\d\n 20\n-?\d+\.\d\n 11\n-?\d+\.\d\n 21\n-?\d+\.\d\n/);
    }
    expect(dxf).toContain("\n 20\n8.0\n");
    expect(dxf).not.toMatch(/\d+\.\d{2}/);

    const lines = dxf.split("\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.slice(0, -1)).not.toContain("");
    for (let index = 0; index < lines.length - 1; index += 2) {
      expect(lines[index]).toMatch(/^\s*\d+$/);
      expect(lines[index]).toHaveLength(3);
    }
    expect(dxf).toMatch(/\n  0\nENDSEC\n  0\nEOF\n$/);
  });

  it("keeps the output at or below 3000 LINE entities", () => {
    const grid = 50;
    const squareSize = 7;
    const spacing = 10;
    const width = grid * spacing;
    const height = width;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let row = 0; row < grid; row += 1) {
      for (let column = 0; column < grid; column += 1) {
        for (let y = 1; y <= squareSize; y += 1) {
          for (let x = 1; x <= squareSize; x += 1) {
            const pixelX = column * spacing + x;
            const pixelY = row * spacing + y;
            const offset = (pixelY * width + pixelX) * 4;
            data[offset] = 0;
            data[offset + 1] = 0;
            data[offset + 2] = 0;
            data[offset + 3] = 255;
          }
        }
      }
    }

    const dxf = buildDxfFromRaster({ width, height, data }, { maxContours: 10_000 });
    expect(dxf.split("  0\nLINE\n").length - 1).toBeLessThanOrEqual(3000);
  });

  it("rejects raster components whose only segment is shorter than 5 pixels", () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (const x of [1, 2]) {
      const offset = (1 * width + x) * 4;
      data[offset] = 0;
      data[offset + 1] = 0;
      data[offset + 2] = 0;
      data[offset + 3] = 255;
    }

    expect(() => buildDxfFromRaster({ width, height, data })).toThrow(/segment/i);
  });

  it("rejects invalid or empty raster sources", () => {
    expect(() => buildDxfFromRaster({ width: 0, height: 4, data: new Uint8ClampedArray() })).toThrow(/raster/i);
    expect(() => buildDxfFromRaster({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) })).toThrow(/dark|contour/i);
  });
});
