import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import QattanStudio from "../components/qattan/QattanStudio";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Qattan studio", () => {
  it("does not submit unsupported planned modes", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<QattanStudio locale="en" initialMode="interior" />);

    expect(screen.getByRole("button", { name: /Interior AI/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/planned|coming soon/i);
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
