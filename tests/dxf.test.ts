import { describe, expect, it } from "vitest";
import { buildDxfFromRaster } from "../client/src/lib/dxf";

describe("DXF raster vectorization", () => {
  it("writes an AutoCAD-readable ASCII DXF with padded atomic LINE entities", () => {
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

    expect(dxf).toContain("  0\r\nSECTION\r\n  2\r\nHEADER");
    expect(dxf).toContain("  9\r\n$ACADVER\r\n  1\r\nAC1032");
    expect(dxf).toContain("  9\r\n$INSBASE\r\n 10\r\n0.00\r\n 20\r\n0.00\r\n 30\r\n0.00");
    expect(dxf).toContain("  9\r\n$INSUNITS\r\n 70\r\n0");
    expect(dxf).not.toContain("AC1009");
    expect(dxf).not.toContain("POLYLINE");
    expect(dxf).not.toContain("VERTEX");
    expect(dxf).not.toContain("SEQEND");
    expect(dxf).toContain("  0\r\nSECTION\r\n  2\r\nTABLES");
    expect(dxf).toContain("  2\r\nVPORT");
    expect(dxf).toContain("  2\r\nLTYPE");
    expect(dxf).toContain("  2\r\nCONTINUOUS");
    expect(dxf).toContain("  2\r\nLAYER");
    expect(dxf).toContain("  2\r\n0");
    expect(dxf).toContain("  2\r\nCAD_OUTLINE");
    expect(dxf).toContain(" 62\r\n7");
    expect(dxf).toContain("  0\r\nSECTION\r\n  2\r\nENTITIES");

    const entities = dxf.split("  0\r\nLINE\r\n").slice(1);
    expect(entities.length).toBeGreaterThan(0);
    for (const entity of entities) {
      expect(entity).toMatch(/^  8\r\nCAD_OUTLINE\r\n 10\r\n-?\d+\.\d{2}\r\n 20\r\n-?\d+\.\d{2}\r\n 11\r\n-?\d+\.\d{2}\r\n 21\r\n-?\d+\.\d{2}\r\n/);
    }
    expect(dxf).toContain("\r\n 20\r\n8.00\r\n");
    expect(dxf).not.toContain(".000");

    const lines = dxf.split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.slice(0, -1)).not.toContain("");
    for (let index = 0; index < lines.length - 1; index += 2) {
      expect(lines[index]).toMatch(/^\s*\d+$/);
      expect(lines[index]).toHaveLength(3);
    }
    expect(dxf).toMatch(/\r\n  0\r\nENDSEC\r\n  0\r\nEOF\r\n$/);
  });

  it("rejects raster components whose only segment is shorter than 2.5 pixels", () => {
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
