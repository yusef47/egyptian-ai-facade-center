import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";
import { QattanProviders } from "../components/qattan/QattanProviders";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Mobile studio — auto-scroll on tool selection", () => {
  it("smooth-scrolls to top when a tool is tapped in the mobile rail", () => {
    const scrollMock = vi.fn();
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(scrollMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    const rail = document.querySelector(".qattan-studio-mode-rail") as HTMLElement;
    const pills = Array.from(rail.querySelectorAll<HTMLButtonElement>(".qattan-studio-mode-pill"));
    const interior = pills.find((pill) => pill.textContent!.includes("Interior AI"));

    fireEvent.click(interior as HTMLButtonElement);

    expect(scrollMock).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
    matchMediaSpy.mockRestore();
    scrollSpy.mockRestore();
  });

  it("does not scroll when selecting on a desktop viewport", () => {
    const scrollMock = vi.fn();
    const matchMediaSpy = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    const scrollSpy = vi.spyOn(window, "scrollTo").mockImplementation(scrollMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    const rail = document.querySelector(".qattan-studio-mode-rail") as HTMLElement;
    const pills = Array.from(rail.querySelectorAll<HTMLButtonElement>(".qattan-studio-mode-pill"));
    fireEvent.click(pills[1]);

    expect(scrollMock).not.toHaveBeenCalled();
    matchMediaSpy.mockRestore();
    scrollSpy.mockRestore();
  });
});;

describe("Light mode — studio surfaces render crisp white", () => {
  it("defines white overrides for every major studio surface", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const surfaces = [
      ".qattan-studio-intro",
      ".qattan-studio-shell",
      ".qattan-studio-rail",
      ".qattan-studio-viewport",
      ".qattan-tool-panel",
      ".qattan-tool-canvas",
      ".qattan-tool-upload",
      ".qattan-tool-select",
      ".qattan-tool-textarea",
      ".qattan-history-item",
      ".qattan-guide",
      ".qattan-output-toggle",
    ];
    for (const surface of surfaces) {
      const pattern = new RegExp(
        `html\\[data-qattan-theme="light"\\][^\\n]*${surface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      );
      expect(css, `no light-mode override for ${surface}`).toMatch(pattern);
    }
    // The light theme must not reuse the obsidian shell color anywhere.
    expect(css).not.toMatch(/light"\] \.qattan-studio-shell[^}]*#090a0f/);
  });

  it("styles the mobile bottom tab bar with a light-theme variant", () => {
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toMatch(/max-width: 820px[\s\S]*\.qattan-studio-layout > \.qattan-studio-control-rail[\s\S]*position: fixed/);
    expect(css).toMatch(/html\[data-qattan-theme="light"\] \.qattan-studio-layout > \.qattan-studio-control-rail/);
  });
});

describe("Mobile studio — bottom tab bar structure", () => {
  it("keeps a single selected tab and crisp icon+label pills", () => {
    render(
      <QattanProviders locale="en">
        <QattanStudio locale="en" initialMode="floorplan" />
      </QattanProviders>,
    );
    const rail = document.querySelector(".qattan-studio-mode-rail") as HTMLElement;
    const selected = rail.querySelectorAll('[aria-pressed="true"]');
    expect(selected.length).toBe(1);
    expect(selected[0].textContent).toContain("Floor Plan to CAD");
    // Every tab carries an icon + a visible text label (native-app pattern).
    for (const pill of rail.querySelectorAll(".qattan-studio-mode-pill")) {
      expect(pill.querySelector("svg")).not.toBeNull();
      expect((pill.querySelector(".qattan-studio-mode-title") as HTMLElement).textContent!.length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText(/Floor plan image/i)).toBeInTheDocument();
  });
});
