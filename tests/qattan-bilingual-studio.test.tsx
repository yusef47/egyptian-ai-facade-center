import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";
import { FACADE_GUIDE, QATTAN_TOOLS } from "../tools/registry";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const AR_TITLE_BY_ID: Record<string, string> = Object.fromEntries(
  QATTAN_TOOLS.map((tool) => [tool.id, tool.title.ar]),
);

describe("Qattan bilingual studio", () => {
  it("shows the brief-specified Arabic tool titles in the rail when locale is ar", () => {
    render(<QattanStudio locale="ar" initialMode="exterior" />);

    for (const arTitle of Object.values(AR_TITLE_BY_ID)) {
      expect(screen.getAllByText(arTitle).length).toBeGreaterThan(0);
    }
    // RTL applies to the studio shell.
    const shell = document.querySelector(".qattan-studio-page");
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute("dir")).toBe("rtl");
    expect(shell?.getAttribute("lang")).toBe("ar");
  });

  it("renders the expandable tool guide with input, output, and pro-tip in English", async () => {
    render(<QattanStudio locale="en" initialMode="interior" />);

    fireEvent.click(screen.getByRole("button", { name: /How This Tool Works/i }));

    await waitFor(() => {
      expect(screen.getByText("Input")).toBeInTheDocument();
      expect(screen.getByText("What you get")).toBeInTheDocument();
      expect(screen.getByText("Architectural pro-tip")).toBeInTheDocument();
    });
    expect(screen.getByText(/Upload an empty room photo/i)).toBeInTheDocument();
    expect(screen.getByText(/photograph the room at chest height/i)).toBeInTheDocument();
  });

  it("renders the guide fully in Arabic when locale is ar", () => {
    render(<QattanStudio locale="ar" initialMode="masterplan" />);

    fireEvent.click(screen.getByRole("button", { name: /كيف تعمل هذه الأداة/i }));

    expect(screen.getByText("المدخل المطلوب")).toBeInTheDocument();
    expect(screen.getByText("النتيجة المتوقعة")).toBeInTheDocument();
    expect(screen.getByText("نصيحة معمارية")).toBeInTheDocument();
    expect(screen.getByText("ارفع مخطط موقع ثنائي الأبعاد أو تصدير CAD أو رسم تقسيم.")).toBeInTheDocument();
  });

  it("provides a guide for the legacy facade engine", () => {
    expect(FACADE_GUIDE.input.ar).toMatch(/[\u0600-\u06FF]/);
    expect(FACADE_GUIDE.output.ar).toMatch(/[\u0600-\u06FF]/);
    expect(FACADE_GUIDE.tip.ar).toMatch(/[\u0600-\u06FF]/);
  });

  it("shows the guide panel inside the floorplan CAD workspace too", () => {
    render(<QattanStudio locale="en" initialMode="floorplan" />);

    expect(screen.getByRole("button", { name: /How This Tool Works/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Floor plan image/i)).toBeInTheDocument();
  });
});
