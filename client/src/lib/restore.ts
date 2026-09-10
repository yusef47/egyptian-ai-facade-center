import type { ToolId } from "@tools/registry";
import {
  AuthRequiredError,
  getSupabaseSessionGate,
  QATTAN_AUTH_REQUIRED_EVENT,
} from "../../../lib/supabase";

export interface RestoreRequest {
  imageDataUrl: string;
  prompt: string;
  mode?: "facade" | "cad";
  toolId?: ToolId;
}

export interface RestoreResult {
  imageDataUrl: string;
  creditsRemaining?: number;
}

const IMAGE_REFERENCE_RE = /^(data:image\/|https?:\/\/)/i;

/** Window event that carries the fresh daily-credit balance after each generation. */
export const QATTAN_CREDITS_EVENT = "qattan:credits";

/**
 * Resolves the signed-in Supabase access token so /api/restore can attribute
 * the generation (and its credit deduction) to the caller. Returns null when
 * Supabase is not configured or no session exists.
 */
async function getSupabaseAccessToken(): Promise<string | null> {
  try {
    const { getSupabaseBrowserClient } = await import("../../../lib/supabase");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Calls the Next.js route /api/restore with the compressed image,
 * architectural prompt, optional studio mode, and the caller's Supabase
 * bearer token (Authorization header) so the server can verify identity,
 * gate the daily credit balance, and atomically deduct one credit. Returns
 * either a hosted https:// URL or a data:image/... string.
 */
export async function restoreFacade(request: RestoreRequest): Promise<string> {
  // Mandatory auth gate: every generating surface (registry tools and the
  // legacy facade/floorplan engines all funnel through here) must have a
  // Supabase session before a request is sent. Skipped pre-activation
  // ("disabled" gate) and overridable per-call for special surfaces.
  const gate = await getSupabaseSessionGate();
  if (gate === "signed-out") {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(QATTAN_AUTH_REQUIRED_EVENT));
    }
    throw new AuthRequiredError();
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const accessToken = await getSupabaseAccessToken();
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch("/api/restore", {
    method: "POST",
    headers,
    body: JSON.stringify(request),
  });

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON upstream response
  }

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  // Push the authoritative remaining balance to the header credit counter
  // so it updates instantly after every generation — no page refresh.
  const creditsRemaining = (data as RestoreResult | null)?.creditsRemaining;
  if (typeof creditsRemaining === "number" && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(QATTAN_CREDITS_EVENT, { detail: { credits: creditsRemaining } }),
    );
  }

  const output = (data as RestoreResult | null)?.imageDataUrl;
  if (typeof output !== "string" || output.length === 0 || !IMAGE_REFERENCE_RE.test(output)) {
    throw new Error("No image returned");
  }
  return output;
}
