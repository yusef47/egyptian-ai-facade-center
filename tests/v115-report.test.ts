import { describe, expect, it } from "vitest";
import { buildSyndicateReportHtml } from "../client/src/lib/report";

describe("V115 syndicate report", () => {
  it("includes the uploaded facade, exact prompt, and generated triptych result", () => {
    const html = buildSyndicateReportHtml({
      prompt: "Preserve the balcony rhythm and add warm limestone.",
      status: "Triptych generated",
      createdAt: "2026-08-03T12:00:00.000Z",
      inputImageDataUrl: "data:image/jpeg;base64,UPLOADED",
      outputImageDataUrl: "https://cdn.example.com/triptych.png",
    });

    expect(html).toContain("data:image/jpeg;base64,UPLOADED");
    expect(html).toContain("Preserve the balcony rhythm and add warm limestone.");
    expect(html).toContain("https://cdn.example.com/triptych.png");
    expect(html).toMatch(/triptych|three-panel|3-panel/i);
  });
});
