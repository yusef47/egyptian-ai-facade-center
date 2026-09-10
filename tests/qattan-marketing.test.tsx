import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QattanMarketingPage } from "../components/qattan/QattanMarketingPage";

describe("Qattan marketing page (mnml.ai hierarchy)", () => {
  it("shows the Arabic hero with badge, three-line headline, and studio CTA", () => {
    render(<QattanMarketingPage locale="ar" />);

    expect(screen.getAllByRole("link", { name: /قطان AI/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/استوديو التصور المعماري/).length).toBeGreaterThan(0);
    // Arabic users stay in Arabic: the studio CTA deep-links to /ar/studio.
    expect(screen.getByRole("link", { name: /ابدأ الإنشاء|ابدأ/ })).toHaveAttribute("href", "/ar/studio");

    // mnml.ai hero hierarchy.
    expect(screen.getAllByText(/منصة الذكاء الاصطناعي المعماري الأولى/).length).toBeGreaterThan(0);
    // Headline words are split across animated per-word spans (nbsp-separated).
    expect(
      screen.getAllByText(
        (_, element) => element?.textContent?.replace(/\u00A0/g, " ").trim() === "رندر معماري",
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/من الاسكتش للصورة الواقعية في ثواني/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/موثوق من قبل \+2 مليون/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/مدعوم بـ محرك قطان المعماري/).length).toBeGreaterThan(0);
  });

  it("shows the mnml.ai section structure in Arabic", () => {
    render(<QattanMarketingPage locale="ar" />);

    // Before/after, 3-step workflow, tools grid, SOON pricing.
    expect(screen.getByRole("heading", { name: /من الرسمة للواقع في ثواني/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /٣ خطوات بس/ })).toBeInTheDocument();
    expect(screen.getByText("ارفع صورتك")).toBeInTheDocument();
    expect(screen.getByText("اختر الستايل")).toBeInTheDocument();
    expect(screen.getByText("حمّل النتيجة")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /أدوات الذكاء الاصطناعي للتصميم/ })).toBeInTheDocument();
    expect(screen.getAllByText("متاح الآن").length).toBeGreaterThanOrEqual(8);
    expect(screen.getAllByText(/قريباً/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("$29").length).toBeGreaterThan(0);

    // Tool cards expose feature checkmarks and live deep links.
    expect(screen.getAllByText("وضع تريبتيك التراث").length).toBeGreaterThan(0);

    // No university or corporate partner logos section.
    expect(screen.queryByText(/Gensler|SOM|Harvard|MIT|Yale/i)).not.toBeInTheDocument();
  });
});
