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

    const hero = screen.getByTestId("hero-section");
    const heroBranding = screen.getByTestId("hero-branding");
    const heading = hero.querySelector("h1");
    const watermark = screen.getByTestId("hero-flag-watermark");

    expect(heroBranding.querySelector('img[src="/logos/egypt-flag.png"]')).toBeTruthy();
    expect(heroBranding.querySelector('img[src="/logos/syndicate-logo.png"]')).toBeTruthy();
    expect(heroBranding.querySelector('img[src="/logos/center-logo.png"]')).toBeTruthy();
    expect(heroBranding.querySelector(".hero-logo-divider")).toBeTruthy();
    expect(heroBranding.compareDocumentPosition(heading as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading).toHaveClass("hero-title", "font-cairo");
    expect(watermark).toHaveAttribute("aria-hidden", "true");
    expect(watermark).toHaveAttribute("alt", "");
    expect(watermark).toHaveClass("hero-flag-watermark");
  });

  it("keeps the official navbar logos and flag in presentation order", () => {
    render(
      <I18nProvider>
        <Navbar />
      </I18nProvider>,
    );

    const navbar = screen.getByRole("navigation");
    const syndicate = screen.getByRole("img", { name: /Egyptian Engineers Syndicate logo/i });
    const flag = screen.getByRole("img", { name: /Egyptian flag/i });
    const center = screen.getByRole("img", { name: /Egyptian Center.*logo/i });

    expect(navbar).toContainElement(syndicate);
    expect(navbar).toContainElement(flag);
    expect(navbar).toContainElement(center);
    expect(syndicate.compareDocumentPosition(flag) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(flag.compareDocumentPosition(center) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(syndicate).toHaveClass("navbar-syndicate-logo", "h-12");
    expect(center).toHaveClass("navbar-center-logo", "h-12");
  });
});
