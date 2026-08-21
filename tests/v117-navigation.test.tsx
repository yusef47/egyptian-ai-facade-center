import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import Navbar from "../client/src/components/Navbar";
import Home from "../client/src/pages/Home";
import { I18nProvider } from "../client/src/lib/i18n";

describe("V117 studio navigation", () => {
  it("renders two accessible studio tabs and reports the selected mode", async () => {
    const onStudioChange = vi.fn();
    const user = userEvent.setup();

    render(
      <I18nProvider>
        <Navbar activeStudio="facade" onStudioChange={onStudioChange} />
      </I18nProvider>,
    );

    const tablist = screen.getByRole("tablist", { name: /studio/i });
    expect(tablist).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Facade Restoration/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Floor Plan to CAD/i })).toHaveAttribute("aria-selected", "false");

    await user.click(screen.getByRole("tab", { name: /Floor Plan to CAD/i }));
    expect(onStudioChange).toHaveBeenCalledWith("cad");
  });

  it("switches the live Home page to the CAD panel", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Home />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("tab", { name: /Floor Plan to CAD/i }));
    expect(screen.getByRole("tabpanel", { name: /Floor Plan to CAD/i })).toHaveAttribute("id", "cad-studio-panel");
    expect(screen.queryByTestId("hero-section")).not.toBeInTheDocument();
  });
});
