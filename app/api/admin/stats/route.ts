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

  const [statsResult, recentResult] = await Promise.all([
    admin.rpc("admin_platform_stats"),
    admin.rpc("admin_recent_profiles", { p_limit: 20 }),
  ]);

  if (statsResult.error) {
    return NextResponse.json(
      { error: "Admin statistics are unavailable (migration not applied yet)." },
      { status: 503 },
    );
  }

  const raw = Array.isArray(statsResult.data) ? statsResult.data[0] : statsResult.data;
  const statsRow = (raw ?? {}) as Record<string, unknown>;
  const num = (value: unknown): number => (typeof value === "number" ? value : Number(value) || 0);

  const recentRows = (Array.isArray(recentResult.data) ? recentResult.data : []) as Record<
    string,
    unknown
  >[];
  const recent = recentRows.map((row) => {
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

  const payload: AdminStatsPayload = {
    configured: true,
    stats: {
      totalUsers: num(statsRow.total_users),
      totalGenerations: num(statsRow.total_generations),
      totalCreditsRemaining: num(statsRow.total_credits_remaining),
      activeUsers: num(statsRow.active_users),
    },
    recent,
  };
  return NextResponse.json(payload);
}
