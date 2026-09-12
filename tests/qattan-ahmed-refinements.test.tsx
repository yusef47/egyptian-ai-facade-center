import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";
import { QattanMarketingPage } from "../components/qattan/QattanMarketingPage";
import {
  GALLERY_VARIATION_DIRECTIVE,
  NONE_OPTION,
  OUTPUT_PRESENTATIONS,
  QATTAN_TOOLS,
  TRIPTYCH_DIRECTIVE,
  buildToolPrompt,
} from "../tools/registry";
import {
  GENERAL_VISUALIZATION_SYSTEM_PROMPT,
  MASTER_ARCHITECTURAL_SYSTEM_PROMPT,
} from "../lib/openrouter-engine";

const SAMPLE_PNG = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "facade.png", {
  type: "image/png",
});

/** Uploads a sample image through the workspace's hidden file input. */
async function uploadSampleImage() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, { target: { files: [SAMPLE_PNG] } });
  await waitFor(() => {
    expect(document.querySelector(".qattan-tool-upload-preview")).toBeInTheDocument();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Refinement 1 — None (Custom Prompt) freedom option", () => {
  it("puts a bilingual None option at index 0 of every select control", () => {
    for (const tool of QATTAN_TOOLS) {
      for (const control of tool.controls) {
        if (control.type !== "select") continue;
        const first = control.options[0];
        expect(first.value, `${tool.id}.${control.id}`).toBe("none");
        expect(first.label.en).toBe("None (Custom Prompt)");
        expect(first.label.ar).toBe("بدون (حسب النص المكتوب)");
      }
    }
  });

  it("omits preset constraints from the prompt when None is selected", () => {
    const prompt = buildToolPrompt("exterior", {
      exteriorStyle: "none",
      exteriorMaterial: "none",
      exteriorLighting: "none",
    });
    expect(prompt).not.toContain("architectural style");
    expect(prompt).not.toContain("facade materials");
    expect(prompt).toContain("Redesign this building exterior.");
    expect(prompt).toContain("Maintain the exact structural grid");
  });

  it("keeps explicit selections working alongside None on other controls", () => {
    const prompt = buildToolPrompt("exterior", {
      exteriorStyle: "Modern",
      exteriorMaterial: "none",
      exteriorLighting: "Night 2700K",
    });
    expect(prompt).toContain("Modern architectural style");
    expect(prompt).not.toContain("facade materials");
    expect(prompt).toContain("Night 2700K");
  });

  it("falls back to the first non-None option when nothing is selected", () => {
    const prompt = buildToolPrompt("interior", {});
    expect(prompt).toContain("Living Room");
    expect(prompt).not.toContain("as a none");
  });

  it("builds coherent sentences for every tool when all selects are None", () => {
    for (const tool of QATTAN_TOOLS) {
      if (tool.id === "floorplan") continue;
      const values: Record<string, string | string[]> = {};
      for (const control of tool.controls) {
        if (control.type === "select") values[control.id] = "none";
      }
      const prompt = buildToolPrompt(tool.id, values);
      expect(prompt.length, tool.id).toBeGreaterThan(40);
      expect(prompt, tool.id).not.toMatch(/\bnone\b/);
      expect(prompt, tool.id).not.toMatch(/undefined|\{\}/);
    }
  });
});

describe("Refinement 2 — Output presentation toggle", () => {
  it("exposes exactly the three requested presentation modes bilingually", () => {
    expect(OUTPUT_PRESENTATIONS).toEqual(["single", "gallery", "triptych"]);
  });

  it("renders the toggle with the Arabic label عرض المخرجات in the studio", () => {
    render(<QattanStudio locale="ar" initialMode="interior" />);
    expect(screen.getByText("عرض المخرجات")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "صورة فردية واحدة" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "3 صور منفصلة" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "لوحة ثلاثية مدمجة" })).toBeInTheDocument();
  });

  it("renders the English toggle labels for English users", () => {
    render(<QattanStudio locale="en" initialMode="interior" />);
    const group = screen.getByRole("radiogroup", { name: /output presentation/i });
    expect(within(group).getByRole("radio", { name: "Single image" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(group).getByRole("radio", { name: "3 gallery cards" })).toBeInTheDocument();
    expect(within(group).getByRole("radio", { name: "Triptych board" })).toBeInTheDocument();
  });

  it("appends the triptych directive when Triptych Board is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "https://cdn.test/out.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    await uploadSampleImage();
    fireEvent.click(screen.getByRole("radio", { name: "Triptych board" }));
    fireEvent.change(screen.getByLabelText("Design brief"), {
      target: { value: "Restore with warm stone" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.prompt).toContain(TRIPTYCH_DIRECTIVE.slice(0, 60));
  });

  it("fires EXACTLY ONE request in 3 gallery-cards mode with the variations directive in the prompt", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "https://cdn.test/out.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    await uploadSampleImage();
    fireEvent.click(screen.getByRole("radio", { name: "3 gallery cards" }));
    fireEvent.change(screen.getByLabelText("Design brief"), {
      target: { value: "Modern villa facade" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { prompt: string };
    expect(body.prompt).toContain(GALLERY_VARIATION_DIRECTIVE.slice(0, 60));
  });

  it("keeps single mode to exactly one request with no directive", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "https://cdn.test/out.png" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<QattanStudio locale="en" initialMode="exterior" />);
    await uploadSampleImage();
    fireEvent.change(screen.getByLabelText("Design brief"), {
      target: { value: "Clean limestone facade" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Refinement 3 — Deep architectural reasoning system prompt", () => {
  const REASONING_SNIPPET =
    "PERFORM DEEP GEOMETRICAL AND STRUCTURAL REASONING: Analyze all existing structural openings, windows, doors, floor line levels, and balcony placements in the source image. Under NO circumstances omit or ignore an existing door, window, or architectural feature. Intelligently reconstruct any missing or unconstructed building data using realistic physical architectural logic.";

  it("carries the mandated reasoning paragraph verbatim in the facade prompt", () => {
    expect(MASTER_ARCHITECTURAL_SYSTEM_PROMPT).toContain(REASONING_SNIPPET);
  });

  it("carries the mandated reasoning paragraph verbatim in the general prompt", () => {
    expect(GENERAL_VISUALIZATION_SYSTEM_PROMPT).toContain(REASONING_SNIPPET);
  });
});

describe("Refinement 4 — Luxury showreel and tool preview modals", () => {
  it("mounts the looping showreel with progress dots and a pause control in the hero", () => {
    render(<QattanMarketingPage locale="en" />);
    const reel = document.querySelector(".qattan-reel");
    expect(reel).not.toBeNull();
    expect(document.querySelectorAll(".qattan-reel-progress-dot").length).toBe(3);
    expect(screen.getByRole("button", { name: /pause showreel/i })).toBeInTheDocument();
    expect(screen.getByText(/Powered by Qattan Architectural Engine/)).toBeInTheDocument();
  });

  it("toggles the showreel play state", () => {
    render(<QattanMarketingPage locale="en" />);
    const toggle = screen.getByRole("button", { name: /pause showreel/i });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: /play showreel/i })).toBeInTheDocument();
  });

  it("shows the Arabic showreel caption in Arabic locale", () => {
    render(<QattanMarketingPage locale="ar" />);
    expect(screen.getByText("من واجهة مرسومة يدوياً…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إيقاف العرض" })).toBeInTheDocument();
  });

  it("gives every tool card a working play/pause preview modal", () => {
    render(<QattanMarketingPage locale="en" />);
    const triggers = screen.getAllByRole("button", { name: /open preview/i });
    expect(triggers.length).toBeGreaterThanOrEqual(8);

    fireEvent.click(triggers[0]);
    const dialog = screen.getByRole("dialog");
    const video = dialog.querySelector("video.qattan-preview-video");
    expect(video).not.toBeNull();
    // React applies `muted` as a DOM property rather than a serialized attribute.
    expect((video as HTMLVideoElement).muted).toBe(true);
    expect(video).toHaveAttribute("loop");
    expect(video).toHaveAttribute("poster");

    // Centered fullscreen lightbox: portaled to body so card transforms
    // cannot trap the fixed overlay, with the requested utility classes.
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog.className).toContain("fixed");
    expect(dialog.className).toContain("z-50");
    expect(dialog.className).toContain("items-center");
    expect(dialog.className).toContain("justify-center");
    expect(dialog.className).toContain("bg-black/80");
    expect(dialog.className).toContain("backdrop-blur-md");
    const card = dialog.firstElementChild as HTMLElement;
    expect(card.className).toContain("max-w-3xl");

    // Play/pause inside the modal stage. The modal opens with playback on,
    // so the first click pauses and the second resumes.
    const stage = within(dialog).getByRole("button", { name: /preview (playing|paused)/i });
    fireEvent.click(stage);
    expect(within(dialog).getByRole("button", { name: /preview paused/i })).toBeInTheDocument();
    fireEvent.click(stage);
    expect(within(dialog).getByRole("button", { name: /preview playing/i })).toBeInTheDocument();

    // Escape closes.
    fireEvent.keyDown(document, { key: "Escape" });
    awaitWaitForDialogGone();
  });

  it("labels the preview chip in Arabic", () => {
    render(<QattanMarketingPage locale="ar" />);
    expect(screen.getAllByText("شاهد المعاينة").length).toBeGreaterThanOrEqual(8);
  });
});

function awaitWaitForDialogGone() {
  // Escape-close runs through AnimatePresence; assert after the exit tick.
  return waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
}
