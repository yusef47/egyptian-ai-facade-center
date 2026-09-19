import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  INTRO_PLAY_EVENT,
  INTRO_SEEN_KEY,
  shouldAutoPlayIntro,
} from "../components/qattan/IntroVideoModal";
import IntroVideoModal from "../components/qattan/IntroVideoModal";
import { QattanProviders } from "../components/qattan/QattanProviders";
import { QattanMarketingPage } from "../components/qattan/QattanMarketingPage";
import { TOOL_PREVIEWS } from "../components/qattan/ToolShowcase";
import type { ToolId } from "@tools/registry";

afterEach(() => {
  window.localStorage.clear();
});

describe("Intro promo video modal", () => {
  it("auto-plays only for first-time visitors (seen flag contract)", () => {
    expect(shouldAutoPlayIntro({ getItem: () => null })).toBe(true);
    expect(shouldAutoPlayIntro({ getItem: () => "1" })).toBe(false);
    // Corrupted storage (throws) — treat as first visit, never crash.
    expect(
      shouldAutoPlayIntro({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBe(true);
  });

  it("plays the promo with a gold skip button that persists the seen flag", async () => {
    render(
      <QattanProviders locale="en">
        <IntroVideoModal />
      </QattanProviders>,
    );

    // Test env suppresses auto-open; the hero replay event opens it.
    fireEvent(window, new Event(INTRO_PLAY_EVENT));
    const dialog = await screen.findByRole("dialog", { name: /introduction video/i });
    const video = dialog.querySelector("video.qattan-intro-video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/intro.mp4");
    expect(video).toHaveAttribute("autoplay");
    // React applies `muted` as a DOM property rather than a serialized attribute.
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).toHaveAttribute("loop");

    const skip = within(dialog).getByRole("button", { name: /skip video/i });
    fireEvent.click(skip);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
    expect(window.localStorage.getItem(INTRO_SEEN_KEY)).toBe("1");
  });

  it("renders the Arabic skip label in Arabic locale", async () => {
    render(
      <QattanProviders locale="ar">
        <IntroVideoModal />
      </QattanProviders>,
    );
    fireEvent(window, new Event(INTRO_PLAY_EVENT));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "تخطي الفيديو" })).toBeInTheDocument();
  });
});

describe("High-end comparison slider pairs", () => {
  it("uses the derived 1-to-1 luxury pairs in both proof cards", () => {
    render(<QattanMarketingPage locale="en" />);
    expect(document.querySelector('img[src="/proof-exterior-before.jpg"]')).not.toBeNull();
    expect(document.querySelector('img[src="/hero-night-pool.jpg"]')).not.toBeNull();
    expect(document.querySelector('img[src="/proof-interior-before.jpg"]')).not.toBeNull();
    expect(document.querySelector('img[src="/poster-interior.jpg"]')).not.toBeNull();
  });
});

describe("Distinct per-tool preview showcases", () => {
  const TOOL_IDS: ToolId[] = [
    "exterior",
    "interior",
    "sketch",
    "masterplan",
    "landscape",
    "staging",
    "enhancer",
    "floorplan",
  ];

  it("gives every one of the 8 tools a showcase entry", () => {
    for (const id of TOOL_IDS) {
      const preview = TOOL_PREVIEWS[id];
      expect(preview, `missing showcase for ${id}`).toBeTruthy();
      expect(preview.poster).toMatch(/^\/.+\.jpg$/);
    }
  });

  it("gives 7 tools a video clip and every tool a distinct before treatment", () => {
    const befores = new Set<string>();
    let videoCount = 0;
    for (const id of TOOL_IDS) {
      const preview = TOOL_PREVIEWS[id];
      if (preview.video) videoCount += 1;
      expect(preview.before, `no before treatment for ${id}`).toMatch(/^\/.+\.jpg$/);
      befores.add(preview.before);
    }
    // Floorplan uses an image-pair showcase (CAD sheet) instead of video.
    expect(videoCount).toBe(7);
    expect(TOOL_PREVIEWS.floorplan.video).toBe("");
    expect(TOOL_PREVIEWS.floorplan.after).toBe("/preview-floorplan-after.jpg");
    // All 8 before treatments are distinct — no shared generic sketch.
    expect(befores.size).toBe(8);
  });
});
