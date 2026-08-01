import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App, buildRestoreRequestBody } from "../src/App";

describe("Egyptian Center facade app", () => {
  it("renders the V112 three-section architectural portal", () => {
    render(<App />);

    expect(screen.getByRole("banner", { name: /الهوية الرسمية/i })).toBeInTheDocument();
    expect(screen.getByText("المنصة القومية لإعادة إحياء الهوية المعمارية المصرية بالذكاء الاصطناعي"))
      .toBeInTheDocument();
    expect(screen.getByText("⚡ 3.0s")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("🏛️ 8K")).toBeInTheDocument();
    expect(screen.getByText("Restoration")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /استوديو الذكاء الاصطناعي/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("region", { name: /معرض ترميمات التراث/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/Red Brick → Hashami Palace/i)).toBeInTheDocument();
    expect(screen.getByText(/Streetscape → Heritage Alleyway/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Wikimedia Commons/i })).toBeInTheDocument();
  });

  it("renders a real photographic demo image without crop styling", () => {
    render(<App />);

    const demoImage = screen.getByTestId("restored-demo-image");
    expect(demoImage).toHaveAttribute("src", expect.stringContaining("upload.wikimedia.org"));
    expect(demoImage).toHaveClass("image-contain");
  });

  it("moves the divider with pointer dragging from left to right", () => {
    render(<App />);

    const canvas = screen.getByTestId("transformation-canvas");
    const divider = screen.getByRole("slider", { name: /سحب للمقارنة/i });
    vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 900,
      top: 0,
      bottom: 500,
      width: 800,
      height: 500,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent(
      divider,
      new MouseEvent("pointerdown", { bubbles: true, clientX: 180 }),
    );
    fireEvent(
      divider,
      new MouseEvent("pointermove", { bubbles: true, clientX: 740 }),
    );
    fireEvent(
      divider,
      new MouseEvent("pointerup", { bubbles: true, clientX: 740 }),
    );

    expect(divider).toHaveAttribute("aria-valuenow", "80");
  });

  it("switches between slider and full side-by-side views", () => {
    render(<App />);

    const sideBySide = screen.getByRole("button", { name: /عرض الصورتين كلياً/i });
    fireEvent.click(sideBySide);
    expect(screen.getByTestId("transformation-canvas")).toHaveClass("side-by-side");
    expect(screen.getByRole("button", { name: /مقارنة بالسلايدر/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /مقارنة بالسلايدر/i }));
    expect(screen.getByTestId("transformation-canvas")).not.toHaveClass("side-by-side");
  });

  it("keeps the selected style in the one direct restore payload", () => {
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
});
