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
    expect(dxf).toContain("$ACADVER\n1\nAC1015");
    expect(dxf).not.toContain("AC1032");
    expect(dxf).toContain("0\nSECTION\n2\nTABLES");
    expect(dxf).toContain("2\nVPORT");
    expect(dxf).toContain("2\nLTYPE");
    expect(dxf).toContain("2\nCONTINUOUS");
    expect(dxf).toContain("2\nLAYER");
    expect(dxf).toContain("2\n0");
    expect(dxf).toContain("2\nCAD_OUTLINE");
    expect(dxf).toContain("62\n7");
    expect(dxf).toContain("0\nSECTION\n2\nBLOCKS");
    expect(dxf).toContain("0\nSECTION\n2\nENTITIES");
    expect(dxf).toContain("0\nLWPOLYLINE");
    expect(dxf).not.toContain("CAD-FLOOR-PLAN");
    const entities = dxf.split("0\nLWPOLYLINE\n").slice(1);
    expect(entities.length).toBeGreaterThan(0);
    for (let index = 0; index < entities.length; index += 1) {
      const entity = entities[index];
      expect(entity).toMatch(/^5\n[0-9A-F]+\n100\nAcDbEntity\n8\nCAD_OUTLINE\n100\nAcDbPolyline\n90\n\d+\n70\n[01]\n/);
      expect(entity).toContain(`5\n${(0x100 + index).toString(16).toUpperCase()}\n`);
    }
    expect(dxf).toContain("70\n1");
    expect(dxf).toContain("\n20\n5.000\n");
    expect(dxf).toMatch(/\n0\nENDSEC\n0\nEOF\n$/);
    expect((dxf.match(/\n10\n/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("rejects invalid or empty raster sources", () => {
    expect(() => buildDxfFromRaster({ width: 0, height: 4, data: new Uint8ClampedArray() })).toThrow(/raster/i);
    expect(() => buildDxfFromRaster({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) })).toThrow(/dark|contour/i);
  });
});
