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
    expect(screen.getByRole("link", { name: /Unsplash/i })).toBeInTheDocument();
  });

  it("populates all four gallery cards with requested high-resolution images", () => {
    render(<App />);

    const galleryImages = screen.getAllByTestId(/gallery-image-/);
    expect(galleryImages).toHaveLength(4);

    const expectedSources = [
      "https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1200&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    ];

    galleryImages.forEach((image, index) => {
      expect(image).toHaveAttribute("src", expectedSources[index]);
      expect(image).toHaveClass("w-full", "h-52", "object-cover", "rounded-t-xl");
    });
  });

  it("falls back to a non-empty image when a gallery URL fails", () => {
    render(<App />);

    const image = screen.getByTestId("gallery-image-01");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", expect.stringContaining("images.unsplash.com"));

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", expect.stringContaining("data:image/svg+xml"));
  });

  it("keeps gallery fallback images styled as full cards", () => {
    render(<App />);

    const image = screen.getByTestId("gallery-image-03");
    fireEvent.error(image);
    fireEvent.error(image);
    expect(image).toHaveClass("w-full", "h-52", "object-cover", "rounded-t-xl");
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
