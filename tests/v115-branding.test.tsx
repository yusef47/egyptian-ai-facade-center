import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Navbar from "../client/src/components/Navbar";
import HeroSection from "../client/src/components/HeroSection";
import { I18nProvider } from "../client/src/lib/i18n";

describe("V115.1 official branding assets", () => {
  it("renders the three official assets in the RTL navbar", () => {
    render(
      <I18nProvider>
        <Navbar />
      </I18nProvider>,
    );

    expect(screen.getByRole("img", { name: /Egyptian Engineers Syndicate logo/i })).toHaveAttribute(
      "src",
      "/logos/syndicate-logo.png",
    );
    expect(screen.getByRole("img", { name: /Egyptian Center.*logo/i })).toHaveAttribute(
      "src",
      "/logos/center-logo.png",
    );
    expect(screen.getByRole("img", { name: /Egyptian flag/i })).toHaveAttribute(
      "src",
      "/logos/egypt-flag.png",
    );
  });

  it("renders the flag above the side-by-side hero logos with a gold divider", () => {
    render(
      <I18nProvider>
        <HeroSection />
      </I18nProvider>,
    );

    const heroBranding = screen.getByTestId("hero-branding");
    expect(heroBranding.querySelector('img[src="/logos/egypt-flag.png"]')).toBeTruthy();
    expect(heroBranding.querySelector('img[src="/logos/syndicate-logo.png"]')).toBeTruthy();
    expect(heroBranding.querySelector('img[src="/logos/center-logo.png"]')).toBeTruthy();
    expect(heroBranding.querySelector(".hero-logo-divider")).toBeTruthy();
  });
});
