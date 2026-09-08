import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Qattan unified eight-tool studio", () => {
  it("lists all eight tools as live engines", () => {
    render(<QattanStudio locale="en" initialMode="exterior" />);

    for (const name of [
      /Exterior AI/i,
      /Interior AI/i,
      /Sketch to Image/i,
      /Masterplan AI/i,
      /Landscape AI/i,
      /Virtual Staging/i,
      /Render Enhancer/i,
      /Floor Plan to CAD/i,
    ]) {
      const buttons = screen.getAllByRole("button", { name });
      expect(buttons.length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText(/Live engine/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Planned mode/i)).not.toBeInTheDocument();
  });

  it("renders the exterior workspace with its controls and sends toolId:exterior", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = (await import("@testing-library/user-event")).default.setup();
    render(<QattanStudio locale="en" initialMode="exterior" />);

    expect(screen.getByLabelText(/Facade photo or 3D screenshot/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Style preset/i)).toBeInTheDocument();

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
    await user.type(screen.getByLabelText(/Design brief/i), "Warm limestone villa");
    await user.click(screen.getByRole("button", { name: /Generate/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled(), { timeout: 15000 });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { toolId?: string };
    expect(body.toolId).toBe("exterior");
  });

  it("keeps the floorplan CAD workspace functional inside the registry", () => {
    render(<QattanStudio locale="en" initialMode="floorplan" />);

    expect(screen.getByLabelText(/Floor plan image/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Generate 4 Architectural Views/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download All \(ZIP\)/i })).toBeInTheDocument();
  });

  it("switches from exterior to interior without a page reload", () => {
    render(<QattanStudio locale="en" initialMode="exterior" />);

    fireEvent.click(screen.getAllByRole("button", { name: /Interior AI/i })[0]);

    expect(screen.getByLabelText(/Empty room photo or 3D layout/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Room type/i)).toBeInTheDocument();
  });
});
