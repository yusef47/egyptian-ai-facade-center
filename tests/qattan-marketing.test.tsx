import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QattanMarketingPage } from "../components/qattan/QattanMarketingPage";

describe("Qattan marketing page", () => {
  it("shows core Arabic sections and a studio CTA", () => {
    render(<QattanMarketingPage locale="ar" />);

    expect(screen.getAllByRole("link", { name: /قطان AI/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/استوديو التصور المعماري/).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /ابدأ الإنشاء|ابدأ/ })).toHaveAttribute("href", "/studio");
    expect(screen.getByRole("heading", { name: /مساحة واحدة/ })).toBeInTheDocument();
    expect(screen.getAllByText("متاح الآن").length).toBeGreaterThanOrEqual(8);
    expect(screen.queryByText("مخطط")).not.toBeInTheDocument();
  });
});
