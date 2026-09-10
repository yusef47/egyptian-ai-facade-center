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

export type CreditDeduction = {
  ok: boolean;
  remaining?: number;
};

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

  const lastReset = data.last_credit_reset ? new Date(data.last_credit_reset).getTime() : 0;
  if (Number.isNaN(lastReset)) return data.credits ?? null;

  if (Date.now() - lastReset > CREDIT_REFRESH_MS) {
    const nextReset = new Date().toISOString();
    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update({ credits: DAILY_CREDITS, last_credit_reset: nextReset })
      .eq("id", userId)
      .select("credits")
      .maybeSingle();
    if (updateError) return data.credits ?? null;
    return updated?.credits ?? DAILY_CREDITS;
  }

  return data.credits ?? null;
}

/**
 * Gate a generation request: verifies the Supabase session from the request's
 * cookies, applies the 24h refresh rule, and enforces a positive balance.
 * When Supabase is not configured the request is allowed unchanged.
 */
export async function checkGenerationCredits(
  request: Request,
): Promise<CreditCheck> {
  const admin = getSupabaseAdminClient();
  if (!admin) return { allowed: true, remaining: DAILY_CREDITS };

  const { createServerClient } = await import("@supabase/ssr");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  const supabase = createServerClient(url, anon, {
    cookies: {
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
    },
  });

  const { data } = await supabase.auth.getUser();
  const user = data?.user;
  if (!user) {
    return {
      allowed: false,
      status: 401,
      message: "Sign in with Google to generate. Every account gets 10 free credits daily.",
    };
  }

  const credits = await refreshDailyCredits(admin, user.id);
  if (credits === null) {
    // Profile missing (trigger not yet applied): provision on first use.
    const { data: created, error: createError } = await admin
      .from("profiles")
      .upsert(
        { id: user.id, email: user.email ?? null, credits: DAILY_CREDITS, last_credit_reset: new Date().toISOString() },
        { onConflict: "id" },
      )
      .select("credits")
      .maybeSingle();
    if (createError) {
      return { allowed: false, status: 503, message: "Credit service unavailable. Try again shortly." };
    }
    return created && created.credits > 0
      ? { allowed: true, remaining: created.credits, userId: user.id }
      : { allowed: false, status: 429, message: "Daily credit limit reached. Credits renew every 24 hours." };
  }

  return credits > 0
    ? { allowed: true, remaining: credits, userId: user.id }
    : {
        allowed: false,
        status: 429,
        message: "Daily credit limit reached. Credits renew every 24 hours.",
      };
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
  const { data, error } = await admin.rpc("deduct_credit", {
    p_user_id: userId,
    p_amount: 1,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    // P0001 = the RPC's explicit "insufficient credits" raise.
    if (code === "P0001") return { ok: false, remaining: 0 };
    return { ok: false };
  }

  const remaining =
    typeof data === "number"
      ? data
      : typeof data === "object" && data !== null && "credits" in (data as Record<string, unknown>)
        ? Number((data as Record<string, unknown>).credits)
        : Number.NaN;

  return Number.isFinite(remaining) ? { ok: true, remaining } : { ok: true };
}
