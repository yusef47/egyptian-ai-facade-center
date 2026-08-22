import { afterEach, describe, expect, it, vi } from "vitest";
import { rasterizeImageToDxf } from "../client/src/lib/dxf";

const { loadFromCanvas } = vi.hoisted(() => ({
  loadFromCanvas: vi.fn(),
}));

vi.mock("potrace-wasm", () => ({ loadFromCanvas }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  loadFromCanvas.mockReset();
});

describe("Potrace raster pipeline", () => {
  it("thresholds 129 to black and 130 to white before tracing", async () => {
    loadFromCanvas.mockResolvedValue('<svg viewBox="0 0 10 10"><path d="M 0 0 L 10 0 L 10 10 L 0 10 Z"/></svg>');

    const sourceData = new Uint8ClampedArray([
      129, 129, 129, 255,
      130, 130, 130, 255,
    ]);
    const binaryData = new Uint8ClampedArray(8);
    const sourceContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: sourceData })),
    };
    const binaryContext = {
      createImageData: vi.fn(() => ({ data: binaryData })),
      putImageData: vi.fn(),
    };
    const canvases = [
      { width: 0, height: 0, getContext: vi.fn(() => sourceContext) },
      { width: 0, height: 0, getContext: vi.fn(() => binaryContext) },
    ];
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") return canvases.shift() as unknown as HTMLCanvasElement;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    }) as typeof document.createElement);

    class FakeImage {
      naturalWidth = 2;
      naturalHeight = 1;
      width = 2;
      height = 1;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", FakeImage);

    await rasterizeImageToDxf("data:image/png;base64,CAD");

    expect(loadFromCanvas).toHaveBeenCalledTimes(1);
    expect(binaryContext.putImageData).toHaveBeenCalledTimes(1);
    expect(Array.from(binaryData)).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(canvases).toHaveLength(0);
    const tracedCanvas = loadFromCanvas.mock.calls[0]?.[0] as HTMLCanvasElement;
    expect(tracedCanvas.width).toBe(2);
    expect(tracedCanvas.height).toBe(1);
  });

  it("rejects Potrace failures instead of falling back to raster chords", async () => {
    loadFromCanvas.mockRejectedValue(new Error("WASM trace failed"));
    const image = {
      naturalWidth: 1,
      naturalHeight: 1,
      width: 1,
      height: 1,
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      },
    };
    const context = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 255]) })),
    };
    const binaryContext = {
      createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
      putImageData: vi.fn(),
    };
    const canvases = [
      { width: 0, height: 0, getContext: vi.fn(() => context) },
      { width: 0, height: 0, getContext: vi.fn(() => binaryContext) },
    ];
    vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
      if (tagName === "canvas") return canvases.shift() as unknown as HTMLCanvasElement;
      return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
    }) as typeof document.createElement);
    vi.stubGlobal("Image", function Image() { return image; });

    await expect(rasterizeImageToDxf("data:image/png;base64,CAD")).rejects.toThrow("WASM trace failed");
  });
});
