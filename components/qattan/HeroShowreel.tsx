"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQattan } from "./QattanProviders";

type ShowreelScene = {
  src: string;
  poster: string;
  caption: { en: string; ar: string };
};

const SCENES: ShowreelScene[] = [
  {
    src: "/videos/reel-sketch.mp4",
    poster: "/hero-before-sketch.jpg",
    caption: { en: "From a hand-drawn elevation…", ar: "من واجهة مرسومة يدوياً…" },
  },
  {
    src: "/videos/reel-villa.mp4",
    poster: "/hero-after-villa.jpg",
    caption: { en: "…to an 8K golden-hour render", ar: "…إلى رندر 8K في الساعة الذهبية" },
  },
  {
    src: "/videos/reel-night.mp4",
    poster: "/hero-night-pool.jpg",
    caption: { en: "Qattan Architectural Engine · Night 2700K", ar: "محرك قطان المعماري · ليلي 2700 كلفن" },
  },
];

const SCENE_DURATION_MS = 5200;
const REEL_COPY = {
  en: { play: "Play showreel", pause: "Pause showreel", label: "Qattan architectural showreel" },
  ar: { play: "تشغيل العرض", pause: "إيقاف العرض", label: "العرض المعماري لقطان" },
} as const;

/**
 * Real cinematic showreel in the hero: three muted, auto-looping HD
 * architectural clips cross-fade on a timer with gold letterboxing and
 * bilingual captions. Every clip pauses with the master toggle, and the
 * whole reel is static-friendly for prefers-reduced-motion visitors.
 */
export default function HeroShowreel({ powered }: { powered: string }) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const reduceMotion = useReducedMotion() ?? false;
  const [playing, setPlaying] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  const scene = SCENES[sceneIndex] ?? SCENES[0];

  useEffect(() => {
    if (reduceMotion || !playing) return;
    const timer = window.setInterval(() => {
      setSceneIndex((current) => (current + 1) % SCENES.length);
    }, SCENE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [playing, reduceMotion]);

  // Keep every clip's play state in sync with the master toggle.
  useEffect(() => {
    for (const video of videoRefs.current) {
      if (!video) continue;
      if (playing && !reduceMotion) {
        if (typeof video.play === "function") void Promise.resolve(video.play()).catch(() => undefined);
      } else {
        video.pause?.();
      }
    }
  }, [playing, reduceMotion, sceneIndex]);

  const togglePlayback = useCallback(() => {
    setPlaying((current) => !current);
  }, []);

  return (
    <div
      className="qattan-reel"
      role="img"
      aria-label={L ? REEL_COPY.ar.label : REEL_COPY.en.label}
    >
      <div className="qattan-reel-stage" aria-hidden="true">
        <AnimatePresence mode="sync" initial={false}>
          <motion.div
            key={sceneIndex}
            className="qattan-reel-scene"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 1.1, ease: "easeInOut" }}
          >
            <video
              ref={(element) => {
                videoRefs.current[sceneIndex] = element;
              }}
              className="qattan-reel-video"
              src={scene.src}
              poster={scene.poster}
              autoPlay={playing && !reduceMotion}
              muted
              loop
              playsInline
              preload="auto"
            />
          </motion.div>
        </AnimatePresence>
        <div className="qattan-reel-vignette" />
        <div className="qattan-reel-letterbox qattan-reel-letterbox-top" />
        <div className="qattan-reel-letterbox qattan-reel-letterbox-bottom" />
        <AnimatePresence mode="wait">
          <motion.p
            key={`${sceneIndex}-${locale}`}
            className="qattan-reel-caption"
            initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.23, 1, 0.32, 1] }}
          >
            {L ? scene.caption.ar : scene.caption.en}
          </motion.p>
        </AnimatePresence>
        <div className="qattan-reel-progress" aria-hidden="true">
          {SCENES.map((entry, index) => (
            <span
              key={entry.src}
              className={`qattan-reel-progress-dot ${index === sceneIndex ? "qattan-reel-progress-dot-active" : ""}`}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        className="qattan-reel-toggle"
        onClick={togglePlayback}
        aria-pressed={playing}
        aria-label={playing ? (L ? REEL_COPY.ar.pause : REEL_COPY.en.pause) : L ? REEL_COPY.ar.play : REEL_COPY.en.play}
      >
        {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
      </button>
      <span className="qattan-hero-powered">
        <span className="qattan-hero-powered-dot" aria-hidden="true" />
        {powered}
      </span>
      <link rel="preload" as="video" href={SCENES[0].src} />
    </div>
  );
}
