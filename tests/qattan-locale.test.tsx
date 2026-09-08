import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QattanHeader } from "../components/qattan/QattanHeader";
import { QattanProviders } from "../components/qattan/QattanProviders";

describe("Qattan locale boundary", () => {
  it("renders Arabic direction and Qattan identity", () => {
    render(
      <QattanProviders locale="ar">
        <QattanHeader />
      </QattanProviders>,
    );

    expect(screen.getByText("قطان AI")).toBeInTheDocument();
    expect(screen.getByText(/استوديو التصور المعماري/)).toBeInTheDocument();
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
  });
});
