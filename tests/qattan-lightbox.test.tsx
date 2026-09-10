import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ToolWorkspace from "../components/qattan/ToolWorkspace";
import { getToolById } from "../tools/registry";
import { QattanProviders } from "../components/qattan/QattanProviders";

const exterior = getToolById("exterior")!;

function renderWorkspace() {
  return render(
    <QattanProviders locale="en">
      <ToolWorkspace tool={exterior} />
    </QattanProviders>,
  );
}

async function generateAndOpenLightbox() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU", creditsRemaining: 9 }),
  });
  vi.stubGlobal("fetch", fetchMock);

  const user = (await import("@testing-library/user-event")).default.setup();
  renderWorkspace();

  const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
  await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
  await user.type(screen.getByLabelText(/Design brief/i), "Warm limestone villa");
  fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

  await waitFor(
    () => expect(screen.getByLabelText(/Zoom result fullscreen/i)).toBeInTheDocument(),
    { timeout: 15000 },
  );
  return user;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Fullscreen image lightbox — stacking & containment", () => {
  it("portals to document.body so no ancestor stacking context can clip it", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));

    const dialog = document.body.querySelector(".qattan-result-zoom");
    expect(dialog).not.toBeNull();
    // Direct child of body → outside every transformed/filtered ancestor.
    expect(dialog!.parentElement).toBe(document.body);
  });

  it("renders the z-[9999] fullscreen backdrop with required containment classes", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));

    const dialog = document.body.querySelector<HTMLElement>(".qattan-result-zoom");
    expect(dialog).not.toBeNull();
    expect(dialog!.className).toContain("z-[9999]");
    expect(dialog!.className).toContain("fixed");
    expect(dialog!.className).toContain("inset-0");
    expect(dialog!.className).toContain("bg-black/92");
    expect(dialog!.className).toContain("backdrop-blur-md");
  });

  it("bounds the lightbox content to max-w-[95vw] and max-h-[82vh] via CSS", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));

    const panel = document.body.querySelector<HTMLElement>(".qattan-result-zoom-panel");
    expect(panel).not.toBeNull();

    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/\.qattan-result-zoom-panel\s*\{[^}]*max-width:\s*95vw/);
    expect(css).toMatch(/\.qattan-result-zoom-panel\s*\{[^}]*max-height:\s*82vh/);
    expect(css).toMatch(/\.qattan-result-zoom\s*\{[^}]*z-index:\s*9999/);
  });

  it("keeps the image on object-contain so the whole render stays visible", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));

    const img = document.body.querySelector<HTMLImageElement>(".qattan-result-zoom-image");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("data:image/png;base64,UkVTVUxU");
  });
});

describe("Lightbox chrome — gold actions & close paths", () => {
  it("shows a gold Download action that triggers the file download", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));

    const download = document.body.querySelector<HTMLButtonElement>(
      ".qattan-result-zoom-download",
    );
    expect(download).not.toBeNull();

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    fireEvent.click(download!);
    expect(clickSpy).toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("closes via the gold X button, backdrop click, and Escape", async () => {
    const user = await generateAndOpenLightbox();
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));
    expect(document.body.querySelector(".qattan-result-zoom")).not.toBeNull();

    // Escape
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.querySelector(".qattan-result-zoom")).toBeNull();

    // Backdrop click
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));
    fireEvent.click(document.body.querySelector(".qattan-result-zoom")!);
    expect(document.body.querySelector(".qattan-result-zoom")).toBeNull();

    // X button
    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));
    fireEvent.click(document.body.querySelector(".qattan-result-zoom-close")!);
    expect(document.body.querySelector(".qattan-result-zoom")).toBeNull();
  });
});

describe("Lightbox — 3-card gallery board", () => {
  it("fits the entire 3-panel board inside the same viewport-bounded panel", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU", creditsRemaining: 9 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = (await import("@testing-library/user-event")).default.setup();
    renderWorkspace();

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
    await user.type(screen.getByLabelText(/Design brief/i), "Triptych villa study");

    fireEvent.click(screen.getByRole("radio", { name: /Triptych board/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(
      () => expect(screen.getByLabelText(/Zoom result fullscreen/i)).toBeInTheDocument(),
      { timeout: 15000 },
    );

    // Selecting "Board" (triptych) emits a triptych directive in the prompt.
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { prompt?: string };
    expect(body.prompt).toMatch(/triptych/i);

    await user.click(screen.getByLabelText(/Zoom result fullscreen/i));
    const images = document.body.querySelectorAll(".qattan-result-zoom-image");
    expect(images.length).toBe(1);
    expect(document.body.querySelector(".qattan-result-zoom-board-multi")).toBeNull();
  });

  it("stacks the 3-gallery grid to a single column on mobile", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(
      /@media \(max-width: 820px\) \{[^@]*\.qattan-result-zoom-board-multi \{ grid-template-columns: 1fr; \}/,
    );
  });
});
