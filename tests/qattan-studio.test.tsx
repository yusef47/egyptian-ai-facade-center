import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Qattan studio", () => {
  it("renders interior as a live workspace without submitting on mount", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<QattanStudio locale="en" initialMode="interior" />);

    expect(screen.getAllByRole("button", { name: /Interior AI/i }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Empty room photo or 3D layout/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Room type/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("switches between the live facade and floor-plan CAD engines", () => {
    render(<QattanStudio locale="en" initialMode="facade" />);

    expect(screen.getByLabelText(/Current Facade/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Restoration prompt/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Floor Plan to CAD/i }));

    expect(screen.getByLabelText(/Floor plan image/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate 4 Architectural Views/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download All \(ZIP\)/i })).toBeInTheDocument();
  });
});
