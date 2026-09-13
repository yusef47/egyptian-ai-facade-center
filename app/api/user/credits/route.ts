import { NextResponse } from "next/server";
import {
  getSupabaseAdminClient,
  refreshDailyCredits,
  verifySupabaseUser,
} from "../../../../lib/credits.js";

export const runtime = "nodejs";

/** The balance changes with every generation — never serve a cached copy. */
export const dynamic = "force-dynamic";

export type UserCreditsPayload = {
  /** The authoritative balance, or null when it genuinely cannot be read. */
  credits: number | null;
  reason?: "supabase_unconfigured" | "profile_unavailable";
};

/**
 * Authoritative daily balance for the signed-in caller.
 *
 * Reads through the SERVICE-ROLE client, so the number never depends on the
 * browser's row-level security — a denied or failed client-side read is how the
 * header badge used to disagree with the database. The 24h refresh rule is
 * applied first, so this is exactly the balance the next generation evaluates.
 *
 * Deliberately a pure read: it never writes, so it is safe to call on every
 * page load. Profile rows are created by the `on_auth_user_created` trigger.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    // Supabase not activated yet: the auth UI (and therefore the badge) is
    // hidden entirely, so report unconfigured rather than invent a number.
    const payload: UserCreditsPayload = {
      credits: null,
      reason: "supabase_unconfigured",
    };
    return NextResponse.json(payload);
  }

  const userId = await verifySupabaseUser(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Sign in with Google to see your daily credits." },
      { status: 401 },
    );
  }

  const credits = await refreshDailyCredits(admin, userId);
  if (credits === null) {
    // No readable profile row. Report UNKNOWN instead of the 10-credit
    // allowance — returning 10 here is exactly how a spent account appeared to
    // still hold 10 after a refresh.
    console.log(`[USER_CREDITS_UNKNOWN] ${JSON.stringify({ userId })}`);
    const payload: UserCreditsPayload = {
      credits: null,
      reason: "profile_unavailable",
    };
    return NextResponse.json(payload);
  }

  console.log(`[USER_CREDITS] ${JSON.stringify({ userId, credits })}`);
  const payload: UserCreditsPayload = { credits };
  return NextResponse.json(payload);
}
