/**
 * Client for /api/architect/interpret — the workspace's ONLY paid call.
 *
 * Local interactions (direct numeric edits, option switching, Undo) never
 * come through here, so they can never reach the model or the credit
 * ledger. Auth policy mirrors client/src/lib/restore.ts: the bearer token
 * is the caller's identity; when Supabase is configured but no session can
 * be resolved, the auth-required event is dispatched and the call fails
 * closed BEFORE any request leaves the browser. Only a deployment with no
 * Supabase credentials at all sends tokenless (and the server still 401s).
 */

import {
  AuthRequiredError,
  QATTAN_AUTH_REQUIRED_EVENT,
} from "../../../lib/supabase";
import { QATTAN_CREDITS_EVENT } from "./restore";
import type { BriefPatch, WorkspaceBrief } from "../../../lib/architect/brief-patch";
import type { RoomAction, RoomProgram } from "../../../lib/architect/room-plan";
import type { DesignProposal } from "../../../lib/architect/building-proposal";
import type { WallMeshPreset } from "../../../lib/architect/wall-mesh";

export const ARCHITECT_INTERPRET_ENDPOINT = "/api/architect/interpret";

/** Fallback cost shown before the availability probe answers. */
export const ARCHITECT_CHAT_COST_FALLBACK = 1;

export type ArchitectChatTurn = { role: "user" | "assistant"; content: string };

export type ArchitectChatRequest = {
  message: string;
  brief: WorkspaceBrief;
  roomProgram?: RoomProgram;
  conceptProposal?: DesignProposal;
  wallMeshPreset?: WallMeshPreset;
  history: ArchitectChatTurn[];
};

export type ArchitectChatOutcome = {
  type: "patch" | "room_actions" | "concept" | "project" | "reset" | "clarify" | "unsupported";
  reply: string;
  patch?: BriefPatch;
  actions?: RoomAction[];
  proposal?: DesignProposal;
};

export type ArchitectChatStatus = { available: boolean; cost: number };

/** Error carrying the server's structured code and post-failure balance. */
export class ArchitectChatError extends Error {
  code: string | null;
  creditsRemaining: number | null;
  constructor(message: string, options: { code?: string; creditsRemaining?: number } = {}) {
    super(message);
    this.name = "ArchitectChatError";
    this.code = options.code ?? null;
    this.creditsRemaining = options.creditsRemaining ?? null;
  }
}

async function resolveAccessToken(): Promise<string | null> {
  const { getSupabaseBrowserClient } = await import("../../../lib/supabase");

  let supabase: ReturnType<typeof getSupabaseBrowserClient> = null;
  try {
    supabase = getSupabaseBrowserClient();
  } catch {
    supabase = null;
  }
  if (!supabase) return null; // No identity provider configured — server answers 401.

  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
    const expiresAt = data.session?.expires_at;
    const expired =
      typeof token === "string" && typeof expiresAt === "number" && expiresAt * 1000 <= Date.now();
    if (!token || expired) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      token = refreshed?.session?.access_token ?? null;
    }
  } catch {
    token = null;
  }

  if (!token) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(QATTAN_AUTH_REQUIRED_EVENT));
    }
    throw new AuthRequiredError();
  }
  return token;
}

function dispatchCredits(creditsRemaining: unknown): void {
  if (typeof creditsRemaining === "number" && typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(QATTAN_CREDITS_EVENT, { detail: creditsRemaining }));
  }
}

/** Read-only availability + cost probe. Network failure => optimistic default. */
export async function getArchitectChatStatus(): Promise<ArchitectChatStatus> {
  try {
    const response = await fetch(ARCHITECT_INTERPRET_ENDPOINT, { method: "GET" });
    if (!response.ok) {
      return { available: false, cost: ARCHITECT_CHAT_COST_FALLBACK };
    }
    const data = (await response.json()) as Partial<ArchitectChatStatus>;
    return {
      available: data.available !== false,
      cost:
        typeof data.cost === "number" && data.cost > 0
          ? data.cost
          : ARCHITECT_CHAT_COST_FALLBACK,
    };
  } catch {
    // Probe failure says nothing about model configuration; let the send
    // path surface the authoritative error instead of guessing "off".
    return { available: true, cost: ARCHITECT_CHAT_COST_FALLBACK };
  }
}

/**
 * Sends one chat message. Resolves with the server-validated outcome; the
 * caller applies a patch only through applyBriefPatch (never raw).
 */
export async function interpretArchitectMessage(
  request: ArchitectChatRequest,
): Promise<{ outcome: ArchitectChatOutcome; creditsRemaining: number | null }> {
  const accessToken = await resolveAccessToken();

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let response: Response;
  try {
    response = await fetch(ARCHITECT_INTERPRET_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify(request),
    });
  } catch {
    throw new ArchitectChatError("Network error. | خطأ في الشبكة.");
  }

  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    // non-JSON response — handled below
  }
  const record = (data ?? {}) as Record<string, unknown>;
  dispatchCredits(record.creditsRemaining);

  if (!response.ok) {
    throw new ArchitectChatError(
      typeof record.error === "string" && record.error.length > 0
        ? record.error
        : `Request failed with status ${response.status}`,
      {
        code: typeof record.code === "string" ? record.code : undefined,
        creditsRemaining: typeof record.creditsRemaining === "number" ? record.creditsRemaining : undefined,
      },
    );
  }

  const outcome = record.outcome as ArchitectChatOutcome | undefined;
  if (!outcome || typeof outcome.reply !== "string") {
    throw new ArchitectChatError("Malformed response. | استجابة غير صالحة.");
  }
  return {
    outcome,
    creditsRemaining: typeof record.creditsRemaining === "number" ? record.creditsRemaining : null,
  };
}
