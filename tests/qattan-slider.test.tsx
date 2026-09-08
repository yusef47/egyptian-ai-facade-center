import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BeforeAfterSlider from "../components/qattan/BeforeAfterSlider";

describe("Qattan before-after slider", () => {
  it("supports keyboard movement without making a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(
      <BeforeAfterSlider
        beforeLabel="Before"
        afterLabel="After"
        beforeSrc="/before.svg"
        afterSrc="/after.svg"
      />,
    );

    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("50");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider).toHaveValue("51");
    fireEvent.keyDown(slider, { key: "End" });
    expect(slider).toHaveValue("100");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
