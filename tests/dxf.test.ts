import { describe, expect, it } from "vitest";
import { buildDxfFromRaster } from "../client/src/lib/dxf";

describe("DXF raster vectorization", () => {
  it("writes an AutoCAD-readable ASCII DXF with editable polylines", () => {
    const width = 7;
    const height = 7;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 2; y <= 4; y += 1) {
      for (let x = 2; x <= 4; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = 255;
      }
    }

    const dxf = buildDxfFromRaster({ width, height, data });

    expect(dxf).toContain("0\r\nSECTION\r\n2\r\nHEADER");
    expect(dxf).toContain("$ACADVER\r\n1\r\nAC1009");
    expect(dxf).not.toContain("AC1015");
    expect(dxf).not.toContain("LWPOLYLINE");
    expect(dxf).not.toContain("AcDbPolyline");
    expect(dxf).not.toContain("AcDbEntity");
    expect(dxf).toContain("0\r\nSECTION\r\n2\r\nTABLES");
    expect(dxf).toContain("2\r\nVPORT");
    expect(dxf).toContain("2\r\nLTYPE");
    expect(dxf).toContain("2\r\nCONTINUOUS");
    expect(dxf).toContain("2\r\nLAYER");
    expect(dxf).toContain("2\r\n0");
    expect(dxf).toContain("2\r\nCAD_OUTLINE");
    expect(dxf).toContain("62\r\n7");
    expect(dxf).toContain("0\r\nSECTION\r\n2\r\nENTITIES");
    expect(dxf).toContain("0\r\nPOLYLINE\r\n8\r\nCAD_OUTLINE\r\n66\r\n1\r\n10\r\n0.00\r\n20\r\n0.00\r\n30\r\n0.00\r\n70\r\n1\r\n");
    expect(dxf).toContain("0\r\nVERTEX\r\n8\r\nCAD_OUTLINE\r\n");
    expect(dxf).toContain("0\r\nSEQEND\r\n8\r\nCAD_OUTLINE\r\n");
    expect(dxf).toContain("\r\n20\r\n5.00\r\n");
    expect(dxf).not.toContain("5.000");

    const lines = dxf.split("\r\n");
    expect(lines.at(-1)).toBe("");
    expect(lines.slice(0, -1)).not.toContain("");
    for (let index = 0; index < lines.length - 1; index += 2) {
      expect(lines[index]).toMatch(/^\d+$/);
    }
    expect(dxf).toMatch(/\r\n0\r\nENDSEC\r\n0\r\nEOF\r\n$/);
  });

  it("rejects invalid or empty raster sources", () => {
    expect(() => buildDxfFromRaster({ width: 0, height: 4, data: new Uint8ClampedArray() })).toThrow(/raster/i);
    expect(() => buildDxfFromRaster({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) })).toThrow(/dark|contour/i);
  });
});
