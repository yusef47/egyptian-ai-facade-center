import { NextResponse } from "next/server";
import { getSupabaseAdminClient, verifySupabaseUser } from "../../../../lib/credits.js";
import { validateImageDataUrl } from "../../../../lib/image-validation.js";
import {
  TOPUP_AUTH_REQUIRED_BILINGUAL,
  TOPUP_SERVICE_UNAVAILABLE,
  isValidRefCode,
  submitTopupRequest,
  type PaymentMethod,
} from "../../../../lib/topups.js";

export const runtime = "nodejs";

/**
 * Submit a credit top-up request (Egypt — InstaPay exclusively).
 *
 * Flow: verify the Supabase session (bearer token, cookie fallback) →
 * validate the requested pack against the FIXED price table server-side
 * (the client never dictates pricing) → validate the receipt screenshot as a
 * genuine image → insert the pending request through the service-role client.
 * The user id always comes from the verified session, never the body.
 */

/** InstaPay is the only accepted rail; anything else is rejected. */
const PAYMENT_METHODS: PaymentMethod[] = ["instapay"];
const MAX_CREDITS_PER_REQUEST = 500;

type TopupRequestBody = {
  credits?: unknown;
  amountEgp?: unknown;
  paymentMethod?: unknown;
  receiptDataUrl?: unknown;
  /** Reference code shown in the modal's payment instructions. */
  refCode?: unknown;
};

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "POST only." },
    { status: 405, headers: { Allow: "POST" } },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const userId = await verifySupabaseUser(request);
  if (!userId) {
    return NextResponse.json({ error: TOPUP_AUTH_REQUIRED_BILINGUAL }, { status: 401 });
  }

  let body: TopupRequestBody;
  try {
    body = (await request.json()) as TopupRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid request format." }, { status: 400 });
  }

  // ── Validate the credit amount against the fixed server-side pricing ──
  const credits = typeof body.credits === "number" ? Math.round(body.credits) : NaN;
  const amountEgp = typeof body.amountEgp === "number" ? body.amountEgp : NaN;
  if (!Number.isFinite(credits) || credits < 10 || credits > MAX_CREDITS_PER_REQUEST) {
    return NextResponse.json(
      { error: "اختر بين 10 و500 كريديت. | Choose between 10 and 500 credits." },
      { status: 400 },
    );
  }
  // Pricing is authoritative server-side: 4.5 EGP/credit only for the exact
  // 100-credit pack, otherwise 5 EGP/credit.
  const expectedEgp = credits === 100 ? 4.5 * credits : 5 * credits;
  if (!Number.isFinite(amountEgp) || Math.abs(amountEgp - expectedEgp) > 0.01) {
    return NextResponse.json({ error: "Invalid amount for the selected credits." }, { status: 400 });
  }

  const paymentMethod = body.paymentMethod;
  if (
    typeof paymentMethod !== "string" ||
    !PAYMENT_METHODS.includes(paymentMethod as PaymentMethod)
  ) {
    return NextResponse.json(
      { error: "الدفع عبر InstaPay فقط. | InstaPay is the only accepted payment method." },
      { status: 400 },
    );
  }

  // ── Receipt: must be a genuine image (MIME + magic bytes), max 10MB ──
  const receiptCheck = validateImageDataUrl(body.receiptDataUrl);
  if (!receiptCheck.ok) {
    return NextResponse.json({ error: receiptCheck.message }, { status: receiptCheck.status });
  }

  // ── Reference code: honor the code the user already wrote on the transfer,
  // but only in the exact REF-###### shape; anything else is regenerated.
  const refCode =
    typeof body.refCode === "string" && isValidRefCode(body.refCode)
      ? body.refCode
      : undefined;

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[TOPUP_NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const submission = await submitTopupRequest(admin, userId, {
    credits,
    amountEgp,
    paymentMethod: paymentMethod as PaymentMethod,
    receiptUrl: body.receiptDataUrl as string,
    refCode,
  });
  if (!submission.ok) {
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  console.log(
    `[TOPUP_REQUESTED] ${JSON.stringify({ userId, credits, amountEgp, refCode: submission.refCode })}`,
  );
  return NextResponse.json({
    ok: true,
    requestId: submission.requestId,
    refCode: submission.refCode,
    message:
      "تم إرسال طلب الشحن بنجاح! سيتم مراجعته من الإدارة قريباً. | Top-up request submitted! It will be reviewed shortly.",
  });
}
