import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side top-up & promo authority for Qattan AI. Uses the service-role
 * client (via lib/credits' factory) and must never be imported into client
 * bundles. Like the credit engine, everything here FAILS CLOSED: a missing
 * Supabase configuration is an infrastructure error (503), never a success.
 */

/** InstaPay is the exclusive payment rail for Egyptian top-ups. */
export type PaymentMethod = "instapay";

export type TopupPack = {
  id: "pack10" | "pack50" | "pack100" | "custom";
  credits: number;
  amountEgp: number;
  egpPerCredit: number;
};

/** Fixed credit packs (Egypt pricing). */
export const TOPUP_PACKS: TopupPack[] = [
  { id: "pack10", credits: 10, amountEgp: 50, egpPerCredit: 5.0 },
  { id: "pack50", credits: 50, amountEgp: 250, egpPerCredit: 5.0 },
  { id: "pack100", credits: 100, amountEgp: 450, egpPerCredit: 4.5 },
];

/** Slider bounds & rate: custom credits are priced at 5 EGP/credit. */
export const CUSTOM_SLIDER_MIN = 10;
export const CUSTOM_SLIDER_MAX = 500;
export const CUSTOM_EGP_PER_CREDIT = 5;

/** InstaPay IPA handle shown in the modal and re-validated server-side. */
export const INSTAPAY_ADDRESS = "ahmedelqattan78@instapay";

/** Official InstaPay direct transfer link — encoded in the QR and shown as a
 * clickable/copyable URL in the modal. */
export const INSTAPAY_DIRECT_LINK = "https://ipn.eg/S/ahmedelqattan78/instapay/9RkGnD";

/** Pack labels shown on the modal cards (bilingual). */
export const PACK_LABELS: Record<string, { en: string; ar: string }> = {
  pack10: { en: "Starter Pack", ar: "باقة البداية" },
  pack50: { en: "Student Pack", ar: "باقة الطلاب" },
  pack100: { en: "Pro Pack", ar: "الباقة الاحترافية" },
};

export function egpForCustomCredits(credits: number): number {
  return Math.round(credits * CUSTOM_EGP_PER_CREDIT * 100) / 100;
}

/**
 * Unique, human-communicable reference code (e.g. REF-849201) stamped on the
 * payment instructions so the operator can match the transfer to the request.
 */export function generateRefCode(): string {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `REF-${digits}`;
}

export function isValidRefCode(code: string): boolean {
  return /^REF-\d{6}$/.test(code);
}

/** Bilingual notices shared by the top-up routes. */
export const TOPUP_AUTH_REQUIRED_BILINGUAL =
  "تسجيل الدخول مطلوب لشحن الرصيد. | Sign in with Google to top up your credits.";
export const TOPUP_SUBMITTED_BILINGUAL =
  "تم إرسال طلب الشحن بنجاح! سيتم مراجعته من الإدارة قريباً. | Top-up request submitted! It will be reviewed shortly.";
export const TOPUP_PROMO_SUCCESS_BILINGUAL =
  "تم تفعيل الكود وإضافة الرصيد فوراً! | Promo code applied — credits added instantly!";
export const TOPUP_PROMO_INVALID_BILINGUAL =
  "كود غير صالح أو مستخدم بالفعل. | Invalid or already-used promo code.";
export const TOPUP_SERVICE_UNAVAILABLE = "Credit service unavailable. Try again shortly.";
export const TOPUP_REJECTED_BILINGUAL =
  "تم رفض طلب الشحن. | The top-up request was rejected.";

export type PromoRedemption =
  | { ok: true; remaining: number }
  | { ok: false; reason: "invalid" | "unavailable" };

/**
 * Redeem a promo code atomically via the redeem_promo_code RPC. The code is
 * normalized (trim + uppercase) so users can type "qattan10" for "QATTAN10".
 */
export async function redeemPromoCode(
  admin: SupabaseClient,
  userId: string,
  rawCode: string,
): Promise<PromoRedemption> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,40}$/.test(code)) return { ok: false, reason: "invalid" };

  const { data, error } = await admin.rpc("redeem_promo_code", {
    p_code: code,
    p_user_id: userId,
  });
  if (error) {
    const message = (error.message ?? "").slice(0, 160);
    console.log(
      `[PROMO_RPC_ERROR] code=${error.code ?? "unknown"} message=${message}`,
    );
    // The RPC raises PROMO_INVALID (P0001) for unknown codes, exhausted
    // max_uses, or inactive codes — a user-facing 400, not an outage.
    return message.includes("PROMO_INVALID")
      ? { ok: false, reason: "invalid" }
      : { ok: false, reason: "unavailable" };
  }

  const remaining = parseScalar(data);
  if (!Number.isFinite(remaining)) {
    console.log("[PROMO_RPC_EMPTY_RESULT] redeem_promo_code returned no scalar");
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, remaining };
}

export type TopupApproval =
  | { ok: true; remaining: number }
  | { ok: false; reason: "not_pending" | "unavailable" };

/**
 * Approve a pending top-up: flips status to approved and adds the credits to
 * the buyer's balance inside the approve_topup Postgres function. Concurrent
 * or repeated approvals cannot double-credit (the RPC raises TOPUP_NOT_PENDING).
 */
export async function approveTopupRequest(
  admin: SupabaseClient,
  requestId: string,
): Promise<TopupApproval> {
  if (!isUuid(requestId)) return { ok: false, reason: "not_pending" };

  const { data, error } = await admin.rpc("approve_topup", { p_request_id: requestId });
  if (error) {
    const message = (error.message ?? "").slice(0, 160);
    console.log(`[TOPUP_APPROVE_RPC_ERROR] code=${error.code ?? "unknown"} message=${message}`);
    return message.includes("TOPUP_NOT_PENDING")
      ? { ok: false, reason: "not_pending" }
      : { ok: false, reason: "unavailable" };
  }

  const remaining = parseScalar(data);
  if (!Number.isFinite(remaining)) {
    console.log("[TOPUP_APPROVE_EMPTY_RESULT] approve_topup returned no scalar");
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, remaining };
}

export type TopupSubmission =
  | { ok: true; requestId: string; refCode: string }
  | { ok: false; reason: "invalid" | "unavailable" };

/**
 * Insert a pending top-up request through the service-role client. The
 * receipt must be a genuine image (magic bytes are checked upstream), and
 * the client can never choose its own user id — it is the verified session.
 */
export async function submitTopupRequest(
  admin: SupabaseClient,
  userId: string,
  input: {
    credits: number;
    amountEgp: number;
    paymentMethod: PaymentMethod;
    receiptUrl: string;
    /** Pre-validated REF-###### code shown on the transfer, when supplied. */
    refCode?: string;
    /** SHA-256 of the receipt bytes — the anti-replay ledger key. */
    receiptHash?: string;
  },
): Promise<TopupSubmission> {
  // Use the code the user already wrote on the transfer note (validated by
  // the route) so the operator matches the right payment; otherwise mint one.
  const refCode = isValidRefCode(input.refCode ?? "") ? input.refCode! : generateRefCode();
  const { data, error } = await admin
    .from("topup_requests")
    .insert({
      user_id: userId,
      credits: input.credits,
      amount_egp: input.amountEgp,
      payment_method: input.paymentMethod,
      receipt_url: input.receiptUrl,
      ref_code: refCode,
      status: "pending",
      ...(input.receiptHash ? { receipt_hash: input.receiptHash } : {}),
    })
    .select("id, ref_code")
    .single();

  if (error || !data) {
    console.log(
      `[TOPUP_INSERT_ERROR] code=${error?.code ?? "unknown"} message=${(error?.message ?? "").slice(0, 160)}`,
    );
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true, requestId: String(data.id), refCode: String(data.ref_code) };
}

/** Shared scalar parser for `returns integer` Postgres functions. */
function parseScalar(data: unknown): number {
  if (typeof data === "number") return data;
  if (Array.isArray(data) && data.length > 0) return parseScalar(data[0]);
  if (typeof data === "object" && data !== null && "credits" in data) {
    return Number((data as Record<string, unknown>).credits);
  }
  return Number.NaN;
}

export type ReceiptReplayCheck =
  | { replayed: false }
  | { replayed: true }
  | { replayed: null }
  | { replayed: false; error: "unavailable" };

/**
 * Layer 3 — anti-replay. A receipt image whose SHA-256 hash was already
 * accepted or is still pending on ANY account is the same screenshot being
 * re-used; reject it before any credit moves. Returns `null` only when the
 * hash could not be evaluated (query failure) so the caller can fail closed.
 */
export async function isReceiptAlreadyUsed(
  admin: SupabaseClient,
  receiptHash: string,
): Promise<boolean | null> {
  const { data, error } = await admin
    .from("topup_requests")
    .select("id")
    .eq("receipt_hash", receiptHash)
    .in("status", ["pending", "approved"])
    .limit(1);
  if (error) {
    console.log(
      `[TOPUP_REPLAY_CHECK_ERROR] code=${error.code ?? "unknown"} message=${(error.message ?? "").slice(0, 160)}`,
    );
    return null;
  }
  return Array.isArray(data) && data.length > 0;
}

export type InstantTopupGrant =
  | { ok: true; remaining: number }
  | { ok: false; reason: "not_found" | "unavailable" };

/**
 * Layer 4 — instant auto-grant. Claims the freshly inserted pending request
 * (status='pending' guard keeps it single-fire) and adds the credits to the
 * buyer's profile inside one atomic approve_topup call. Reuses the exact RPC
 * the admin queue uses, so manual and instant approval share one ledger.
 */
export async function grantTopupInstantly(
  admin: SupabaseClient,
  requestId: string,
): Promise<InstantTopupGrant> {
  const result = await approveTopupRequest(admin, requestId);
  return result.ok
    ? { ok: true, remaining: result.remaining }
    : result.reason === "not_pending"
      ? { ok: false, reason: "not_found" }
      : { ok: false, reason: "unavailable" };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
