import { afterEach, describe, expect, it, vi } from "vitest";
import {
  QUADRANT_GRID,
  QUADRANTS,
  cropImageToQuadrant,
  zipTextFiles,
} from "../client/src/lib/cadExport";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QUADRANTS", () => {
  it("exposes the four ordered quadrant ids and their 2x2 grid positions", () => {
    expect(QUADRANTS).toEqual(["plan", "elevation", "section", "perspective"]);
    expect(QUADRANT_GRID.plan).toEqual({ col: 0, row: 0 });
    expect(QUADRANT_GRID.elevation).toEqual({ col: 1, row: 0 });
    expect(QUADRANT_GRID.section).toEqual({ col: 0, row: 1 });
    expect(QUADRANT_GRID.perspective).toEqual({ col: 1, row: 1 });
  });
});

describe("cropImageToQuadrant", () => {
  function mockCanvas(drawImage: ReturnType<typeof vi.fn>) {
    const imageData = { data: new Uint8ClampedArray([129, 129, 129, 255, 130, 130, 130, 255]) };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({
        drawImage,
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        getImageData: vi.fn(() => imageData),
        putImageData: vi.fn(),
      })),
      toDataURL: vi.fn((_type?: string) => "data:image/png;base64,CROP"),
    };
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag === "canvas") return canvas as unknown as HTMLCanvasElement;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    }) as typeof document.createElement);
    return canvas;
  }

  function stubImage(width: number, height: number) {
    class FakeImage {
      naturalWidth = width;
      naturalHeight = height;
      width = width;
      height = height;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);
  }

  it("crops the bottom-right perspective quadrant from the cached image", async () => {
    const drawImage = vi.fn();
    const canvas = mockCanvas(drawImage);
    stubImage(400, 200);

    const url = await cropImageToQuadrant("data:image/png;base64,X", "perspective");

    expect(url).toBe("data:image/png;base64,CROP");
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);
    expect(drawImage).toHaveBeenCalledTimes(1);
    const args = drawImage.mock.calls[0] as unknown[];
    // drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh)
    expect(args.slice(1)).toEqual([200, 100, 200, 100, 0, 0, 800, 400]);
    const context = canvas.getContext.mock.results[0]?.value as { imageSmoothingEnabled: boolean; imageSmoothingQuality: string };
    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe("high");
  });

  it("crops the top-left plan quadrant", async () => {
    const drawImage = vi.fn();
    mockCanvas(drawImage);
    stubImage(400, 200);

    await cropImageToQuadrant("data:image/png;base64,X", "plan");
    const args = drawImage.mock.calls[0] as unknown[];
    expect(args.slice(1, 5)).toEqual([0, 0, 200, 100]);
    expect(args.slice(5)).toEqual([0, 0, 800, 400]);
  });
});

describe("zipTextFiles", () => {
  it("bundles DXF files into a ZIP blob", async () => {
    const blob = await zipTextFiles([
      { name: "plan.dxf", content: "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n" },
      { name: "elevation.dxf", content: "elevation" },
    ]);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/zip");
    expect(blob.size).toBeGreaterThan(0);
  });
});
