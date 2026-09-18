import { NextResponse } from "next/server";
import { getSupabaseAdminClient, verifySupabaseUser } from "../../../../lib/credits.js";
import { isAllowedOrigin } from "../../../../lib/origin.js";
import {
  TOPUP_AUTH_REQUIRED_BILINGUAL,
  TOPUP_PROMO_INVALID_BILINGUAL,
  TOPUP_PROMO_SUCCESS_BILINGUAL,
  TOPUP_SERVICE_UNAVAILABLE,
  redeemPromoCode,
} from "../../../../lib/topups.js";

export const runtime = "nodejs";

/**
 * Instant promo-code redemption. The code is validated and consumed inside
 * the redeem_promo_code Postgres function (atomic reserve of one use), and
 * the granted credits land on the VERIFIED session's profile — never a
 * user id supplied by the client.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "POST only." }, { status: 405, headers: { Allow: "POST" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  // CSRF origin gate — apex, www, Vercel deployments, and localhost are trusted.
  if (!isAllowedOrigin(request)) {
    console.log(`[ORIGIN_REJECTED] ${JSON.stringify({ route: "topup/promo", origin: request.headers.get("origin") })}`);
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }
  const userId = await verifySupabaseUser(request);
  if (!userId) {
    return NextResponse.json({ error: TOPUP_AUTH_REQUIRED_BILINGUAL }, { status: 401 });
  }

  let body: { code?: unknown };
  try {
    body = (await request.json()) as { code?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request format." }, { status: 400 });
  }

  if (typeof body.code !== "string" || body.code.trim().length === 0) {
    return NextResponse.json({ error: TOPUP_PROMO_INVALID_BILINGUAL }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[PROMO_NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const redemption = await redeemPromoCode(admin, userId, body.code);
  if (!redemption.ok) {
    if (redemption.reason === "invalid") {
      return NextResponse.json({ error: TOPUP_PROMO_INVALID_BILINGUAL }, { status: 400 });
    }
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  console.log(`[PROMO_REDEEMED] ${JSON.stringify({ userId, remaining: redemption.remaining })}`);
  return NextResponse.json({
    ok: true,
    creditsRemaining: redemption.remaining,
    message: TOPUP_PROMO_SUCCESS_BILINGUAL,
  });
}
