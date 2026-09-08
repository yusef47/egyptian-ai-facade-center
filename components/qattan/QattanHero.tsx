"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import { ArrowUpRight, Download, Upload, WandSparkles } from "lucide-react";
import Link from "next/link";
import { type MouseEvent, type PointerEvent } from "react";
import { TiltCard } from "./TiltCard";
import { useQattan } from "./QattanProviders";

const heroLine = {
  hidden: { opacity: 0, y: 26, filter: "blur(8px)" },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, delay, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
  }),
};

const headlineContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } },
};

const headlineWord = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 120, damping: 16 },
  },
};

function AnimatedHeadline({ title }: { title: string }) {
  return (
    <motion.h1
      className="qattan-text-shine"
      variants={headlineContainer}
      initial="hidden"
      animate="show"
      aria-label={title}
    >
      {title.split(" ").map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          aria-hidden="true"
          variants={headlineWord}
          style={{ display: "inline-block", willChange: "transform, opacity" }}
        >
          {word}
          {"\u00A0"}
        </motion.span>
      ))}
    </motion.h1>
  );
}

const PARTICLES = Array.from({ length: 12 }, (_, index) => ({
  id: index,
  left: `${6 + ((index * 7.9) % 88)}%`,
  size: 3 + (index % 3) * 1.6,
  duration: 6.5 + (index % 5) * 0.9,
  delay: -(index % 7) * 0.9,
  gold: index % 3 !== 1,
}));

/** Twelve soft gold/cyan micro-particles drifting upward for luxury depth. */
function GoldenDust() {
  const reduceMotion = useReducedMotion() ?? false;
  if (reduceMotion) return null;
  return (
    <div className="qattan-hero-particles" aria-hidden="true">
      {PARTICLES.map((particle) => (
        <motion.span
          key={particle.id}
          className="qattan-particle"
          style={{
            left: particle.left,
            width: particle.size,
            height: particle.size,
            background: particle.gold ? "#e3c27e" : "#59d8ff",
            boxShadow: particle.gold
              ? "0 0 8px rgba(227,194,126,.9)"
              : "0 0 8px rgba(89,216,255,.9)",
          }}
          animate={{ y: [0, -60, 0], opacity: [0, 0.7, 0] }}
          transition={{
            duration: particle.duration,
            repeat: Infinity,
            ease: "easeInOut",
            delay: particle.delay,
          }}
        />
      ))}
    </div>
  );
}

/** Slow-dashing CAD-style blueprint lines drawing themselves in the background. */
function BlueprintLines() {
  return (
    <svg
      className="qattan-blueprint-svg"
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <g fill="none" strokeWidth="1.2" opacity=".5">
        <path className="qattan-blueprint-line" stroke="#4a6fb0" d="M40 520 H760" />
        <path className="qattan-blueprint-line" stroke="#4a6fb0" d="M120 460 H680 V420 H200" />
        <path className="qattan-blueprint-line qattan-blueprint-line-slow" stroke="#c5a059" d="M80 120 H400 V80 H720" />
        <path className="qattan-blueprint-line qattan-blueprint-line-slow" stroke="#4a6fb0" d="M640 200 V330 H540" />
        <path className="qattan-blueprint-line" stroke="#c5a059" d="M60 260 H180 V340" />
      </g>
    </svg>
  );
}

export function QattanHero() {
  const { copy } = useQattan();
  const reduceMotion = useReducedMotion() ?? false;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const spotX = useSpring(rawX, { stiffness: 140, damping: 22 });
  const spotY = useSpring(rawY, { stiffness: 140, damping: 22 });

  const handleHeroMove = (event: MouseEvent<HTMLElement>) => {
    if (reduceMotion) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rawX.set(event.clientX - rect.left);
    rawY.set(event.clientY - rect.top);
  };

  return (
    <section className="qattan-hero" onMouseMove={handleHeroMove}>
      <div className="qattan-hero-backdrop" aria-hidden="true">
        <div className="qattan-hero-grid-pattern" />
        <BlueprintLines />
        <div className="qattan-hero-glow" />
        <div className="qattan-hero-orb" />
        <div className="qattan-hero-orb qattan-hero-orb-two" />
        {!reduceMotion && (
          <motion.span
            className="qattan-hero-spotlight"
            style={{ left: spotX, top: spotY }}
          />
        )}
        <GoldenDust />
      </div>
      <div className="qattan-container qattan-hero-grid">
        <div className="qattan-hero-copy">
          <motion.p
            className="qattan-eyebrow"
            variants={heroLine}
            initial="hidden"
            animate="show"
            custom={0}
          >
            {copy.hero.eyebrow}
          </motion.p>
          <AnimatedHeadline title={copy.hero.title} />
          <motion.p
            className="qattan-hero-description"
            variants={heroLine}
            initial="hidden"
            animate="show"
            custom={0.55}
          >
            {copy.hero.description}
          </motion.p>
          <motion.div
            className="qattan-hero-actions"
            variants={heroLine}
            initial="hidden"
            animate="show"
            custom={0.75}
          >
            <Link className="qattan-button qattan-button-primary qattan-cta-pulse" href="/studio">
              {copy.hero.primary}<ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <a className="qattan-button qattan-button-secondary" href="#workflow">{copy.hero.secondary}</a>
          </motion.div>
          <motion.p
            className="qattan-hero-note"
            variants={heroLine}
            initial="hidden"
            animate="show"
            custom={0.9}
          >
            {copy.hero.freeNote}
          </motion.p>
        </div>
        <motion.div
          className="qattan-hero-visual"
          aria-label={`${copy.hero.visualInput} to ${copy.hero.visualOutput}`}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.35, ease: [0.23, 1, 0.32, 1] }}
        >
          <div className="qattan-hero-grid-lines" aria-hidden="true" />
          <div className="qattan-hero-input-card">
            <TiltCard className="qattan-hero-card" baseRotate={-4}>
              <span className="qattan-hero-card-label"><Upload size={13} /> {copy.hero.visualInput}</span>
              <div className="qattan-hero-plan"><i /><i /><i /><i /><i /><i /><i /></div>
            </TiltCard>
          </div>
          <motion.div
            className="qattan-hero-arrow"
            aria-hidden="true"
            animate={{ scale: [1, 1.14, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <WandSparkles size={20} />
          </motion.div>
          <div className="qattan-hero-output-card">
            <TiltCard className="qattan-hero-card" baseRotate={4}>
              <span className="qattan-hero-card-label"><Download size={13} /> {copy.hero.visualOutput}</span>
              <div className="qattan-hero-render"><i /><i /><i /><i /></div>
            </TiltCard>
          </div>
          <motion.span
            className="qattan-hero-coordinate"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            30°03′N / 31°14′E
          </motion.span>
        </motion.div>
      </div>
    </section>
  );
}
