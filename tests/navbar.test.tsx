import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import Navbar from "../client/src/components/Navbar";
import { I18nProvider } from "../client/src/lib/i18n";

describe("Navbar", () => {
  it("shows the Egyptian Syndicate and Center branding in English", () => {
    render(
      <I18nProvider>
        <Navbar />
      </I18nProvider>,
    );
    expect(screen.getByText(/Egyptian Engineers Syndicate/i)).toBeInTheDocument();
    expect(screen.getByText(/Egyptian Center for AI in Architecture & Urbanism/i)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Egyptian flag" })).toHaveAttribute(
      "src",
      "/logos/egypt-flag.png",
    );
    expect(screen.getByRole("navigation")).toHaveClass("site-navbar");
  });

  it("toggles to Arabic and switches the document to RTL", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Navbar />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: "عربي" }));

    await waitFor(() => expect(document.documentElement.lang).toBe("ar"));
    expect(document.documentElement.dir).toBe("rtl");
    expect(screen.getByText(/المركز المصري للذكاء الاصطناعي في العمارة والعمران/i)).toBeInTheDocument();
    expect(screen.getByText(/نقابة المهندسين المصرية/i)).toBeInTheDocument();
  });
});
