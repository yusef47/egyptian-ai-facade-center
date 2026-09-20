import { NextResponse } from "next/server";
import { getSupabaseAdminClient, verifySupabaseUser } from "../../../../lib/credits.js";
import { isAllowedOrigin } from "../../../../lib/origin.js";
import { validateImageDataUrl } from "../../../../lib/image-validation.js";
import { RECEIPT_REPLAY_BILINGUAL, hashReceiptImage } from "../../../../lib/receipt-audit.js";
import {
  TOPUP_AUTH_REQUIRED_BILINGUAL,
  TOPUP_SERVICE_UNAVAILABLE,
  TOPUP_SUBMITTED_BILINGUAL,
  isValidRefCode,
  isReceiptAlreadyUsed,
  submitTopupRequest,
  type PaymentMethod,
} from "../../../../lib/topups.js";

export const runtime = "nodejs";

/**
 * Submit a credit top-up request (Egypt — InstaPay exclusively) through a
 * two-layer pipeline — NO blocking AI receipt audit:
 *
 *   1. Basic file validation — valid image data URL (MIME + magic bytes)
 *      and a minimum size floor.
 *   2. Anti-replay — the receipt image's SHA-256 hash must never have been
 *      submitted before, on any account.
 *
 * Manual admin approval is strictly enforced, so ANY valid image is accepted
 * into the pending queue: users may upload bank-themed, dark-mode, or cropped
 * screenshots that a vision model would misread — the human reviewer in the
 * /admin dashboard (yusefelshater979@gmail.com or archkattan78@gmail.com)
 * cross-references the transfer and approves through the atomic
 * approve_topup RPC. There is NO automatic credit granting.
 *
 * The user id always comes from the verified session, never the body.
 */

/** InstaPay is the only accepted rail; anything else is rejected. */
const PAYMENT_METHODS: PaymentMethod[] = ["instapay"];
const MAX_CREDITS_PER_REQUEST = 500;
/** Layer 1 window: junk-proof but cheap to upload. */
const MIN_RECEIPT_BYTES = 10 * 1024;

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
  // CSRF origin gate — apex, www, Vercel deployments, and localhost are
  // trusted. Payment flows are exactly what cross-site forgery targets.
  if (!isAllowedOrigin(request)) {
    console.log(`[ORIGIN_REJECTED] ${JSON.stringify({ route: "topup/request", origin: request.headers.get("origin") })}`);
    return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

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

  // ── Layer 1: strict file validation (magic bytes + size window) ──
  const receiptCheck = validateImageDataUrl(body.receiptDataUrl);
  if (!receiptCheck.ok) {
    return NextResponse.json({ error: receiptCheck.message }, { status: receiptCheck.status });
  }
  const receiptDataUrl = body.receiptDataUrl as string;
  if (/^data:/i.test(receiptDataUrl)) {
    const base64 = receiptDataUrl.replace(/^data:[^;,]+;base64,/, "");
    const byteLength = Math.floor((base64.length * 3) / 4);
    if (byteLength < MIN_RECEIPT_BYTES) {
      return NextResponse.json(
        {
          error:
            "صورة الإيصال صغيرة جداً أو غير مقروءة. ارفع سكرين شوت واضح للإيصال. | The receipt image is too small or unreadable. Upload a clear screenshot of the receipt.",
        },
        { status: 400 },
      );
    }
  }

  const admin = getSupabaseAdminClient();
  if (!admin) {
    console.log("[TOPUP_NO_ADMIN_CLIENT] SUPABASE env vars missing on server");
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  const receiptHash = hashReceiptImage(receiptDataUrl);

  // ── Layer 2 (anti-replay): has this exact image been submitted before? ──
  const replayed = await isReceiptAlreadyUsed(admin, receiptHash);
  if (replayed === null) {
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }
  if (replayed) {
    console.log(`[TOPUP_REPLAY_BLOCKED] ${JSON.stringify({ userId, receiptHash })}`);
    return NextResponse.json({ error: RECEIPT_REPLAY_BILINGUAL }, { status: 409 });
  }

  // ── Persist the request (pending) with its anti-replay hash ──
  const submission = await submitTopupRequest(admin, userId, {
    credits,
    amountEgp,
    paymentMethod: paymentMethod as PaymentMethod,
    receiptUrl: receiptDataUrl,
    refCode: typeof body.refCode === "string" && isValidRefCode(body.refCode) ? body.refCode : undefined,
    receiptHash,
  });
  if (!submission.ok) {
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }

  // ── Manual admin approval ONLY — never auto-grant ──
  // The request stays 'pending' until an authorized administrator reviews
  // the receipt in /admin and clicks Approve (atomic approve_topup RPC).
  console.log(
    `[TOPUP_REQUESTED] ${JSON.stringify({ userId, credits, amountEgp, refCode: submission.refCode })}`,
  );
  return NextResponse.json({
    ok: true,
    autoApproved: false,
    requestId: submission.requestId,
    refCode: submission.refCode,
    message: TOPUP_SUBMITTED_BILINGUAL,
  });
}
