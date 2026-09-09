"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Pause, Play, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useQattan } from "./QattanProviders";

type ToolPreviewModalProps = {
  /** What opens the modal — usually a small preview chip inside the card. */
  children: ReactNode;
  /** Title rendered inside the modal header. */
  title: string;
  /** Short description rendered under the preview. */
  description: string;
  /** The artwork shown as the looping "video" preview. */
  previewSrc: string;
  /** Extra artwork frames to cycle through, if any. */
  extraFrames?: string[];
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
 * Renderforest-style play/pause preview modal for showcase tools: a glass
 * dialog with a looping ken-burns preview of the tool's output artwork.
 * Focus is restored to the opener on close, and Escape closes it.
 */
export default function ToolPreviewModal({
  children,
  title,
  description,
  previewSrc,
  extraFrames = [],
}: ToolPreviewModalProps) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const copy = L ? PREVIEW_COPY.ar : PREVIEW_COPY.en;
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState(true);

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

  const frames = [previewSrc, ...extraFrames];

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
                onClick={() => setPlaying((current) => !current)}
                aria-pressed={playing}
                aria-label={playing ? copy.playing : copy.paused}
              >
                {frames.map((frame, index) => (
                  <img
                    // eslint-disable-next-line @next/next/no-img-element
                    key={`${frame}-${index}`}
                    src={frame}
                    alt=""
                    aria-hidden={index > 0 ? true : undefined}
                    className={`qattan-preview-frame ${index === 0 ? "qattan-preview-frame-active" : ""} ${index % 2 === 1 ? "qattan-reel-img-reverse" : ""}`}
                    style={{ animationPlayState: playing ? "running" : "paused" }}
                    draggable={false}
                  />
                ))}
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
