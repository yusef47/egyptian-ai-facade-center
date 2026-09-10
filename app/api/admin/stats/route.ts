import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/credits.js";
import { authorizeAdmin } from "../../../../lib/admin.js";

export const runtime = "nodejs";

/**
 * Platform statistics for the /admin dashboard. Every request is authorized
 * server-side against the verified Supabase identity (owner + ADMIN_EMAILS).
 * Stats come from the admin_platform_stats / admin_recent_profiles RPCs so
 * the aggregates run over the whole profiles table regardless of RLS.
 */

export type AdminStatsPayload = {
  configured: boolean;
  stats: {
    totalUsers: number;
    totalGenerations: number;
    totalCreditsRemaining: number;
    activeUsers: number;
  };
  recent: {
    id: string;
    email: string | null;
    fullName: string | null;
    credits: number;
    generationsUsed: number;
    lastCreditReset: string | null;
    createdAt: string | null;
  }[];
};

function emptyStats(): AdminStatsPayload["stats"] {
  return { totalUsers: 0, totalGenerations: 0, totalCreditsRemaining: 0, activeUsers: 0 };
}

export async function GET(request: Request): Promise<NextResponse> {
  const admin = getSupabaseAdminClient();
  if (!admin) {
    // Supabase not activated yet — render the dashboard in zeroed/dormant
    // mode (it still only ever shows for an authorized operator once auth
    // goes live; until then the page itself renders the sign-in state).
    const payload: AdminStatsPayload = {
      configured: false,
      stats: emptyStats(),
      recent: [],
    };
    return NextResponse.json(payload);
  }

  const gate = await authorizeAdmin(request, admin);
  if (!gate.authorized) {
    return NextResponse.json(
      {
        error:
          gate.reason === "unauthenticated"
            ? "Sign in with Google to access the admin dashboard."
            : "This dashboard is restricted to authorized Qattan administrators.",
      },
      { status: gate.reason === "unauthenticated" ? 401 : 403 },
    );
  }

  // Preferred path: the SQL RPCs. If they're not applied yet (or the
  // function signature changed), fall back to direct service-role queries
  // against the profiles table so the dashboard NEVER shows all-zeros while
  // real user data exists.
  const [statsResult, recentResult] = await Promise.all([
    admin.rpc("admin_platform_stats"),
    admin.rpc("admin_recent_profiles", { p_limit: 200 }),
  ]);

  const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);

  let stats: AdminStatsPayload["stats"] | null = null;
  if (!statsResult.error) {
    const raw = Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data;
    const statsRow = (raw ?? {}) as Record<string, unknown>;
    stats = {
      totalUsers: num(statsRow.total_users),
      totalGenerations: num(statsRow.total_generations),
      totalCreditsRemaining: num(statsRow.total_credits_remaining),
      activeUsers: num(statsRow.active_users),
    };
  }

  let recent: AdminStatsPayload["recent"] | null = null;
  if (!recentResult.error) {
    const recentRows = (Array.isArray(recentResult.data) ? recentResult.data : []) as Record<
      string,
      unknown
    >[];
    recent = recentRows.map((row) => {
      const entry = row as Record<string, unknown>;
      return {
        id: String(entry.id ?? ""),
        email: typeof entry.email === "string" ? entry.email : null,
        fullName: typeof entry.full_name === "string" ? entry.full_name : null,
        credits: num(entry.credits),
        generationsUsed: num(entry.generations_used),
        lastCreditReset:
          typeof entry.last_credit_reset === "string" ? entry.last_credit_reset : null,
        createdAt: typeof entry.created_at === "string" ? entry.created_at : null,
      };
    });
  }

  // Direct-query fallback (also used when either RPC is missing).
  if (!stats || !recent) {
    const { data: rows, error: rowsError } = await admin
      .from("profiles")
      .select("id, email, full_name, credits, generations_used, last_credit_reset, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    if (rowsError && !stats && !recent) {
      return NextResponse.json(
        { error: "Admin statistics are unavailable (profiles table not reachable)." },
        { status: 503 },
      );
    }

    const allRows = (rows ?? []) as Record<string, unknown>[];
    if (!stats) {
      stats = {
        totalUsers: allRows.length,
        totalGenerations: allRows.reduce((sum, row) => sum + num(row.generations_used), 0),
        totalCreditsRemaining: allRows.reduce((sum, row) => sum + num(row.credits), 0),
        // Note: with the fallback we can't see rows beyond the 200 fetched;
        // activeUsers is computed over the fetched window.
        activeUsers: allRows.filter((row) => {
          const ts = typeof row.last_credit_reset === "string" ? Date.parse(row.last_credit_reset) : NaN;
          return Number.isFinite(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
        }).length,
      };
    }
    if (!recent) {
      recent = allRows.map((row) => ({
        id: String(row.id ?? ""),
        email: typeof row.email === "string" ? row.email : null,
        fullName: typeof row.full_name === "string" ? row.full_name : null,
        credits: num(row.credits),
        generationsUsed: num(row.generations_used),
        lastCreditReset:
          typeof row.last_credit_reset === "string" ? row.last_credit_reset : null,
        createdAt: typeof row.created_at === "string" ? row.created_at : null,
      }));
    }
  }

  const payload: AdminStatsPayload = { configured: true, stats, recent };
  return NextResponse.json(payload);
}
