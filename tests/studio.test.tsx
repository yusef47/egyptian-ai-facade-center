import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import EngineSection from "../client/src/components/EngineSection";
import { I18nProvider } from "../client/src/lib/i18n";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EngineSection restoration studio", () => {
  it("posts { imageDataUrl, prompt } to /api/restore and renders the result", { timeout: 20000 }, async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <I18nProvider>
        <EngineSection />
      </I18nProvider>,
    );

    // Upload a facade photo (canvas is unavailable in jsdom, so the raw data URL is used)
    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    const upload = screen.getByLabelText(/Current Facade/i) as HTMLInputElement;
    await user.upload(upload, file);

    // Write an architectural prompt
    const prompt = screen.getByLabelText(/Restoration prompt/i);
    await user.type(prompt, "Restore in Khedivial style");

    // Trigger the restoration
    await user.click(screen.getByRole("button", { name: /Start Restoration/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1), { timeout: 15000 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/restore");

    const body = JSON.parse(String(init.body)) as { imageDataUrl: string; prompt: string };
    expect(body.prompt).toBe("Restore in Khedivial style");
    expect(body.imageDataUrl.startsWith("data:")).toBe(true);

    await waitFor(() =>
      expect(screen.getByAltText("Restored")).toBeInTheDocument(),
    );
  });

  it("shows an inline error when the restore request fails", { timeout: 20000 }, async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: "Quota exceeded" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <I18nProvider>
        <EngineSection />
      </I18nProvider>,
    );

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Current Facade/i), file);
    await user.type(screen.getByLabelText(/Restoration prompt/i), "Restore the facade");

    await user.click(screen.getByRole("button", { name: /Start Restoration/i }));

    await waitFor(
      () => expect(screen.getByRole("alert")).toBeInTheDocument(),
      { timeout: 15000 },
    );
    expect(screen.getByRole("alert").textContent).toMatch(/credit|quota|openrouter/i);
  });

  it("shows the triptych panel labels and the official syndicate report download button", { timeout: 20000 }, async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const user = userEvent.setup();
    render(
      <I18nProvider>
        <EngineSection />
      </I18nProvider>,
    );

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Current Facade/i), file);
    await user.type(screen.getByLabelText(/Restoration prompt/i), "Restore the facade");
    await user.click(screen.getByRole("button", { name: /Start Restoration/i }));

    await waitFor(
      () => expect(screen.getByText(/Download Official Syndicate Report/i)).toBeInTheDocument(),
      { timeout: 15000 },
    );
    expect(screen.getByText(/3-panel presentation board/i)).toBeInTheDocument();
    expect(screen.getByText(/Khedivial Classic/i)).toBeInTheDocument();
    expect(screen.getByText(/Hashami \/ Biophilic/i)).toBeInTheDocument();
    expect(screen.getByText(/Islamic Mashrabiya/i)).toBeInTheDocument();
  });

  it("opens the generated triptych at native size in a fullscreen lightbox", { timeout: 20000 }, async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(
      <I18nProvider>
        <EngineSection />
      </I18nProvider>,
    );

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Current Facade/i), file);
    await user.type(screen.getByLabelText(/Restoration prompt/i), "Restore the facade");
    await user.click(screen.getByRole("button", { name: /Start Restoration/i }));

    const outputTrigger = await screen.findByRole("button", { name: /Open generated triptych/i });
    await user.click(outputTrigger);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog.querySelector('img[src="data:image/png;base64,UkVTVUxU"]')).toBeTruthy();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
