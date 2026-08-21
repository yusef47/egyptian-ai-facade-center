import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CadVectorizerSection from "../client/src/components/CadVectorizerSection";
import { I18nProvider } from "../client/src/lib/i18n";

const { rasterizeImageToDxf } = vi.hoisted(() => ({ rasterizeImageToDxf: vi.fn() }));
vi.mock("../client/src/lib/dxf", () => ({
  rasterizeImageToDxf,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  rasterizeImageToDxf.mockReset();
});

function renderCad() {
  return render(
    <I18nProvider>
      <CadVectorizerSection />
    </I18nProvider>,
  );
}

describe("CadVectorizerSection", () => {
  it("uploads a plan, requests B&W CAD line art, and renders the result", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,Q0FE" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    renderCad();
    const file = new File(["fake-plan"], "floor-plan.png", { type: "image/png" });
    await user.upload(screen.getByLabelText(/Floor plan image/i), file);
    await user.click(screen.getByRole("button", { name: /Convert to B&W CAD LineArt/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/restore");
    const body = JSON.parse(String(init.body)) as { mode: string; prompt: string; imageDataUrl: string };
    expect(body.mode).toBe("cad");
    expect(body.prompt).toMatch(/high-contrast 2D black and white clean CAD drafting style drawing/i);
    expect(body.imageDataUrl).toMatch(/^data:/);
    expect(screen.getByAltText("Generated B&W CAD line art")).toBeInTheDocument();
  });

  it("downloads a real DXF file after the CAD image is generated", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,Q0FE" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    rasterizeImageToDxf.mockResolvedValue("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Convert to B&W CAD LineArt/i }));
    await screen.findByAltText("Generated B&W CAD line art");
    await user.click(screen.getByRole("button", { name: /Download AutoCAD File/i }));

    await waitFor(() => expect(rasterizeImageToDxf).toHaveBeenCalledWith("data:image/png;base64,Q0FE"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalled();
  });

  it("shows a translated inline error when generation fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: "CAD service unavailable" }),
    }));
    const user = userEvent.setup();

    renderCad();
    await user.upload(
      screen.getByLabelText(/Floor plan image/i),
      new File(["fake-plan"], "floor-plan.png", { type: "image/png" }),
    );
    await user.click(screen.getByRole("button", { name: /Convert to B&W CAD LineArt/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("CAD service unavailable"));
  });
});
