import { NextResponse } from "next/server";
import { getSupabaseAdminClient, verifySupabaseUser } from "../../../../lib/credits.js";
import { validateImageDataUrl } from "../../../../lib/image-validation.js";
import {
  RECEIPT_INVALID_BILINGUAL,
  RECEIPT_REPLAY_BILINGUAL,
  auditReceipt,
  hashReceiptImage,
} from "../../../../lib/receipt-audit.js";
import {
  TOPUP_AUTH_REQUIRED_BILINGUAL,
  TOPUP_SERVICE_UNAVAILABLE,
  isValidRefCode,
  grantTopupInstantly,
  isReceiptAlreadyUsed,
  submitTopupRequest,
  type PaymentMethod,
} from "../../../../lib/topups.js";

export const runtime = "nodejs";

/**
 * Submit a credit top-up request (Egypt — InstaPay exclusively) through a
 * four-layer anti-fraud pipeline:
 *
 *   1. Strict file validation — MIME + magic bytes + size window.
 *   2. AI receipt audit — vision verdict that the screenshot is a genuine,
 *      SUCCESSFUL transfer to the Qattan InstaPay address (high confidence).
 *   3. Anti-replay — the receipt image's SHA-256 hash must never have been
 *      submitted before, on any account.
 *   4. Instant auto-grant — all layers pass → the pending request is claimed
 *      atomically (approve_topup RPC) and credits land immediately; the
 *      response carries creditsRemaining so the header badge updates live.
 *
 * The user id always comes from the verified session, never the body.
 */

/** InstaPay is the only accepted rail; anything else is rejected. */
const PAYMENT_METHODS: PaymentMethod[] = ["instapay"];
const MAX_CREDITS_PER_REQUEST = 500;
/** Layer 1 window: junk-proof but cheap to upload. */
const MIN_RECEIPT_BYTES = 10 * 1024;
/** Instant grant only when the vision verdict is unambiguous. */
const INSTANT_GRANT_MAX_AMOUNT = 10_000;

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

  const apiKey = process.env.OPENROUTER_API_KEY;
  const receiptHash = hashReceiptImage(receiptDataUrl);

  // ── Layer 2: AI receipt audit (before any ledger row is written) ──
  if (!apiKey) {
    console.log("[TOPUP_NO_AUDIT_KEY] OPENROUTER_API_KEY missing — audit unavailable");
    return NextResponse.json({ error: TOPUP_SERVICE_UNAVAILABLE }, { status: 503 });
  }
  const audit = await auditReceipt(receiptDataUrl, apiKey);
  if (!audit.ok) {
    // A failed/ambiguous audit must NEVER become a silent pass: fail closed
    // and let the user retry with a clearer screenshot.
    console.log(`[TOPUP_AUDIT_UNAVAILABLE] reason=${audit.reason}`);
    return NextResponse.json(
      {
        error:
          "تعذر فحص الإيصال الآن. يرجى المحاولة مجدداً بعد قليل. | The receipt could not be verified right now. Please try again shortly.",
      },
      { status: 502 },
    );
  }
  const { verdict } = audit;
  console.log(
    `[TOPUP_AUDIT] ${JSON.stringify({
      userId,
      isValid: verdict.isValidReceipt,
      confidence: verdict.confidence,
      detectedAmount: verdict.detectedAmount,
      reason: verdict.reason,
    })}`,
  );
  if (!verdict.isValidReceipt || verdict.confidence !== "high") {
    return NextResponse.json({ error: RECEIPT_INVALID_BILINGUAL }, { status: 422 });
  }
  // Sanity cross-check: the detected transfer amount should roughly match the
  // requested pack (allow a 10% tolerance for rounding in receipt renders).
  if (
    verdict.detectedAmount > 0 &&
    Math.abs(verdict.detectedAmount - amountEgp) > amountEgp * 0.1
  ) {
    return NextResponse.json(
      {
        error:
          "مبلغ التحويل في الإيصال لا يطابق الباقة المطلوبة. | The amount on the receipt does not match the selected pack.",
      },
      { status: 422 },
    );
  }

  // ── Layer 3: anti-replay — has this exact image been submitted before? ──
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

  // ── Layer 4: instant auto-grant on a clean high-confidence pass ──
  if (verdict.detectedAmount <= INSTANT_GRANT_MAX_AMOUNT) {
    const grant = await grantTopupInstantly(admin, submission.requestId);
    if (grant.ok) {
      console.log(
        `[TOPUP_INSTANT_GRANT] ${JSON.stringify({
          userId,
          credits,
          newBalance: grant.remaining,
          refCode: submission.refCode,
        })}`,
      );
      return NextResponse.json({
        ok: true,
        autoApproved: true,
        requestId: submission.requestId,
        refCode: submission.refCode,
        creditsRemaining: grant.remaining,
        message:
          "تم شحن رصيدك فوراً! | Credits added instantly — thank you!",
      });
    }
    // Grant failed (racing admin, infra hiccup) — the request stays pending
    // for manual review instead of erroring the user out.
    console.log(
      `[TOPUP_INSTANT_GRANT_DEFERRED] ${JSON.stringify({
        userId,
        requestId: submission.requestId,
        reason: grant.reason,
      })}`,
    );
  }

  console.log(
    `[TOPUP_REQUESTED] ${JSON.stringify({ userId, credits, amountEgp, refCode: submission.refCode })}`,
  );
  return NextResponse.json({
    ok: true,
    autoApproved: false,
    requestId: submission.requestId,
    refCode: submission.refCode,
    message:
      "تم إرسال طلب الشحن بنجاح! سيتم مراجعته من الإدارة قريباً. | Top-up request submitted! It will be reviewed shortly.",
  });
}
