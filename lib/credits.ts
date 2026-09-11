import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { CREDIT_REFRESH_MS, DAILY_CREDITS } from "./supabase.js";

/**
 * Server-side credit authority for Qattan AI. Uses the service-role key and
 * must never be imported into client bundles. All functions are null-safe:
 * when Supabase env vars are missing the gate is bypassed so the platform
 * keeps working exactly as before the integration (dev/preview parity).
 */

export type CreditProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  credits: number;
  last_credit_reset: string;
};

export type CreditCheck =
  | { allowed: true; remaining: number; userId?: string }
  | { allowed: false; status: number; message: string };

export type CreditDeduction =
  | { ok: true; remaining?: number }
  | { ok: false; reason: "insufficient" | "unavailable"; remaining?: number };

/** Bilingual exhaustion notice surfaced to users on 429 (gate + deduction). */
export const CREDITS_EXHAUSTED_BILINGUAL =
  "انتهى رصيدك اليومي (10 كريديت)! يتجدد رصيدك أوتوماتيكياً كل 24 ساعة. | Daily credit limit reached (10 credits)! It renews automatically every 24 hours.";

function envConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

let adminClient: SupabaseClient | null = null;

/** Service-role admin client; null until Supabase env vars exist. */
export function getSupabaseAdminClient(): SupabaseClient | null {
  if (!envConfigured()) return null;
  if (!adminClient) {
    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return adminClient;
}

/**
 * Daily refresh rule: if the profile's last reset is older than 24 hours,
 * bring the balance back to the daily allowance before evaluating the gate.
 *
 * CRITICAL correctness rules (production bug fixes):
 * - A null/legacy `last_credit_reset` must NOT force a reset on every call:
 *   we stamp it once and PRESERVE the current balance.
 * - Only a timestamp genuinely older than 24h triggers a reset to the daily
 *   allowance. Anything else returns the stored balance untouched.
 */
export async function refreshDailyCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("credits, last_credit_reset")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return null;

  const currentCredits = typeof data.credits === "number" ? data.credits : null;

  // Legacy row without a reset timestamp: stamp it now, keep the balance.
  if (!data.last_credit_reset) {
    if (currentCredits === null) return null;
    const { error: stampError } = await admin
      .from("profiles")
      .update({ last_credit_reset: new Date().toISOString() })
      .eq("id", userId);
    return stampError ? currentCredits : currentCredits;
  }

  const lastReset = new Date(data.last_credit_reset).getTime();
  if (Number.isNaN(lastReset)) return currentCredits;

  // Reset ONLY when 24h have truly elapsed since the last reset.
  if (Date.now() - lastReset > CREDIT_REFRESH_MS) {
    const nextReset = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update({ credits: DAILY_CREDITS, last_credit_reset: nextReset })
      .eq("id", userId)
      .select("credits")
      .maybeSingle();
    if (updateError) return currentCredits;
    return updated?.credits ?? DAILY_CREDITS;
  }

  return currentCredits;
}

/**
 * Read-only cookie adapter for verifying a session inside a route handler —
 * never writes cookies back on the request.
 */
function getRequestCookieAccessor(request: Request) {
  return {
    getAll: () => {
      const header = request.headers.get("cookie") ?? "";
      return header
        .split(";")
        .map((part) => {
          const index = part.indexOf("=");
          return index < 0
            ? null
            : { name: part.slice(0, index).trim(), value: part.slice(index + 1) };
        })
        .filter((entry): entry is { name: string; value: string } => entry !== null);
    },
    setAll: () => {
      /* Read-only verification inside a route handler — no cookie writes. */
    },
  };
}

/**
 * Verify the caller's Supabase identity. The Authorization bearer token sent
 * by client/src/lib/restore.ts is authoritative; the session cookie serves as
 * a fallback (e.g. after the OAuth callback has just set it). Returns the
 * verified user id, or null when unauthenticated.
 */
export async function verifySupabaseUser(request: Request): Promise<string | null> {
  if (!envConfigured()) return null;
  const { createClient } = await import("@supabase/supabase-js");

  const authorization = request.headers.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token) {
      const bearer = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
          global: {
            headers: { Authorization: `Bearer ${token}` },
          },
        },
      );
      const { data } = await bearer.auth.getUser();
      if (data?.user) return data.user.id;
    }
  }

  const { createServerClient } = await import("@supabase/ssr");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    { cookies: getRequestCookieAccessor(request) },
  );
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

/** Extract the verified user id from an allowed credit check. */
export function getGenerationUserId(creditCheck: CreditCheck): string | undefined {
  return creditCheck.allowed ? creditCheck.userId : undefined;
}

/**
 * Current remaining daily balance for a user (after applying the 24h
 * refresh rule), or null when unknown/unresolvable.
 */
export async function getRemainingCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<number | null> {
  return refreshDailyCredits(admin, userId);
}

/**
 * Gate a generation request: verifies the Supabase session from the request's
 * bearer token (with cookie fallback), applies the 24h refresh rule, and
 * enforces a positive balance. When Supabase is not configured the request is
 * allowed unchanged.
 */
export async function checkGenerationCredits(
  request: Request,
): Promise<CreditCheck> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { allowed: true, remaining: DAILY_CREDITS };

  const userId = await verifySupabaseUser(request);
  if (!userId) {
    return {
      allowed: false,
      status: 401,
      message: "Sign in with Google to generate. Every account gets 10 free credits daily.",
    };
  }

  const credits = await refreshDailyCredits(admin, userId);
  if (credits === null) {
    // Profile missing (trigger not yet applied): provision on first use.
    // ignoreDuplicates is ESSENTIAL — a plain upsert would overwrite an
    // existing row's balance back to the daily allowance.
    const { data: created, error: createError } = await admin
      .from("profiles")
      .upsert(
        { id: userId, credits: DAILY_CREDITS, last_credit_reset: new Date().toISOString() },
        { onConflict: "id", ignoreDuplicates: true },
      )
      .select("credits")
      .maybeSingle();
    if (createError) {
      return { allowed: false, status: 503, message: "Credit service unavailable. Try again shortly." };
    }
    // ignoreDuplicates can return no row when a concurrent provision won the
    // race — read the authoritative row instead of wrongly reporting 429.
    let balance = created?.credits ?? null;
    if (balance === null) {
      const { data: existing } = await admin
        .from("profiles")
        .select("credits")
        .eq("id", userId)
        .maybeSingle();
      balance = typeof existing?.credits === "number" ? existing.credits : null;
    }
    return balance !== null && balance > 0
      ? { allowed: true, remaining: balance, userId }
      : { allowed: false, status: 429, message: CREDITS_EXHAUSTED_BILINGUAL };
  }

  return credits > 0
    ? { allowed: true, remaining: credits, userId }
    : {
        allowed: false,
        status: 429,
        message: CREDITS_EXHAUSTED_BILINGUAL,
      };
}

/**
 * Argument-name strategies for the credit RPCs.
 *
 * Postgres identifies a function by its argument TYPES, not their names, and
 * `CREATE OR REPLACE FUNCTION` cannot rename an input parameter. A database
 * whose functions were created under the older names therefore keeps them, and
 * PostgREST answers a call made with the wrong names as
 * `PGRST202: Could not find the function …`. We call with the canonical names
 * first and transparently retry with the legacy names, so the app works
 * against either deployed signature.
 */
const CREDIT_RPC_PRIMARY = { user: "user_id", amount: "p_amount" } as const;
const CREDIT_RPC_LEGACY = { user: "p_user_id", amount: "p_amount" } as const;

type CreditRpcName = "deduct_credit" | "refund_credit";
type RpcResponse = { data: unknown; error: { code?: string; message?: string } | null };

/** Raw server-side trace of every credit RPC call (never user-visible). */
function logRpcRaw(rpcName: CreditRpcName, argName: string, response: RpcResponse): void {
  console.log(
    `[RPC_RAW_RESPONSE] ${JSON.stringify({
      rpcName,
      args: argName,
      data: response.data,
      error: response.error?.message ?? null,
      code: response.error?.code ?? null,
    })}`,
  );
}

/** True when the RPC could not be resolved — i.e. an argument-name mismatch. */
function isMissingFunctionError(error: RpcResponse["error"]): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  return /could not find the function|does not exist|no function matches/i.test(error.message ?? "");
}

/**
 * Calls a credit RPC, retrying once with the legacy argument names when the
 * canonical signature is absent from the database.
 */
async function callCreditRpc(
  admin: SupabaseClient,
  rpcName: CreditRpcName,
  userId: string,
  amount?: number,
): Promise<RpcResponse> {
  const argsFor = (names: { user: string; amount: string }) =>
    amount === undefined
      ? { [names.user]: userId }
      : { [names.user]: userId, [names.amount]: amount };

  const primary = (await admin.rpc(rpcName, argsFor(CREDIT_RPC_PRIMARY))) as RpcResponse;
  logRpcRaw(rpcName, CREDIT_RPC_PRIMARY.user, primary);
  if (!isMissingFunctionError(primary.error)) return primary;

  const legacy = (await admin.rpc(rpcName, argsFor(CREDIT_RPC_LEGACY))) as RpcResponse;
  logRpcRaw(rpcName, CREDIT_RPC_LEGACY.user, legacy);
  console.log(
    `[RPC_ARG_FALLBACK] ${JSON.stringify({
      rpcName,
      from: CREDIT_RPC_PRIMARY.user,
      to: CREDIT_RPC_LEGACY.user,
      ok: !legacy.error,
    })}`,
  );
  return legacy;
}

/** PostgREST returns a plain scalar for `returns integer`; tolerate shapes. */
function parseScalar(data: unknown): number {
  if (typeof data === "number") return data;
  if (Array.isArray(data) && data.length > 0) return parseScalar(data[0]);
  if (typeof data === "object" && data !== null && "credits" in data) {
    return Number((data as Record<string, unknown>).credits);
  }
  return Number.NaN;
}

/**
 * Deduct one credit after a successful generation, atomically, via the
 * `deduct_credit` RPC (see supabase/migrations). The RPC decrements only
 * when credits > 0 and returns the authoritative remaining balance, so
 * concurrent requests can never drain a balance below zero.
 */
export async function deductGenerationCredit(userId: string): Promise<CreditDeduction> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: true, remaining: DAILY_CREDITS };
  return deductGenerationCreditWithAdmin(admin, userId);
}

/** Deduction core, factored out for direct service-role/test injection. */
export async function deductGenerationCreditWithAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditDeduction> {
  // Service-role client: bypasses RLS, updates credits AND generations_used
  // atomically inside the deduct_credit Postgres function.
  const { data, error } = await callCreditRpc(admin, "deduct_credit", userId, 1);

  if (error) {
    const code = error.code;
    // Server-side diagnostics: the exact RPC failure reason (missing function,
    // permission, signature mismatch, or the explicit insufficient-credits
    // raise) — never surfaced to users, only visible in server logs.
    console.log(`[RPC_DEDUCT_ERROR] code=${code ?? "unknown"} message=${(error.message ?? "").slice(0, 200)}`);
    // P0001 = the RPC's explicit "insufficient credits" raise. Anything else
    // (missing function, permission, connectivity) is an infrastructure
    // failure and must never be reported to the user as an empty balance.
    return code === "P0001"
      ? { ok: false, reason: "insufficient", remaining: 0 }
      : { ok: false, reason: "unavailable" };
  }

  const remaining = parseScalar(data);
  if (!Number.isFinite(remaining)) console.log("[RPC_EMPTY_RESULT] deduct_credit returned no scalar");
  return Number.isFinite(remaining) ? { ok: true, remaining } : { ok: true };
}

/**
 * Compensating transaction for failed generations: refunds exactly one
 * credit (and decrements generations_used) after a successful deduction.
 * Uses the same service-role authority as the deduction.
 */
export async function refundGenerationCredit(userId: string): Promise<CreditDeduction> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: true, remaining: DAILY_CREDITS };
  return refundGenerationCreditWithAdmin(admin, userId);
}

/** Refund core, factored out for direct service-role/test injection. */
export async function refundGenerationCreditWithAdmin(
  admin: SupabaseClient,
  userId: string,
): Promise<CreditDeduction> {
  const { data, error } = await callCreditRpc(admin, "refund_credit", userId);
  if (error) {
    console.log(
      `[RPC_REFUND_ERROR] code=${error.code ?? "unknown"} message=${(error.message ?? "").slice(0, 200)}`,
    );
    return { ok: false, reason: "unavailable" };
  }
  const remaining = parseScalar(data);
  return Number.isFinite(remaining) ? { ok: true, remaining } : { ok: true };
}
