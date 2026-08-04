import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "../client/src/pages/Home";
import { I18nProvider } from "../client/src/lib/i18n";

describe("V115 simplified home", () => {
  it("keeps only the official header, restoration studio, and report export flow", () => {
    render(
      <I18nProvider>
        <Home />
      </I18nProvider>,
    );

    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByTestId("hero-section")).toBeInTheDocument();
    expect(screen.getByTestId("hero-flag-watermark")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /from raw facade to heritage masterpiece/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /syndicate report/i })).toBeInTheDocument();
    expect(document.querySelector("#editions")).toBeNull();
    expect(document.querySelector("#pricing")).toBeNull();
    expect(document.querySelector("#academy")).toBeNull();
    expect(document.querySelector("#enterprise")).toBeNull();
    expect(screen.queryByText("Heritage Styles", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Service Plans", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Academy & Research", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByText("Institutions", { exact: true })).not.toBeInTheDocument();
  });
});
