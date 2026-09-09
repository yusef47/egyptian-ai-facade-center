"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQattan } from "./QattanProviders";

type ToolPreviewModalProps = {
  /** What opens the modal — usually a small preview chip inside the card. */
  children: ReactNode;
  /** Title rendered inside the modal header. */
  title: string;
  /** Short description rendered under the preview. */
  description: string;
  /** High-quality poster shown while the video buffers (or as full fallback). */
  poster: string;
  /** Real HD architectural video (MP4). Optional — falls back to the poster. */
  videoSrc?: string;
};

const PREVIEW_COPY = {
  en: {
    close: "Close preview",
    open: "Open preview",
    playing: "Preview playing — click to pause",
    paused: "Preview paused — click to play",
  },
  ar: {
    close: "إغلاق المعاينة",
    open: "فتح المعاينة",
    playing: "المعاينة تعمل — انقر للإيقاف",
    paused: "المعاينة متوقفة — انقر للتشغيل",
  },
} as const;

/**
 * Real architectural video preview modal: a glass dialog playing a muted,
 * auto-looping HD clip of the tool's signature shot, with a high-quality
 * poster fallback for slow connections (or when no video is provided).
 * Focus-safe: Escape closes, body scroll locks, opener state is preserved.
 */
export default function ToolPreviewModal({
  children,
  title,
  description,
  poster,
  videoSrc,
}: ToolPreviewModalProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const copy = L ? PREVIEW_COPY.ar : PREVIEW_COPY.en;
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const togglePlayback = () => {
    // React state is the source of truth; the media element is synced
    // best-effort (jsdom's play() is a no-op, browsers fire play/pause events).
    const next = !playing;
    const video = videoRef.current;
    if (video) {
      if (next) {
        void Promise.resolve(video.play?.()).catch(() => undefined);
      } else {
        video.pause?.();
      }
    }
    setPlaying(next);
  };

  return (
    <>
      <button
        type="button"
        className="qattan-preview-trigger"
        onClick={() => {
          setOpen(true);
          setPlaying(true);
        }}
        aria-haspopup="dialog"
        aria-label={`${copy.open} — ${title}`}
      >
        {children}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            className="qattan-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="qattan-preview-dialog"
              initial={{ opacity: 0, scale: 0.94, y: 18 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: "spring", stiffness: 220, damping: 26 }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="qattan-preview-head">
                <h3>{title}</h3>
                <button
                  type="button"
                  className="qattan-preview-close"
                  onClick={() => setOpen(false)}
                  aria-label={copy.close}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className="qattan-preview-stage"
                onClick={togglePlayback}
                aria-pressed={playing}
                aria-label={playing ? copy.playing : copy.paused}
              >
                {videoSrc ? (
                  <video
                    ref={videoRef}
                    className="qattan-preview-video"
                    src={videoSrc}
                    poster={poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                  />
                ) : (
                  // Poster-only fallback for slow connections or missing clips.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={poster} alt="" className="qattan-preview-video" draggable={false} />
                )}
                <span className="qattan-preview-state" aria-hidden="true">
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </span>
              </button>
              <p className="qattan-preview-description">{description}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
