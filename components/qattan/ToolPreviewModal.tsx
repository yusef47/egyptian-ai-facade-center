"use client";

import { motion } from "framer-motion";
import { Maximize2, Minimize2, Pause, Play, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  /**
   * Derived "before" image (1-to-1 matched to this tool's output). When set,
   * the stage becomes an interactive before/after comparison: the before
   * image overlays the left of a gold divider while the video plays as the
   * living "after". Optional — plain video stage when omitted.
   */
  beforeSrc?: string;
  /**
   * Static "after" image for image-pair showcases (e.g. Floor Plan → CAD
   * sheet) that have no matching video. Replaces the video layer entirely.
   */
  afterSrc?: string;
};

const PREVIEW_COPY = {
  en: {
    close: "Close preview",
    open: "Open preview",
    playing: "Preview playing — click to pause",
    paused: "Preview paused — click to play",
    before: "Before",
    after: "After",
    compare: "Drag to compare before and after",
    fullscreen: "Enter fullscreen",
    exitFullscreen: "Exit fullscreen",
  },
  ar: {
    close: "إغلاق المعاينة",
    open: "فتح المعاينة",
    playing: "المعاينة تعمل — انقر للإيقاف",
    paused: "المعاينة متوقفة — انقر للتشغيل",
    before: "قبل",
    after: "بعد",
    compare: "اسحب للمقارنة بين قبل وبعد",
    fullscreen: "ملء الشاشة",
    exitFullscreen: "الخروج من ملء الشاشة",
  },
} as const;

/**
 * Real architectural video preview modal: a centered fullscreen glassmorphic
 * lightbox playing a muted, auto-looping HD clip of the tool's signature
 * shot, with a high-quality poster fallback for slow connections.
 *
 * The lightbox is portaled to document.body: tool cards live inside
 * TiltCard's 3D transforms, which create a containing block that would
 * otherwise trap a position:fixed overlay inside the small card.
 * Focus-safe: Escape closes, backdrop click closes, body scroll locks.
 */
export default function ToolPreviewModal({
  children,
  title,
  description,
  poster,
  videoSrc,
  beforeSrc,
  afterSrc,
}: ToolPreviewModalProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const copy = L ? PREVIEW_COPY.ar : PREVIEW_COPY.en;
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [expanded, setExpanded] = useState(false);
  /** Before/after divider position (%) — only rendered when `beforeSrc` is set. */
  const [divider, setDivider] = useState(45);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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

  // Keep the expanded state in sync when the user leaves native fullscreen
  // with Escape or the browser UI (the dialog class alone is the fallback).
  useEffect(() => {
    if (typeof document === "undefined" || !document.addEventListener) return;
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  const toggleExpanded = () => {
    const dialog = dialogRef.current;
    const next = !expanded;
    setExpanded(next);
    // Native fullscreen where available (jsdom-safe: property may not exist).
    if (dialog && typeof dialog.requestFullscreen === "function") {
      if (next) {
        void Promise.resolve(dialog.requestFullscreen()).catch(() => undefined);
      } else if (typeof document.exitFullscreen === "function" && document.fullscreenElement) {
        void Promise.resolve(document.exitFullscreen()).catch(() => undefined);
      }
    }
  };

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
          setExpanded(false);
          setDivider(45);
        }}
        aria-haspopup="dialog"
        aria-label={`${copy.open} — ${title}`}
      >
        {children}
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <motion.div
            className="qattan-preview-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.28 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
            ref={dialogRef}
            className={`qattan-preview-dialog qattan-preview-dialog-cinema ${expanded ? "qattan-preview-expanded" : "max-w-3xl"} w-full`}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 26 }}
            onClick={(event) => event.stopPropagation()}
          >
              <div className="qattan-preview-head">
                <h3>{title}</h3>
                <div className="qattan-preview-head-actions">
                  <button
                    type="button"
                    className="qattan-preview-close"
                    onClick={toggleExpanded}
                    aria-label={expanded ? copy.exitFullscreen : copy.fullscreen}
                    aria-pressed={expanded}
                  >
                    {expanded ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="qattan-preview-close"
                    onClick={() => setOpen(false)}
                    aria-label={copy.close}
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
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
                  // Poster/after-image fallback for image-pair showcases or
                  // missing clips.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={afterSrc ?? poster}
                    alt=""
                    className="qattan-preview-video"
                    draggable={false}
                  />
                )}
                {beforeSrc ? (
                  <>
                    {/* Derived 1-to-1 "before" treatment over the living
                        after layer, clipped to the left of the divider. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="qattan-preview-before"
                      src={beforeSrc}
                      alt=""
                      draggable={false}
                      style={{ clipPath: `inset(0 ${100 - divider}% 0 0)` }}
                    />
                    <span
                      className="qattan-preview-divider-line"
                      style={{ left: `${divider}%` }}
                      aria-hidden="true"
                    />
                    <span className="qattan-comparison-label qattan-comparison-label-before">
                      {copy.before}
                    </span>
                    <span className="qattan-comparison-label qattan-comparison-label-after">
                      {copy.after}
                    </span>
                  </>
                ) : null}
                <span className="qattan-preview-state" aria-hidden="true">
                  {playing ? <Pause size={18} /> : <Play size={18} />}
                </span>
                <span
                  className={`qattan-preview-live-glow ${playing ? "qattan-preview-live-glow-on" : ""}`}
                  aria-hidden="true"
                />
              </button>
              {beforeSrc ? (
                <label className="qattan-preview-divider-control">
                  <span className="qattan-sr-only">{copy.compare}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={divider}
                    onChange={(event) => setDivider(Number(event.target.value))}
                  />
                </label>
              ) : null}
              <p className="qattan-preview-description">{description}</p>
            </motion.div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
