import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CadVectorizerSection from "../client/src/components/CadVectorizerSection";
import { I18nProvider } from "../client/src/lib/i18n";

const { rasterizeImageToDxf, cropImageToQuadrant, zipTextFiles, withTimeout } = vi.hoisted(() => ({
  rasterizeImageToDxf: vi.fn(),
  cropImageToQuadrant: vi.fn(),
  zipTextFiles: vi.fn(),
  withTimeout: vi.fn(),
}));
vi.mock("../client/src/lib/dxf", () => ({
  rasterizeImageToDxf,
}));
vi.mock("../client/src/lib/cadExport", () => ({
  QUADRANTS: ["plan", "elevation", "section", "perspective"],
  QUADRANT_FILE_NAMES: {
    plan: "plan.dxf",
    elevation: "elevation.dxf",
    section: "section.dxf",
    perspective: "perspective.dxf",
  },
  cropImageToQuadrant,
  zipTextFiles,
  withTimeout,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  rasterizeImageToDxf.mockReset();
  cropImageToQuadrant.mockReset();
  zipTextFiles.mockReset();
  withTimeout.mockReset();
});

function renderCad() {
  return render(
    <I18nProvider>
      <CadVectorizerSection />
    </I18nProvider>,
  );
}

function stubSuccessfulGeneration() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imageDataUrl: "data:image/png;base64,Q0FE" }),
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("CadVectorizerSection", () => {
  it("uploads a plan and requests the single-call 2x2 quadrant generation", async () => {
    const fetchMock = stubSuccessfulGeneration();
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    const user = userEvent.setup();

    renderCad();
    const file = new File(["fake-plan"], "floor-plan.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Floor plan image/i), file);
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/restore");
    const body = JSON.parse(String(init.body)) as { mode: string; prompt: string; imageDataUrl: string };
    expect(body.mode).toBe("cad");
    expect(body.prompt).toMatch(/2x2 grid/i);
    expect(body.prompt).toMatch(/PLAN, ELEVATION, SECTION, PERSPECTIVE/i);
    expect(body.imageDataUrl).toMatch(/^data:/);
    expect(screen.getByAltText("Generated 4 architectural views")).toBeInTheDocument();
  });

  it("crops one quadrant and downloads its DXF without refetching the API", async () => {
    const fetchMock = stubSuccessfulGeneration();
    rasterizeImageToDxf.mockResolvedValue("  0\nSECTION\n  2\nENTITIES\n  0\nENDSEC\n  0\nEOF\n");
    cropImageToQuadrant.mockResolvedValue("data:image/png;base64,CROPPED_PLAN");
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));
    await screen.findByAltText("Generated 4 architectural views");
    await user.click(screen.getByRole("button", { name: /Download Plan DXF/i }));

    await waitFor(() => expect(cropImageToQuadrant).toHaveBeenCalledWith("data:image/png;base64,Q0FE", "plan"));
    await waitFor(() => expect(rasterizeImageToDxf).toHaveBeenCalledWith("data:image/png;base64,CROPPED_PLAN"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
  });

  it("downloads all four quadrants as a single ZIP sequentially", async () => {
    const fetchMock = stubSuccessfulGeneration();
    cropImageToQuadrant.mockImplementation(async (_url: string, quadrant: string) => `data:image/png;base64,${quadrant}`);
    rasterizeImageToDxf.mockImplementation(async (url: string) => `DXF:${url}`);
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    zipTextFiles.mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));
    await screen.findByAltText("Generated 4 architectural views");
    await user.click(screen.getByText("Download All (ZIP)"));

    await waitFor(() => expect(zipTextFiles).toHaveBeenCalledTimes(1));
    expect(cropImageToQuadrant).toHaveBeenCalledTimes(4);
    const files = zipTextFiles.mock.calls[0][0] as { name: string; content: string }[];
    expect(files.map((file) => file.name)).toEqual(["plan.dxf", "elevation.dxf", "section.dxf", "perspective.dxf"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
  });

  it("skips a failed quadrant and still creates a ZIP from successful quadrants", async () => {
    const fetchMock = stubSuccessfulGeneration();
    cropImageToQuadrant.mockImplementation(async (_url: string, quadrant: string) => `data:image/png;base64,${quadrant}`);
    rasterizeImageToDxf
      .mockResolvedValueOnce("DXF:plan")
      .mockRejectedValueOnce(new Error("elevation failed"))
      .mockResolvedValueOnce("DXF:section")
      .mockResolvedValueOnce("DXF:perspective");
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    zipTextFiles.mockResolvedValue(new Blob(["zip"], { type: "application/zip" }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));
    await screen.findByAltText("Generated 4 architectural views");
    await user.click(screen.getByText("Download All (ZIP)"));

    await waitFor(() => expect(zipTextFiles).toHaveBeenCalledTimes(1));
    const files = zipTextFiles.mock.calls[0][0] as { name: string; content: string }[];
    expect(files.map((file) => file.name)).toEqual(["plan.dxf", "section.dxf", "perspective.dxf"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent(/Some quadrants (could not be vectorized|timed out)/i);
  });

  it("keeps individual downloads available after a ZIP failure", async () => {
    const fetchMock = stubSuccessfulGeneration();
    cropImageToQuadrant.mockResolvedValue("data:image/png;base64,CROPPED");
    rasterizeImageToDxf.mockRejectedValue(new Error("trace failed"));
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));
    await screen.findByAltText("Generated 4 architectural views");
    await user.click(screen.getByText("Download All (ZIP)"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /Download Plan DXF/i })).not.toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a translated inline error when generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "CAD service unavailable" }),
    }));
    withTimeout.mockImplementation(async (promise: Promise<unknown>) => promise);
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Generate 4 Architectural Views/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("CAD service unavailable"));
  });
});
