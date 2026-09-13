import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";
import EngineeringCADViewer, {
  CAD_EDGE_THRESHOLD,
  engineeringPanelDimensions,
  engineeringViewportRects,
  solidToObjText,
} from "../components/qattan/EngineeringCADViewer";
import {
  buildEngineeringSolidPlan,
  type EngineeringGeometry,
} from "../lib/engineering-geometry";

const H_PROFILE: EngineeringGeometry = {
  label: "H-profile bracket with bottom tunnel",
  block: { width: 64, height: 50, depth: 40 },
  operations: [
    { type: "notch_top", x: 24, width: 16, height: 20 },
    { type: "tunnel_bottom", x: 24, width: 16, height: 20 },
  ],
  dimensions: [
    { label: "64", position: "bottom", view: "front" },
    { label: "50", position: "left", view: "front" },
    { label: "40", position: "bottom", view: "top" },
  ],
};

const SAMPLE_PNG = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "drawing.png", {
  type: "image/png",
});

async function uploadSampleImage() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, { target: { files: [SAMPLE_PNG] } });
  await waitFor(() => {
    expect(document.querySelector(".qattan-tool-upload-preview")).toBeInTheDocument();
  });
}

/** React logs a jsdom "not implemented" warning; keep the output readable. */
function silenceCanvasConsole() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Engineering CAD board — panel geometry", () => {
  it("lays the four views out as a 2x2 sheet (WebGL origin is bottom-left)", () => {
    const rects = engineeringViewportRects(800, 600);
    expect(rects.map((rect) => rect.view)).toEqual(["front", "side", "top", "isometric"]);
    const [front, side, top, isometric] = rects;

    // Front + side share the TOP half; top plan + isometric the bottom half.
    expect(front.y).toBe(side.y);
    expect(front.y).toBeGreaterThan(top.y);
    expect(isometric.y).toBe(top.y);
    // Left column starts at x = 0, right column shares its x.
    expect(front.x).toBe(0);
    expect(top.x).toBe(0);
    expect(side.x).toBe(isometric.x);
    expect(side.x).toBeGreaterThan(0);
    // Panels tile the canvas exactly.
    expect(front.width + side.width).toBe(800);
    expect(front.height + top.height).toBe(600);
    expect(isometric.width).toBe(400);
    expect(isometric.height).toBe(300);
  });
});

describe("Engineering CAD board — dimension chips", () => {
  it("prefers the dimensions actually read off the drawing", () => {
    const plan = buildEngineeringSolidPlan(H_PROFILE);
    expect(engineeringPanelDimensions(plan, "front")).toEqual(["64", "50"]);
    expect(engineeringPanelDimensions(plan, "top")).toEqual(["40"]);
  });

  it("falls back to the block's own extents when the drawing carried none", () => {
    const plan = { ...buildEngineeringSolidPlan({ ...H_PROFILE, dimensions: [] }), dimensions: [] };
    expect(engineeringPanelDimensions(plan, "front")).toEqual(["64 × 50"]);
    expect(engineeringPanelDimensions(plan, "side")).toEqual(["40 × 50"]);
    expect(engineeringPanelDimensions(plan, "top")).toEqual(["64 × 40"]);
    expect(engineeringPanelDimensions(plan, "isometric")).toEqual(["64 × 50 × 40"]);
  });
});

describe("Engineering CAD board — wireframe cleanliness", () => {
  it("extracts edges with a threshold that removes triangulation diagonals", () => {
    expect(CAD_EDGE_THRESHOLD).toBeGreaterThanOrEqual(15);
    expect(CAD_EDGE_THRESHOLD).toBeLessThanOrEqual(30);
    // The threshold is the one actually handed to EdgesGeometry.
    const source = readFileSync("components/qattan/EngineeringCADViewer.tsx", "utf8");
    expect(source).toContain("new THREE.EdgesGeometry(solid.geometry, CAD_EDGE_THRESHOLD)");
    expect(source).not.toMatch(/EdgesGeometry\([^)]*,\s*1[0-4]\)/);
  });
});

describe("Engineering CAD board — OBJ export", () => {
  it("serialises vertices and faces with 1-based OBJ indices", () => {
    const obj = solidToObjText([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2], "test part");
    expect(obj).toContain("o test_part");
    expect(obj.split("\n").filter((line) => line.startsWith("v "))).toHaveLength(3);
    expect(obj).toContain("f 1 2 3");
  });
});

describe("Engineering CAD viewer", () => {
  it("captions all four panels, the part meta and the CAD actions", async () => {
    const errorSpy = silenceCanvasConsole();
    render(<EngineeringCADViewer geometry={H_PROFILE} locale="en" />);

    expect(screen.getByText("FRONT ELEVATION")).toBeInTheDocument();
    expect(screen.getByText("SIDE VIEW")).toBeInTheDocument();
    expect(screen.getByText("TOP PLAN")).toBeInTheDocument();
    expect(screen.getByText("ISOMETRIC PROJECTION")).toBeInTheDocument();
    expect(screen.getByText("Drag to rotate")).toBeInTheDocument();
    expect(screen.getByText(H_PROFILE.label as string)).toBeInTheDocument();
    expect(screen.getByText(/2 cut operations/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download board PNG/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download 3D model/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reset view/i })).toBeInTheDocument();
    // Machine-readable sheet description for assistive tech.
    const canvas = document.querySelector("canvas.qattan-cad-canvas") as HTMLCanvasElement;
    expect(canvas).not.toBeNull();
    expect(canvas.getAttribute("aria-label")).toContain("front elevation");
    errorSpy.mockRestore();
  });

  it("shows Arabic captions in the Arabic locale", () => {
    const errorSpy = silenceCanvasConsole();
    render(<EngineeringCADViewer geometry={H_PROFILE} locale="ar" />);
    expect(screen.getByText("المسقط الرأسي")).toBeInTheDocument();
    expect(screen.getByText("المسقط الجانبي")).toBeInTheDocument();
    expect(screen.getByText("المسقط الأفقي")).toBeInTheDocument();
    expect(screen.getByText("المنظور ثلاثي الأبعاد")).toBeInTheDocument();
    expect(screen.getByText("اسحب للتدوير")).toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("degrades gracefully where WebGL is unavailable", async () => {
    const errorSpy = silenceCanvasConsole();
    render(<EngineeringCADViewer geometry={H_PROFILE} locale="en" />);
    await waitFor(() => {
      expect(screen.getByText(/3D preview is not supported on this device/i)).toBeInTheDocument();
    });
    // The geometry summary stays readable even without the 3D canvas.
    expect(screen.getByText(/Block: 64 × 50 × 40/)).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});

describe("Engineering workspace wiring", () => {
  it("posts ONE request to /api/engineering/analyze and renders the CAD board", async () => {
    const errorSpy = silenceCanvasConsole();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ geometry: H_PROFILE, creditsRemaining: 9 }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QattanStudio locale="en" initialMode="engineering" />);
    await uploadSampleImage();
    fireEvent.change(screen.getByLabelText("Design brief"), {
      target: { value: "Deduce the missing view from this H-profile drawing" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/engineering/analyze");
    const body = JSON.parse(String(init.body)) as { imageDataUrl: string; prompt: string };
    expect(body.imageDataUrl.startsWith("data:image/")).toBe(true);
    // The registry's engineering brief is what the analyzer reads.
    expect(body.prompt.toLowerCase()).toContain("deduce");
    expect(body.prompt).toContain("orthographic");

    // The canvas is the CAD board, not a generated image.
    await waitFor(() => {
      expect(screen.getByText("ISOMETRIC PROJECTION")).toBeInTheDocument();
    });
    expect(document.querySelector("canvas.qattan-cad-canvas")).not.toBeNull();
    // The image-presentation toggle is irrelevant for this tool.
    expect(screen.queryByRole("radio", { name: "Triptych board" })).not.toBeInTheDocument();
    errorSpy.mockRestore();
  });

  it("surfaces the server's friendly message when the drawing cannot be read", async () => {
    const errorSpy = silenceCanvasConsole();
    const message =
      "تعذّر تحليل هذا الرسم الهندسي. يرجى رفع صورة أوضح بأبعاد ظاهرة. | Could not analyze this drawing. Please upload a clearer image with visible dimensions.";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: message, creditsRemaining: 10 }), { status: 422 }),
      ),
    );

    render(<QattanStudio locale="en" initialMode="engineering" />);
    await uploadSampleImage();
    fireEvent.change(screen.getByLabelText("Design brief"), {
      target: { value: "Deduce the missing view" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("Could not analyze this drawing");
    expect(document.querySelector("canvas.qattan-cad-canvas")).toBeNull();
    errorSpy.mockRestore();
  });
});
