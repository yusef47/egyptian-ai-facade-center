import type { EngineeringGeometry } from "../../../lib/engineering-geometry";
import {
  AuthRequiredError,
  getSupabaseSessionGate,
  QATTAN_AUTH_REQUIRED_EVENT,
} from "../../../lib/supabase";
import { QATTAN_CREDITS_EVENT } from "./restore";

export interface AnalyzeEngineeringRequest {
  imageDataUrl: string;
  prompt: string;
}

export interface AnalyzeEngineeringResult {
  geometry: EngineeringGeometry;
  creditsRemaining?: number;
}

/**
 * Calls the Next.js route /api/engineering/analyze with the uploaded drawing and
 * the engineering brief. The server reads the drawing with the vision model and
 * returns structured 3D geometry (NOT an image); the Three.js CAD engine in the
 * browser then renders the orthographic projections and the isometric view.
 *
 * Mirrors client/src/lib/restore.ts: mandatory auth gate, Supabase bearer token
 * for credit attribution, and the qattan:credits broadcast after every call.
 */
export async function analyzeEngineeringDrawing(
  request: AnalyzeEngineeringRequest,
): Promise<AnalyzeEngineeringResult> {
  const gate = await getSupabaseSessionGate();
  if (gate === "signed-out") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(QATTAN_AUTH_REQUIRED_EVENT));
    }
    throw new AuthRequiredError();
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const { getSupabaseBrowserClient } = await import("../../../lib/supabase");
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    /* No session available — the server will answer 401. */
  }

  const response = await fetch("/api/engineering/analyze", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON upstream response */
  }

  const rawCredits = (data as { creditsRemaining?: unknown } | null)?.creditsRemaining;
  const creditsRemaining = typeof rawCredits === "number" ? rawCredits : undefined;
  if (typeof creditsRemaining === "number" && typeof window !== "undefined") {
    console.log("[CREDITS_EVENT_DISPATCH]", creditsRemaining);
    window.dispatchEvent(new CustomEvent(QATTAN_CREDITS_EVENT, { detail: creditsRemaining }));
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  const geometry = (data as { geometry?: unknown } | null)?.geometry;
  if (!geometry || typeof geometry !== "object") {
    throw new Error("No geometry returned");
  }
  return { geometry: geometry as EngineeringGeometry, creditsRemaining };
}
