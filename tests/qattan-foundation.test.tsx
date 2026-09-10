import { describe, expect, it } from "vitest";
import { metadata } from "../app/layout";

describe("Qattan App Router foundation", () => {
  it("declares Qattan AI metadata", () => {
    expect(String(metadata.title)).toContain("Qattan AI");
    expect(metadata.description).toContain("photorealistic renders with AI");
  });
});
