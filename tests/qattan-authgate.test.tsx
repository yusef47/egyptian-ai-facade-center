import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ToolWorkspace from "../components/qattan/ToolWorkspace";
import RequireAuthModal from "../components/qattan/RequireAuthModal";
import { QattanProviders } from "../components/qattan/QattanProviders";
import { restoreFacade } from "../client/src/lib/restore";
import { AuthRequiredError, getSupabaseSessionGate } from "../lib/supabase";
import { getToolById } from "../tools/registry";

// Session-gate state, flipped per test.
const state = vi.hoisted(() => ({
  session: null as { access_token: string } | null,
  signInRedirects: [] as string[],
}));

vi.mock("../lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/supabase")>();
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: state.session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: vi.fn(async ({ options }: { options?: { redirectTo?: string } }) => {
        state.signInRedirects.push(options?.redirectTo ?? "");
        return { data: { provider: "google", url: options?.redirectTo ?? "" }, error: null };
      }),
    },
  };
  return {
    ...actual,
    getSupabaseBrowserClient: () => client,
    // Override the gate too: the real implementation closes over the real
    // (env-dependent) client getter, which is null in the test environment.
    getSupabaseSessionGate: () =>
      Promise.resolve(state.session ? ("signed-in" as const) : ("signed-out" as const)),
  };
});

vi.mock("@supabase/ssr", () => ({
  createBrowserClient: vi.fn(() => null),
  createServerClient: vi.fn(() => ({
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  })),
}));

function renderWorkspace() {
  return render(
    <QattanProviders locale="en">
      <ToolWorkspace tool={getToolById("exterior")!} />
    </QattanProviders>,
  );
}

beforeEach(() => {
  state.session = null;
  state.signInRedirects = [];
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Session gate helper", () => {
  it("returns signed-out without a session and signed-in with one", async () => {
    state.session = null;
    expect(await getSupabaseSessionGate()).toBe("signed-out");
    state.session = { access_token: "t" };
    expect(await getSupabaseSessionGate()).toBe("signed-in");
  });
});

describe("Mandatory auth gate in ToolWorkspace", () => {
  it("blocks Generate when signed out and opens the luxury auth modal", async () => {
    state.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const user = (await import("@testing-library/user-event")).default.setup();
    renderWorkspace();

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
    await user.type(screen.getByLabelText(/Design brief/i), "Villa study");

    const fetchCallsBefore = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() =>
      expect(document.body.querySelector(".qattan-authgate")).not.toBeNull(),
    );
    // The generation request must never leave the browser.
    expect(fetchMock.mock.calls.length).toBe(fetchCallsBefore);
  });

  let signedInPass = 0;
  it("proceeds with generation when signed in", async () => {
    state.session = { access_token: "token" };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU", creditsRemaining: 9 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = (await import("@testing-library/user-event")).default.setup();
    renderWorkspace();

    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
    await user.type(screen.getByLabelText(/Design brief/i), "Villa study");
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(
      () => expect(screen.getByLabelText(/Zoom result fullscreen/i)).toBeInTheDocument(),
      { timeout: 15000 },
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as { toolId?: string };
    expect(body.toolId).toBe("exterior");
  });

  it("shows signed-in users no auth modal on generate", async () => {
    state.session = { access_token: "token" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ imageDataUrl: "data:image/png;base64,UkVTVUxU" }),
      }),
    );

    const user = (await import("@testing-library/user-event")).default.setup();
    renderWorkspace();
    const file = new File(["fake-image-bytes"], "facade.jpg", { type: "image/jpeg" });
    await user.upload(screen.getByLabelText(/Facade photo or 3D screenshot/i), file);
    await user.type(screen.getByLabelText(/Design brief/i), "Villa study");
    fireEvent.click(screen.getAllByRole("button", { name: /Generate/i })[0]);

    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 15000 });
    expect(document.body.querySelector(".qattan-authgate")).toBeNull();
  });
});

describe("RequireAuthModal", () => {
  it("renders the exact bilingual copy and gold Google CTA", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <QattanProviders locale="en">
        <RequireAuthModal open onClose={onClose} returnTo="/studio?mode=exterior" />
      </QattanProviders>,
    );

    expect(screen.getByText("Sign In Required to Try Tools")).toBeInTheDocument();
    expect(
      screen.getByText(/Sign in with Google in 3 seconds to receive 10 free daily credits!/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Login with Google/i })).toBeInTheDocument();
    unmount();
  });

  it("renders the Arabic copy in Arabic locale", () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <QattanProviders locale="ar">
        <RequireAuthModal open onClose={onClose} returnTo="/studio?mode=exterior" />
      </QattanProviders>,
    );

    expect(screen.getByText("تسجيل الدخول مطلوب لتجربة الأدوات 🔐")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /التسجيل بـ Google/i })).toBeInTheDocument();
    unmount();
  });

  it("starts Google OAuth with the studio deep link preserved after sign-in", async () => {
    const onClose = vi.fn();
    render(
      <QattanProviders locale="en">
        <RequireAuthModal open onClose={onClose} returnTo="/studio?mode=interior" />
      </QattanProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Login with Google/i }));
    await waitFor(() => expect(state.signInRedirects).toHaveLength(1));
    expect(state.signInRedirects[0]).toContain("/auth/callback?next=%2Fstudio%3Fmode%3Dinterior");
  });

  it("closes via X, backdrop, and Escape", () => {
    const onClose = vi.fn();
    render(
      <QattanProviders locale="en">
        <RequireAuthModal open onClose={onClose} />
      </QattanProviders>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(document.querySelector(".qattan-authgate")!);
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <QattanProviders locale="en">
        <RequireAuthModal open={false} onClose={() => {}} />
      </QattanProviders>,
    );
    expect(container.querySelector(".qattan-authgate")).toBeNull();
  });
});

describe("restoreFacade auth gate (legacy facade/floorplan engines)", () => {
  it("throws AuthRequiredError and dispatches the global event when signed out", async () => {
    state.session = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const listener = vi.fn();
    window.addEventListener("qattan:auth-required", listener);
    await expect(
      restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" }),
    ).rejects.toBeInstanceOf(AuthRequiredError);
    window.removeEventListener("qattan:auth-required", listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("proceeds to fetch when signed in", async () => {
    state.session = { access_token: "token" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ imageDataUrl: "data:image/png;base64,AAAA" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await restoreFacade({ imageDataUrl: "data:image/png;base64,AAAA", prompt: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer token");
  });
});
