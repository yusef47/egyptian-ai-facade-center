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

    expect(dxf).toContain("0\nSECTION\n2\nHEADER");
    expect(dxf).toContain("$ACADVER\n1\nAC1032");
    expect(dxf).toContain("0\nSECTION\n2\nENTITIES");
    expect(dxf).toContain("0\nLWPOLYLINE");
    expect(dxf).toContain("70\n1");
    expect(dxf).toContain("0\nENDSEC\n0\nEOF");
    expect((dxf.match(/\n10\n/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("rejects invalid or empty raster sources", () => {
    expect(() => buildDxfFromRaster({ width: 0, height: 4, data: new Uint8ClampedArray() })).toThrow(/raster/i);
    expect(() => buildDxfFromRaster({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) })).toThrow(/dark|contour/i);
  });
});
