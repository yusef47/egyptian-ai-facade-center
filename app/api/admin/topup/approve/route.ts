import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../../lib/credits.js";
import { authorizeAdmin } from "../../../../../lib/admin.js";
import { TOPUP_SERVICE_UNAVAILABLE, approveTopupRequest } from "../../../../../lib/topups.js";
import { isAllowedOrigin } from "../../../../../lib/origin.js";

export const runtime = "nodejs";

/**
 * Admin decision endpoint for the top-up queue (approve / reject).
 *
 * Authorization is enforced server-side via authorizeAdmin (verified Supabase
 * identity against the owner email + ADMIN_EMAILS) BEFORE any RPC executes.
 * Approvals run through the atomic approve_topup RPC — a repeated or
 * concurrent approve of the same request can never double-credit because the
 * RPC only flips a 'pending' row exactly once.
 */

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "POST only." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  // CSRF origin gate — apex, www, Vercel deployments, and localhost are trusted.
  if (!isAllowedOrigin(request)) {
    console.log(`[ORIGIN_REJECTED] ${JSON.stringify({ route: "admin/topup/approve", origin: request.headers.get("origin") })}`);
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[TOPUP_ADMIN_NO_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const gate = await authorizeAdmin(request, admin);
  if (!gate.authorized) {
    return NextResponse.json(
      {
        error:
          gate.reason === "unauthenticated"
            ? "Sign in with Google to manage top-up requests."
            : "This action is restricted to authorized Qattan administrators.",
      },
      { status: gate.reason === "unauthenticated" ? 401 : 403 },
    );
  }

  let body: { requestId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { requestId?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request format." }, { status: 400 });
  }

  const requestId = typeof body.requestId === "string" ? body.requestId : "";
  const action = body.action;

  if (action === "approve") {
    const result = await approveTopupRequest(admin, requestId);
    if (!result.ok) {
      // The request was already handled (or the id is bogus): tell the
      // operator it is no longer actionable instead of erroring the UI.
      if (result.reason === "not_pending") {
        return NextResponse.json(
          { ok: false, error: "This request is no longer pending." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
    }
    console.log(
      `[TOPUP_APPROVED] ${JSON.stringify({ requestId, adminId: gate.userId, remaining: result.remaining })}`,
    );
    return NextResponse.json({ ok: true, creditsRemaining: result.remaining });
  }

  if (action === "reject") {
    // Guarded update: only a still-pending row flips to rejected. Re-running
    // a reject on an approved request is refused, never destructive.
    const { data, error } = await admin
      .from("topup_requests")
      .update({ status: "rejected", reviewed_at: new Date().toISOString(), reviewed_by: gate.userId })
      .eq("id", requestId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) {
      console.log(`[TOPUP_REJECT_ERROR] code=${error.code ?? "unknown"} message=${(error.message ?? "").slice(0, 160)}`);
      return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "This request is no longer pending." },
        { status: 409 },
      );
    }
    console.log(`[TOPUP_REJECTED] ${JSON.stringify({ requestId, adminId: gate.userId })}`);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
