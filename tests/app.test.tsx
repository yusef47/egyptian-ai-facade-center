import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App, buildRestoreRequestBody } from "../src/App";

describe("Egyptian Center facade app", () => {
  it("renders the visual transformation canvas and one royal restoration action", () => {
    render(<App />);

    expect(
      screen.getByText("المركز المصري للذكاء الاصطناعي في العمارة والعمران"),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /لوحة التحول المعماري/i }))
      .toBeInTheDocument();
    expect(screen.getByText("الواجهة الأصلية")).toBeInTheDocument();
    expect(screen.getByText("الترميم الملكي")).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /مقارنة الواجهة/i }))
      .toHaveValue("50");
    expect(screen.getByRole("button", { name: /بدء الترميم المعماري الملكي/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /رفع صورة الواجهة/i }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText(/اكتب رؤيتك المعمارية/i))
      .toBeInTheDocument();
  });

  it("moves the comparison handle and selects one visual style", () => {
    render(<App />);

    const slider = screen.getByRole("slider", { name: /مقارنة الواجهة/i });
    fireEvent.change(slider, { target: { value: "72" } });
    expect(slider).toHaveValue("72");

    const hashamiBadge = screen.getByRole("button", { name: /طراز هشمي/ });
    expect(hashamiBadge).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(hashamiBadge);
    expect(hashamiBadge).toHaveAttribute("aria-pressed", "true");
  });

  it("starts with a visual palace placeholder before generation", () => {
    render(<App />);

    expect(screen.getByTestId("restored-placeholder")).toBeInTheDocument();
    expect(screen.getByText(/ارفع صورة الواجهة الأصلية/i)).toBeInTheDocument();
  });

  it("builds the one direct restore payload with the selected style", () => {
    expect(
      buildRestoreRequestBody(
        "data:image/jpeg;base64,raw",
        "  واجهة ملكية  ",
        "طراز خديوي",
      ),
    ).toEqual({
      imageDataUrl: "data:image/jpeg;base64,raw",
      prompt: "واجهة ملكية\nArchitectural style direction: طراز خديوي.",
    });
  });

  it("starts with the direct royal restoration action available", () => {
    render(<App />);

    const action = screen.getByRole("button", { name: /بدء الترميم المعماري الملكي/i });
    expect(action).not.toBeDisabled();
  });
});
