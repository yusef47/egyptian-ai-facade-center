"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lock, Sparkles } from "lucide-react";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { useQattan } from "./QattanProviders";

type RequireAuthModalProps = {
  open: boolean;
  onClose: () => void;
  /** Studio deep link (e.g. /studio?mode=exterior) to return to after login. */
  returnTo?: string;
};

function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.8-3c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5.1L1.2 17C3.2 21.1 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.1 14.2c-.3-.7-.4-1.5-.4-2.2s.1-1.5.4-2.2L1.2 6.9C.4 8.5 0 10.2 0 12s.4 3.5 1.2 5.1l3.9-2.9z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C18 1.2 15.2 0 12 0 7.3 0 3.2 2.9 1.2 6.9l3.9 2.9c1-2.9 3.7-5.1 6.9-5.1z" />
    </svg>
  );
}

/**
 * Luxury obsidian & gold gate shown when an unauthenticated visitor tries to
 * run any AI generation tool. Explains the 10 free daily credits and starts
 * the Supabase Google OAuth flow, returning the user to the studio deep link
 * (mode preserved) after sign-in.
 */
export default function RequireAuthModal({ open, onClose, returnTo }: RequireAuthModalProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const supabase = getSupabaseBrowserClient();
  const [mounted, setMounted] = useState(false);

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

  if (!open || !mounted) return null;

  const startGoogleSignIn = () => {
    if (!supabase) return;
    void supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(
          returnTo || "/studio",
        )}`,
      },
    });
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={L ? "تسجيل الدخول مطلوب" : "Sign in required"}
      className="qattan-authgate fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 p-4 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="qattan-authgate-card"
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

        <span className="qattan-authgate-icon" aria-hidden="true">
          <Lock size={22} />
        </span>

        <h2 className="qattan-authgate-title">
          {L ? "تسجيل الدخول مطلوب لتجربة الأدوات 🔐" : "Sign In Required to Try Tools"}
        </h2>

        <p className="qattan-authgate-desc" dir={L ? "rtl" : "ltr"}>
          {L
            ? "سجّل حسابك بضغطة واحدة واحصل فوراً على 10 كريديت يومية مجاناً لتجربة كافة أدوات قطان المعمارية!"
            : "Sign in with Google in 3 seconds to receive 10 free daily credits!"}
        </p>

        <ul className="qattan-authgate-perks">
          <li>
            <Sparkles size={14} aria-hidden="true" />
            {L ? "10 كريديت مجانية تتجدد كل ٢٤ ساعة" : "10 free credits renewing every 24 hours"}
          </li>
          <li>
            <Sparkles size={14} aria-hidden="true" />
            {L ? "وصول فوري لكل الأدوات المعمارية التسع" : "Instant access to all nine AI tools"}
          </li>
          <li>
            <Sparkles size={14} aria-hidden="true" />
            {L ? "مخرجات نظيفة بدون علامات مائية بجودة 8K" : "Clean watermark-free 8K outputs"}
          </li>
        </ul>

        <button
          type="button"
          className="qattan-authgate-google"
          onClick={startGoogleSignIn}
          disabled={!supabase}
        >
          <GoogleGlyph />
          {L ? "التسجيل بـ Google" : "Login with Google"}
        </button>

        <p className="qattan-authgate-foot">
          {L ? "استمرارك يعني موافقتك على شروط الاستخدام." : "By continuing you agree to our terms of use."}
        </p>
      </div>
    </div>,
    document.body,
  );
}
