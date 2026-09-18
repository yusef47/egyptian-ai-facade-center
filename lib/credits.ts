import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { DAILY_CREDITS } from "./supabase.js";

/**
 * Server-side credit authority for Qattan AI. Uses the service-role key and
 * must never be imported into client bundles.
 *
 * Everything here FAILS CLOSED. When the Supabase environment variables are
 * missing there is no way to verify a caller or charge a credit, so the gate
 * refuses the request (401/503) instead of allowing an unauthenticated
 * generation. That is deliberate: a permissive fallback here is exactly what
 * let generations escape the credit ledger.
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
  "انتهى رصيدك اليومي (10 كريديت)! يتجدد رصيدك تلقائياً عند منتصف الليل (12 صباحاً) بتوقيت القاهرة. | Daily credit limit reached (10 credits)! Your balance resets automatically at 12:00 AM Cairo time.";

/**
 * Bilingual sign-in notice surfaced on 401. Generation requires a verified
 * Supabase session, because the credit is charged to that identity.
 */
export const AUTH_REQUIRED_BILINGUAL =
  "تسجيل الدخول مطلوب لتجربة الأدوات | Sign in with Google to generate — every account gets 10 free credits daily.";

/** Service-role credit authority is unreachable (missing/!env or RPC failure). */
export const CREDIT_SERVICE_UNAVAILABLE = "Credit service unavailable. Try again shortly.";

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
 * Cairo is the operational clock for the daily allowance: every user's free
 * credits replenish at 12:00 AM (midnight) Africa/Cairo each calendar day.
 */
const CAIRO_TIME_ZONE = "Africa/Cairo";

type CairoWallClock = { year: number; month: number; day: number; hour: number; minute: number };

function cairoWallClock(instant: Date): CairoWallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAIRO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
  };
}

/**
 * The UTC instant whose Cairo wall clock is exactly `hour`:00 of the given
 * Cairo calendar date. Cairo alternates between UTC+2 (EET) and UTC+3 (EEST
 * summer time), so both offsets are probed and the one that renders back as
 * the requested wall clock wins. Egypt's DST transitions happen at NOON, so
 * midnight wall time always exists — the loop below always resolves; the
 * trailing default is pure defense-in-depth against future tzdb changes.
 */
function cairoInstantFor(date: { year: number; month: number; day: number }, hour: number): Date {
  for (const offsetMinutes of [180, 120]) {
    const candidate = new Date(
      Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0) - offsetMinutes * 60_000,
    );
    const wall = cairoWallClock(candidate);
    if (
      wall.year === date.year &&
      wall.month === date.month &&
      wall.day === date.day &&
      wall.hour === hour &&
      wall.minute === 0
    ) {
      return candidate;
    }
  }
  return new Date(Date.UTC(date.year, date.month - 1, date.day, hour, 0, 0) - 120 * 60_000);
}

/**
 * Today's 12:00 AM (00:00) midnight in Cairo, as a UTC instant. Any profile
 * stamped before this moment belongs to a previous Cairo day and is due for
 * the daily allowance; anything stamped at or after it is current.
 */
export function lastCairoMidnight(now: Date = new Date()): Date {
  const wall = cairoWallClock(now);
  return cairoInstantFor({ year: wall.year, month: wall.month, day: wall.day }, 0);
}

/**
 * The Cairo calendar date (YYYY-MM-DD) of an instant, derived from the IANA
 * Africa/Cairo zone via Intl. Comparing these STRINGS is a strict calendar-day
 * comparison — '2026-09-18' < '2026-09-19' — immune to hours, minutes,
 * seconds, and DST offset drift (EET/EEST never enter the decision).
 */
export function getCairoDateString(instant: Date): string {
  const wall = cairoWallClock(instant);
  return `${wall.year}-${String(wall.month).padStart(2, "0")}-${String(wall.day).padStart(2, "0")}`;
}

/**
 * Daily refresh rule: the balance returns to the full daily allowance whenever
 * the stored stamp's CAIRO CALENDAR DATE is earlier than today's Cairo date,
 * regardless of the previous balance (0, 2, or 5) and regardless of hours,
 * minutes, or seconds. Within the same Cairo day the stored balance is
 * untouched.
 *
 * CRITICAL correctness rules (production bug fixes):
 * - The reset writes `credits` AND `last_credit_reset` in the SAME update, so
 *   a null/legacy timestamp triggers the allowance exactly once — never on
 *   every call.
 * - The boundary is a strict date-string comparison ('2026-09-18' <
 *   '2026-09-19'), not a rolling 24h window: generating at 23:59 Cairo and
 *   again at 00:01 means a fresh allowance, while generating twice in one
 *   afternoon never re-gifts.
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
  if (currentCredits === null) return null;

  const todayCairoDate = getCairoDateString(new Date());
  const lastResetCairoDate = data.last_credit_reset
    ? getCairoDateString(new Date(data.last_credit_reset))
    : null;

  // Reset when there is no usable stamp OR the last reset happened on an
  // earlier Cairo calendar day.
  if (!lastResetCairoDate || lastResetCairoDate < todayCairoDate) {
    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update({ credits: DAILY_CREDITS, last_credit_reset: new Date().toISOString() })
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
 * Current remaining daily balance for a user (after applying the Cairo
 * midnight refresh rule), or null when unknown/unresolvable.
 */
export async function getRemainingCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<number | null> {
  return refreshDailyCredits(admin, userId);
}

/**
 * Plain authoritative read of the balance straight from the service-role
 * client (no refresh rule, no RPC). Used so the generation response ALWAYS
 * carries a numeric `creditsRemaining`: a credit RPC that succeeds but whose
 * scalar return cannot be parsed used to yield null, which silently stopped
 * the header badge from ever updating after a generation.
 */
export async function readProfileCredits(
  admin: SupabaseClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("credits")
    .eq("id", userId)
    .maybeSingle();
  if (error) return null;
  return typeof data?.credits === "number" ? data.credits : null;
}

/**
 * Gate a generation request: verifies the Supabase session from the request's
 * bearer token (with cookie fallback), applies the Cairo midnight refresh
 * rule, and enforces a positive balance. When Supabase is not configured the
 * request is refused (fail closed).
 */
export async function checkGenerationCredits(
  request: Request,
): Promise<CreditCheck> {
  const admin = getSupabaseAdminClient();
  // Fail closed: without the service-role client we cannot verify a caller or
  // charge a credit, so no generation may proceed.
  if (!admin) {
    return { allowed: false, status: 503, message: CREDIT_SERVICE_UNAVAILABLE };
  }

  const userId = await verifySupabaseUser(request);
  if (!userId) {
    return {
      allowed: false,
      status: 401,
      message: AUTH_REQUIRED_BILINGUAL,
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
      return { allowed: false, status: 503, message: CREDIT_SERVICE_UNAVAILABLE };
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
  // No service-role client → the deduction cannot happen, so the generation
  // must not happen either. Never report a successful charge we didn't make.
  if (!admin) {
    console.log("[CREDIT_DEDUCT_UNAVAILABLE] service-role client missing");
    return { ok: false, reason: "unavailable" };
  }
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
  if (!admin) {
    console.log("[CREDIT_REFUND_UNAVAILABLE] service-role client missing");
    return { ok: false, reason: "unavailable" };
  }
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
