"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useQattan } from "./QattanProviders";

type ShowreelScene = {
  src: string;
  caption: { en: string; ar: string };
  alt: { en: string; ar: string };
  reverse?: boolean;
};

const SCENES: ShowreelScene[] = [
  {
    src: "/facade-before-blueprint.svg",
    caption: { en: "From a hand sketch…", ar: "من اسكتش يدوي…" },
    alt: {
      en: "Architectural blueprint line drawing of a building elevation",
      ar: "رسم معماري خطي لواجهة مبنى",
    },
  },
  {
    src: "/facade-after-render.svg",
    caption: { en: "…to an 8K golden-hour render", ar: "…إلى رندر 8K في الساعة الذهبية" },
    alt: {
      en: "Photorealistic rendering of a restored limestone facade at golden hour",
      ar: "رندر واقعي لواجهة حجر جيري مرممة في الساعة الذهبية",
    },
    reverse: true,
  },
  {
    src: "/facade-after-render.svg",
    caption: { en: "Qattan Gemini Engine · Night 2700K", ar: "محرك قطان Gemini · ليلي 2700 كلفن" },
    alt: {
      en: "Cinematic night render of a luxury facade under warm 2700K lighting",
      ar: "رندر سينمائي ليلي لواجهة فاخرة بإضاءة دافئة 2700 كلفن",
    },
    reverse: true,
  },
];

const SCENE_DURATION_MS = 4600;
const REEL_COPY = {
  en: { play: "Play showreel", pause: "Pause showreel", label: "Qattan showreel" },
  ar: { play: "تشغيل العرض", pause: "إيقاف العرض", label: "عرض قطان" },
} as const;

/**
 * Renderforest-style luxury motion container: a silent, looping cinematic
 * showreel built from the architectural artwork with slow ken-burns pans,
 * gold letterboxing, and scene captions. Fully client-side — no video asset
 * required — and pauses cleanly for prefers-reduced-motion visitors.
 */
export default function HeroShowreel({ powered }: { powered: string }) {
  const { locale } = useQattan();
  const L = locale === "ar";
  const reduceMotion = useReducedMotion() ?? false;
  const [playing, setPlaying] = useState(true);
  const [sceneIndex, setSceneIndex] = useState(0);

  const scene = SCENES[sceneIndex] ?? SCENES[0];

  useEffect(() => {
    if (reduceMotion || !playing) return;
    const timer = window.setInterval(() => {
      setSceneIndex((current) => (current + 1) % SCENES.length);
    }, SCENE_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [playing, reduceMotion]);

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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={scene.src}
              alt=""
              className={`qattan-reel-img ${scene.reverse ? "qattan-reel-img-reverse" : ""}`}
              style={{ animationPlayState: playing && !reduceMotion ? "running" : "paused" }}
              draggable={false}
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
              key={entry.caption.en}
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
      {/* Preload both artwork frames so scene changes never flash empty. */}
      <link rel="preload" as="image" href="/facade-before-blueprint.svg" />
      <link rel="preload" as="image" href="/facade-after-render.svg" />
    </div>
  );
}
