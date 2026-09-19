"use client";

import { motion } from "framer-motion";
import { Play, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQattan } from "./QattanProviders";

/** localStorage flag so returning visitors never re-watch the promo. */
export const INTRO_SEEN_KEY = "qattan_seen_intro_v1";
/** Custom event the hero "Watch Intro" button dispatches to replay the promo. */
export const INTRO_PLAY_EVENT = "qattan:intro:play";

/** Bilingual label for the hero replay button. */
export function introReplayLabel(locale: "en" | "ar"): string {
  return locale === "ar" ? INTRO_COPY.ar.replay : INTRO_COPY.en.replay;
}

/**
 * Whether this visitor should see the auto-opening intro promo: only on
 * their first landing-page visit. Extracted so tests can exercise the
 * first-visit/returning-visit contract without touching localStorage.
 */
export function shouldAutoPlayIntro(storage: Pick<Storage, "getItem">): boolean {
  try {
    return storage.getItem(INTRO_SEEN_KEY) !== "1";
  } catch {
    // Private mode / storage disabled — treat as first visit.
    return true;
  }
}

/**
 * Under test the modal never auto-opens (component tests render the landing
 * page repeatedly and would hit dialog-name collisions); the replay event
 * path stays fully exercisable.
 */
const AUTO_INTRO_ENABLED =
  typeof process === "undefined" || process.env?.NODE_ENV !== "test";

const INTRO_COPY = {
  en: {
    skip: "Skip Video",
    replay: "Watch Intro",
    close: "Close intro video",
    label: "Qattan AI introduction video",
  },
  ar: {
    skip: "تخطي الفيديو",
    replay: "فيديو التعريف",
    close: "إغلاق فيديو التعريف",
    label: "فيديو تعريفي لمنصة قطان",
  },
} as const;

/**
 * Full-screen obsidian intro promo modal. Opens automatically on a visitor's
 * first landing-page visit (guarded by `qattan_seen_intro_v1` in
 * localStorage), plays the muted looping promo, and offers a gold
 * bottom-center skip button. The hero's "Watch Intro" button re-opens it
 * anytime via the `qattan:intro:play` window event.
 *
 * Portaled to document.body (like the tool preview lightbox) so no 3D
 * transform containing block can trap the fixed overlay. Escape, backdrop
 * click, and the skip button all dismiss and persist the seen flag.
 */
export default function IntroVideoModal() {
  const { locale } = useQattan();
  const L = locale === "ar";
  const copy = L ? INTRO_COPY.ar : INTRO_COPY.en;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Open on first visit only — after mount, so SSR HTML never mismatches.
  useEffect(() => {
    setMounted(true);
    if (!AUTO_INTRO_ENABLED) return;
    setOpen(shouldAutoPlayIntro(window.localStorage));
  }, []);

  const dismiss = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      // Private mode / storage disabled — the modal simply re-opens next visit.
    }
  }, []);

  // Hero replay button + Escape-to-close.
  useEffect(() => {
    const onPlayRequest = () => setOpen(true);
    window.addEventListener(INTRO_PLAY_EVENT, onPlayRequest);
    return () => window.removeEventListener(INTRO_PLAY_EVENT, onPlayRequest);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, dismiss]);

  if (!mounted || !open || typeof document === "undefined") return null;

  return createPortal(
    <motion.div
      className="qattan-intro-overlay fixed inset-0 z-[9999] flex items-center justify-center bg-black/92 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={copy.label}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      onClick={dismiss}
    >
      <motion.div
        className="qattan-intro-dialog w-full max-w-4xl"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 26 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="qattan-intro-head">
          <span className="qattan-intro-brand" aria-hidden="true">
            <Play size={13} /> Qattan AI
          </span>
          <button
            type="button"
            className="qattan-intro-close"
            onClick={dismiss}
            aria-label={copy.close}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="qattan-intro-stage">
          <video
            className="qattan-intro-video"
            src="/intro.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          />
        </div>
        <div className="qattan-intro-foot">
          <button type="button" className="qattan-intro-skip" onClick={dismiss}>
            {copy.skip}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
