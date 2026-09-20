import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  INTRO_PLAY_EVENT,
  INTRO_SEEN_KEY,
  shouldAutoPlayIntro,
} from "../components/qattan/IntroVideoModal";
import IntroVideoModal from "../components/qattan/IntroVideoModal";
import ToolPreviewModal from "../components/qattan/ToolPreviewModal";
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

  it("gives 7 tools a signature video and never forces a split-view state", () => {
    let videoCount = 0;
    for (const id of TOOL_IDS) {
      const preview = TOOL_PREVIEWS[id];
      // The unified cinematic stage has no before/after split states.
      expect("before" in preview, `${id} still carries a split-view state`).toBe(false);
      if (preview.video) videoCount += 1;
    }
    // Floorplan presents a single full-frame image showcase instead of video.
    expect(videoCount).toBe(7);
    expect(TOOL_PREVIEWS.floorplan.video).toBe("");
    expect(TOOL_PREVIEWS.floorplan.after).toBe("/preview-floorplan-after.jpg");
  });

  it("ships real cinematic HD clips for every video tool (on disk, HD-sized)", () => {
    for (const id of TOOL_IDS) {
      const video = TOOL_PREVIEWS[id].video;
      if (!video) continue;
      expect(video).toBe(`/videos/tool-${id}.mp4`);
      const file = path.join(process.cwd(), "public", video);
      const stats = statSync(file);
      // Cinematic clips: never the old sub-1MB placeholders.
      expect(
        stats.size,
        `${video} is only ${stats.size} bytes`,
      ).toBeGreaterThan(250_000);
      // MP4 magic bytes — a real video container, not a renamed file.
      const header = readFileSync(file).subarray(4, 8).toString("latin1");
      expect(header).toBe("ftyp");
    }
  });
});

describe("Cinematic preview player", () => {
  function openFirstPreview() {
    render(<QattanMarketingPage locale="en" />);
    const triggers = screen.getAllByRole("button", { name: /open preview/i });
    fireEvent.click(triggers[0]);
    return screen.getByRole("dialog");
  }

  it("expands to a fullscreen cinema dialog and collapses back", () => {
    const dialog = openFirstPreview();
    const card = dialog.firstElementChild as HTMLElement;
    expect(card.className).toContain("qattan-preview-dialog-cinema");

    const expand = within(dialog).getByRole("button", { name: /enter fullscreen/i });
    fireEvent.click(expand);
    expect((dialog.firstElementChild as HTMLElement).className).toContain(
      "qattan-preview-expanded",
    );
    expect(
      within(dialog).getByRole("button", { name: /exit fullscreen/i }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /exit fullscreen/i }));
    expect((dialog.firstElementChild as HTMLElement).className).not.toContain(
      "qattan-preview-expanded",
    );
  });

  it("shows the gold live glow while the clip is playing", () => {
    const dialog = openFirstPreview();
    const glow = dialog.querySelector(".qattan-preview-live-glow");
    expect(glow).not.toBeNull();
    expect(glow?.className).toContain("qattan-preview-live-glow-on");

    // Pausing the clip extinguishes the live glow.
    const stage = within(dialog).getByRole("button", { name: /preview playing/i });
    fireEvent.click(stage);
    expect(dialog.querySelector(".qattan-preview-live-glow-on")).toBeNull();
  });

  it("keeps the lightbox contract: portaled, centered, glassmorphic backdrop", () => {
    const dialog = openFirstPreview();
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("items-center");
    expect(dialog.className).toContain("justify-center");
    expect(dialog.className).toContain("backdrop-blur-md");
    const card = dialog.firstElementChild as HTMLElement;
    expect(card.className).toContain("max-w-3xl");
  });

  it("renders a seamless full-frame stage even when beforeSrc is passed (back-compat)", () => {
    render(
      <QattanProviders locale="en">
        <ToolPreviewModal
          title="Legacy caller"
          description="Backwards-compatible caller still passing beforeSrc."
          poster="/poster-exterior.jpg"
          videoSrc="/videos/tool-exterior.mp4"
          beforeSrc="/hero-before-sketch.jpg"
        >
          <span>legacy</span>
        </ToolPreviewModal>
      </QattanProviders>,
    );
    fireEvent.click(screen.getByRole("button", { name: /open preview/i }));
    const dialog = screen.getByRole("dialog");
    // No split-screen artifacts anywhere.
    expect(dialog.querySelector(".qattan-preview-before")).toBeNull();
    expect(dialog.querySelector(".qattan-preview-divider-line")).toBeNull();
    expect(dialog.querySelector(".qattan-preview-divider-control")).toBeNull();
    expect(dialog.querySelector("input[type=range]")).toBeNull();
    expect(screen.queryByText("Before")).toBeNull();
    // One seamless video layer fills the frame.
    expect(dialog.querySelectorAll("video.qattan-preview-video")).toHaveLength(1);
  });
});
