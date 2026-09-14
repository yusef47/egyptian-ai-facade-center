"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import {
  BadgePercent,
  Check,
  CloudUpload,
  Copy,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import { compressImageFile } from "../../client/src/lib/image";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { QATTAN_CREDITS_EVENT } from "../../client/src/lib/restore";
import { useQattan } from "./QattanProviders";

type TopUpModalProps = {
  open: boolean;
  onClose: () => void;
};

/** Fixed packs mirror lib/topups.ts (server re-validates pricing). */
const PACKS = [
  { id: "pack10", credits: 10, egp: 50, perCredit: "5.00" },
  { id: "pack50", credits: 50, egp: 250, perCredit: "5.00" },
  { id: "pack100", credits: 100, egp: 450, perCredit: "4.50" },
] as const;

const SLIDER_MIN = 10;
const SLIDER_MAX = 500;
const CUSTOM_RATE = 5;

const INSTAPAY_ADDRESS = "qattan@instapay";
const VODAFONE_CASH_NUMBER = "010XXXXXXX";

type SubmissionState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; refCode: string }
  | { kind: "error"; message: string };

/**
 * Luxury obsidian & gold top-up flow for Egypt: fixed packs + a custom
 * credit slider (5 EGP/credit), InstaPay / Vodafone Cash instructions with a
 * unique reference code, a receipt screenshot upload, and an instant promo
 * code redemption box.
 */
export default function TopUpModal({ open, onClose }: TopUpModalProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const supabase = getSupabaseBrowserClient();
  const [mounted, setMounted] = useState(false);

  const [selected, setSelected] = useState<string>("pack50");
  const [customCredits, setCustomCredits] = useState(60);
  const [refCode, setRefCode] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ kind: "idle" });
  const [promoCode, setPromoCode] = useState("");
  const [promoState, setPromoState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "ok"; message: string } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  // Fresh reference code per session so the operator can match the transfer.
  useEffect(() => {
    if (open) {
      setRefCode(`REF-${Math.floor(100000 + Math.random() * 900000)}`);
      setSubmission({ kind: "idle" });
      setPromoState({ kind: "idle" });
    }
  }, [open]);

  const isCustom = selected === "custom";
  const credits = isCustom ? customCredits : PACKS.find((p) => p.id === selected)?.credits ?? 10;
  const egp = useMemo(
    () => (isCustom ? customCredits * CUSTOM_RATE : PACKS.find((p) => p.id === selected)?.egp ?? 50),
    [isCustom, customCredits, selected],
  );

  if (!open || !mounted) return null;

  const attachReceipt = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const compressed = await compressImageFile(file);
      setReceipt(compressed);
    } catch {
      setSubmission({
        kind: "error",
        message: L ? "تعذر قراءة الصورة. جرّب صورة أخرى." : "Could not read that image. Try another one.",
      });
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void attachReceipt(event.dataTransfer.files?.[0]);
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const submitTopup = async () => {
    if (!supabase) {
      setSubmission({
        kind: "error",
        message: L ? "سجّل الدخول أولاً لشحن الرصيد." : "Sign in first to top up your credits.",
      });
      return;
    }
    if (!receipt) {
      setSubmission({
        kind: "error",
        message: L ? "ارفع صورة إيصال التحويل أولاً." : "Upload the transfer receipt screenshot first.",
      });
      return;
    }
    setSubmission({ kind: "sending" });
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/topup/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          credits,
          amountEgp: egp,
          paymentMethod: "instapay",
          receiptDataUrl: receipt,
          refCode,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; refCode?: string; message?: string; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        setSubmission({
          kind: "error",
          message: payload?.error ?? (L ? "تعذر إرسال الطلب. حاول مجدداً." : "Could not submit the request. Try again."),
        });
        return;
      }
      setSubmission({ kind: "done", refCode: payload.refCode ?? refCode });
      setReceipt(null);
    } catch {
      setSubmission({
        kind: "error",
        message: L ? "خطأ في الشبكة. حاول مجدداً." : "Network error. Please try again.",
      });
    }
  };

  const redeemPromo = async () => {
    if (!supabase) {
      setPromoState({
        kind: "error",
        message: L ? "سجّل الدخول أولاً لتفعيل الكود." : "Sign in first to redeem a code.",
      });
      return;
    }
    if (!promoCode.trim()) return;
    setPromoState({ kind: "sending" });
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/topup/promo", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string; error?: string; creditsRemaining?: number }
        | null;
      if (!response.ok || !payload?.ok) {
        setPromoState({ kind: "error", message: payload?.error ?? (L ? "كود غير صالح." : "Invalid code.") });
        return;
      }
      setPromoState({ kind: "ok", message: payload.message ?? "" });
      if (typeof payload.creditsRemaining === "number") {
        window.dispatchEvent(
          new CustomEvent(QATTAN_CREDITS_EVENT, { detail: payload.creditsRemaining }),
        );
      }
      setPromoCode("");
    } catch {
      setPromoState({ kind: "error", message: L ? "خطأ في الشبكة." : "Network error." });
    }
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(refCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard unavailable — the code stays visible for manual copy. */
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={L ? "شحن الرصيد" : "Top up credits"}
      className="qattan-topup fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="qattan-topup-card"
        role="document"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="qattan-authgate-close"
          aria-label={L ? "إغلاق" : "Close"}
          onClick={onClose}
        >
          ✕
        </button>

        <span className="qattan-topup-icon" aria-hidden="true">
          <Wallet size={22} />
        </span>

        <h2 className="qattan-topup-title">{L ? "شحن الرصيد" : "Top Up Credits"}</h2>
        <p className="qattan-topup-desc" dir={L ? "rtl" : "ltr"}>
          {L
            ? "اختر باقة أو حدّد رصيدك بنفسك — التحويل عبر InstaPay أو فودافون كاش، والمراجعة خلال ساعات."
            : "Pick a pack or slide your own amount — pay via InstaPay or Vodafone Cash, reviewed within hours."}
        </p>

        {/* ── Packs ── */}
        <div className="qattan-topup-packs" role="radiogroup" aria-label={L ? "الباقات" : "Credit packs"}>
          {PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              role="radio"
              aria-checked={selected === pack.id}
              className={`qattan-topup-pack ${selected === pack.id ? "qattan-topup-pack-selected" : ""}`}
              onClick={() => setSelected(pack.id)}
            >
              <span className="qattan-topup-pack-credits">
                <Sparkles size={14} aria-hidden="true" /> {pack.credits} {L ? "كريديت" : "credits"}
              </span>
              <span className="qattan-topup-pack-egp">{pack.egp} EGP</span>
              <span className="qattan-topup-pack-rate">{pack.perCredit} EGP/{L ? "كريديت" : "credit"}</span>
              {selected === pack.id && <Check size={15} className="qattan-topup-pack-check" aria-hidden="true" />}
            </button>
          ))}
        </div>

        {/* ── Custom slider ── */}
        <button
          type="button"
          role="radio"
          aria-checked={isCustom}
          className={`qattan-topup-custom-toggle ${isCustom ? "qattan-topup-pack-selected" : ""}`}
          onClick={() => setSelected("custom")}
        >
          <BadgePercent size={14} aria-hidden="true" />
          {L ? "رصيد مخصص (من 10 إلى 500)" : "Custom amount (10 – 500)"}
        </button>
        {isCustom && (
          <div className="qattan-topup-slider">
            <div className="qattan-topup-slider-value">
              <strong>{customCredits}</strong>
              <span>{L ? `كريديت · ${egp} جنيه` : `credits · ${egp} EGP`}</span>
            </div>
            <input
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={10}
              value={customCredits}
              aria-label={L ? "عدد الكريديت" : "Credit amount"}
              onChange={(event) => setCustomCredits(Number(event.target.value))}
            />
            <div className="qattan-topup-slider-scale" aria-hidden="true">
              <span>10</span><span>500</span>
            </div>
            <p className="qattan-topup-slider-rate">{CUSTOM_RATE}.00 EGP/{L ? "كريديت" : "credit"}</p>
          </div>
        )}

        {/* ── Payment instructions ── */}
        <div className="qattan-topup-pay">
          <h3>{L ? "تعليمات التحويل (مصر)" : "Payment instructions (Egypt)"}</h3>
          <ul>
            <li>
              <span>InstaPay</span>
              <code dir="ltr">{INSTAPAY_ADDRESS}</code>
            </li>
            <li>
              <span>{L ? "فودافون كاش / المحافظ" : "Vodafone Cash / wallets"}</span>
              <code dir="ltr">{VODAFONE_CASH_NUMBER}</code>
            </li>
            <li>
              <span>{L ? "كود المرجع (اكتبه في ملاحظة التحويل)" : "Reference code (add to the transfer note)"}</span>
              <code dir="ltr" className="qattan-topup-ref">
                {submission.kind === "done" ? submission.refCode : refCode}
                {submission.kind !== "done" && (
                  <button type="button" className="qattan-topup-copy" onClick={() => void copyRef()} aria-label={L ? "نسخ الكود" : "Copy code"}>
                    <Copy size={13} aria-hidden="true" /> {copied ? (L ? "تم النسخ" : "Copied") : ""}
                  </button>
                )}
              </code>
            </li>
          </ul>
        </div>

        {/* ── Receipt upload ── */}
        <div
          className={`qattan-topup-upload ${dragging ? "qattan-tool-upload-dragging" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {receipt ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="qattan-topup-receipt" src={receipt} alt={L ? "إيصال التحويل" : "Transfer receipt"} />
          ) : (
            <label className="qattan-topup-upload-zone">
              <CloudUpload size={20} aria-hidden="true" />
              <strong>{L ? "ارفع صورة إيصال التحويل" : "Upload the transfer receipt"}</strong>
              <span>{L ? "لقطة شاشة PNG أو JPG" : "PNG or JPG screenshot"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => void attachReceipt(event.target.files?.[0])}
              />
            </label>
          )}
          {receipt && (
            <button type="button" className="qattan-topup-receipt-remove" onClick={() => setReceipt(null)}>
              <X size={13} aria-hidden="true" /> {L ? "إزالة" : "Remove"}
            </button>
          )}
        </div>

        {submission.kind === "error" && (
          <p className="qattan-topup-status qattan-topup-status-error" role="alert">{submission.message}</p>
        )}
        {submission.kind === "done" ? (
          <p className="qattan-topup-status qattan-topup-status-ok" role="status">
            {L
              ? `تم إرسال الطلب بكود المرجع ${submission.refCode} — سيتم المراجعة قريباً.`
              : `Request sent with reference ${submission.refCode} — it will be reviewed shortly.`}
          </p>
        ) : (
          <button
            type="button"
            className="qattan-topup-submit"
            disabled={submission.kind === "sending" || !receipt}
            onClick={() => void submitTopup()}
          >
            {submission.kind === "sending"
              ? L ? "جارٍ الإرسال…" : "Sending…"
              : L ? `إرسال الطلب (${egp} جنيه)` : `Submit request (${egp} EGP)`}
          </button>
        )}

        {/* ── Promo code ── */}
        <div className="qattan-topup-promo">
          <div className="qattan-topup-promo-row">
            <input
              type="text"
              value={promoCode}
              placeholder={L ? "أدخل كود الخصم" : "Enter promo code"}
              aria-label={L ? "كود الخصم" : "Promo code"}
              onChange={(event) => setPromoCode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void redeemPromo();
              }}
            />
            <button
              type="button"
              disabled={promoState.kind === "sending" || !promoCode.trim()}
              onClick={() => void redeemPromo()}
            >
              {promoState.kind === "sending" ? "…" : L ? "تفعيل" : "Redeem"}
            </button>
          </div>
          {promoState.kind === "ok" && (
            <p className="qattan-topup-status qattan-topup-status-ok" role="status">{promoState.message}</p>
          )}
          {promoState.kind === "error" && (
            <p className="qattan-topup-status qattan-topup-status-error" role="alert">{promoState.message}</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
