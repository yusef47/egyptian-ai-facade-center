import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";
import { QattanMarketingPage } from "../components/qattan/QattanMarketingPage";

const SAMPLE_PNG = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "facade.png", {
  type: "image/png",
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mobile UX — studio tool rail", () => {
  it("renders a snap-scroll pill rail with every registry tool plus the facade pill", () => {
    render(<QattanStudio locale="en" initialMode="exterior" />);
    const rail = document.querySelector(".qattan-studio-mode-rail");
    expect(rail).not.toBeNull();
    // 9 registry tools + the legacy facade triptych pill.
    expect(rail!.querySelectorAll(".qattan-studio-mode-pill").length).toBe(10);
    const selected = rail!.querySelectorAll('[aria-pressed="true"]');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain("Exterior AI");
  });

  it("switches tools from the rail with a single selected pill", () => {
    render(<QattanStudio locale="en" initialMode="exterior" />);
    const rail = document.querySelector(".qattan-studio-mode-rail") as HTMLElement;
    const pills = Array.from(rail.querySelectorAll<HTMLButtonElement>(".qattan-studio-mode-pill"));
    const interior = pills.find((pill) => pill.textContent!.includes("Interior AI"));
    expect(interior).toBeDefined();
    fireEvent.click(interior as HTMLButtonElement);
    const selected = rail.querySelectorAll('[aria-pressed="true"]');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain("Interior AI");
    expect(screen.getByLabelText(/Empty room photo or 3D layout/i)).toBeInTheDocument();
  });
});

describe("Mobile UX — sticky generate FAB", () => {
  it("is a fixed, full-width, one-thumb submit that triggers generation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "https://cdn.test/out.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [SAMPLE_PNG] } });
    await waitFor(() => {
      expect(document.querySelector(".qattan-tool-upload-preview")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Design brief/i), { target: { value: "Golden hour limestone villa" } });

    const fab = document.querySelector(".qattan-tool-fab") as HTMLElement;
    expect(fab).not.toBeNull();
    expect(fab.className).toContain("fixed");
    expect(fab.className).toContain("bottom-4");
    expect(fab.className).toContain("z-40");
    expect(fab.className).toContain("lg:hidden");

    fetchMock.mockClear();
    fireEvent.click(fab);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe("Mobile UX — touch upload + fullscreen result zoom", () => {
  it("exposes the upload zone as an accessible button target", () => {
    render(<QattanStudio locale="en" initialMode="exterior" />);
    const upload = document.querySelector(".qattan-tool-upload") as HTMLElement;
    expect(upload.getAttribute("role")).toBe("button");
    expect(upload.getAttribute("tabindex")).toBe("0");
  });

  it("opens a fullscreen zoom dialog for the generated result and closes on Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ imageDataUrl: "https://cdn.test/out.png" }), { status: 200 }),
      ),
    );

    render(<QattanStudio locale="en" initialMode="exterior" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [SAMPLE_PNG] } });
    await waitFor(() => {
      expect(document.querySelector(".qattan-tool-upload-preview")).toBeInTheDocument();
    });
    fireEvent.change(screen.getByLabelText(/Design brief/i), { target: { value: "Warm evening facade study" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => {
      expect(document.querySelector(".qattan-result-frame")).toBeInTheDocument();
    });

    fireEvent.click(document.querySelector(".qattan-result-frame") as HTMLElement);
    const zoomDialog = screen.getByRole("dialog", { name: /fullscreen view/i });
    expect(zoomDialog.querySelector("img")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /fullscreen view/i })).toBeNull();
    });
  });
});

describe("Mobile UX — touch-drag before/after slider", () => {
  it("moves the comparison handle with pointer drag anywhere on the canvas", () => {
    render(<QattanMarketingPage locale="en" />);
    const canvas = document.querySelector(".qattan-comparison-touch") as HTMLElement;
    expect(canvas).not.toBeNull();

    const spy = vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      x: 0,
      y: 0,
      right: 200,
      bottom: 100,
      toJSON: () => ({}),
    } as DOMRect);

    // jsdom has no PointerEvent constructor, so pointer events dispatched via
    // fireEvent lose their coordinates. Dispatching MouseEvents typed as
    // pointer events carries clientX through React's synthetic system.
    const handle = canvas.querySelector(".qattan-comparison-handle") as HTMLElement;
    fireEvent(canvas, new MouseEvent("pointerdown", { bubbles: true, clientX: 50 }));
    expect(handle.style.left).toBe("25%");
    fireEvent(canvas, new MouseEvent("pointermove", { bubbles: true, clientX: 150 }));
    expect(handle.style.left).toBe("75%");
    fireEvent(canvas, new MouseEvent("pointerup", { bubbles: true }));

    spy.mockRestore();
  });
});
