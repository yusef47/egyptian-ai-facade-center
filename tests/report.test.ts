import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildSyndicateReport,
  downloadSyndicateReport,
  TRIPTYCH_PANELS,
} from "../client/src/lib/report";

describe("syndicate report metadata", () => {
  it("defines exactly the three mandatory triptych panels", () => {
    expect(TRIPTYCH_PANELS).toHaveLength(3);
    expect(TRIPTYCH_PANELS.map((p) => p.id)).toEqual([
      "khedivial",
      "hashami",
      "mashrabiya",
    ]);
    expect(TRIPTYCH_PANELS[0].en).toContain("Khedivial");
    expect(TRIPTYCH_PANELS[1].en).toContain("Hashami");
    expect(TRIPTYCH_PANELS[2].en).toContain("Mashrabiya");
  });

  it("builds a report identifying generator, model, panels and prompt", () => {
    const report = buildSyndicateReport({
      prompt: "Restore in Khedivial style",
      imageDataUrl: "data:image/png;base64,AAAA",
      generatedAt: "2026-08-03T00:00:00.000Z",
    });
    expect(report.model).toBe("google/gemini-3.1-flash-lite-image");
    expect(report.generator).toContain("Egyptian Center");
    expect(report.panels).toHaveLength(3);
    expect(report.prompt).toBe("Restore in Khedivial style");
    expect(report.imageDataUrl).toContain("data:image/png;base64");
    expect(report.generatedAt).toBe("2026-08-03T00:00:00.000Z");
  });
});

describe("downloadSyndicateReport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("downloads the triptych board image and the JSON metadata report", async () => {
    const hrefs: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      hrefs.push(this.href);
    });
    (URL as { createObjectURL: unknown }).createObjectURL = vi.fn(
      () => "blob:mock-report",
    );
    (URL as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    await downloadSyndicateReport("data:image/png;base64,UkVTVUxU", "Restore the facade");

    expect(hrefs).toHaveLength(2);
    // JSON metadata report first (always inside the user-activation window)
    expect(hrefs[0]).toBe("blob:mock-report");
    // then the triptych board image
    expect(hrefs[1]).toContain("data:image/png;base64");
  });
});
