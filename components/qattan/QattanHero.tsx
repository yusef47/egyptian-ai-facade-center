"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Download, Upload, WandSparkles } from "lucide-react";
import Link from "next/link";
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

export function QattanHero() {
  const { copy } = useQattan();
  return (
    <section className="qattan-hero">
      <div className="qattan-hero-backdrop" aria-hidden="true">
        <div className="qattan-hero-grid-pattern" />
        <div className="qattan-hero-glow" />
        <div className="qattan-hero-orb" />
        <div className="qattan-hero-orb qattan-hero-orb-two" />
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
          <motion.div
            className="qattan-hero-card qattan-hero-input-card"
            animate={{ y: [-8, 8, -8] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="qattan-hero-card-label"><Upload size={13} /> {copy.hero.visualInput}</span>
            <div className="qattan-hero-plan"><i /><i /><i /><i /><i /><i /><i /></div>
          </motion.div>
          <motion.div
            className="qattan-hero-arrow"
            aria-hidden="true"
            animate={{ scale: [1, 1.14, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <WandSparkles size={20} />
          </motion.div>
          <motion.div
            className="qattan-hero-card qattan-hero-output-card"
            animate={{ y: [8, -8, 8] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
          >
            <span className="qattan-hero-card-label"><Download size={13} /> {copy.hero.visualOutput}</span>
            <div className="qattan-hero-render"><i /><i /><i /><i /></div>
          </motion.div>
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
