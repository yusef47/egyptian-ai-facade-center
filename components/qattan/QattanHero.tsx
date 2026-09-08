"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Download, Upload, WandSparkles } from "lucide-react";
import Link from "next/link";
import { useQattan } from "./QattanProviders";

const heroLines = {
  hidden: { opacity: 0, y: 26, filter: "blur(8px)" },
  show: (delay: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.7, delay, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
  }),
};

export function QattanHero() {
  const { copy } = useQattan();
  return (
    <section className="qattan-hero">
      <div className="qattan-hero-backdrop" aria-hidden="true">
        <div className="qattan-hero-grid-pattern" />
        <div className="qattan-hero-glow" />
      </div>
      <div className="qattan-container qattan-hero-grid">
        <div className="qattan-hero-copy">
          <motion.p
            className="qattan-eyebrow"
            variants={heroLines}
            initial="hidden"
            animate="show"
            custom={0}
          >
            {copy.hero.eyebrow}
          </motion.p>
          <motion.h1
            variants={heroLines}
            initial="hidden"
            animate="show"
            custom={0.2}
          >
            {copy.hero.title}
          </motion.h1>
          <motion.p
            className="qattan-hero-description"
            variants={heroLines}
            initial="hidden"
            animate="show"
            custom={0.4}
          >
            {copy.hero.description}
          </motion.p>
          <motion.div
            className="qattan-hero-actions"
            variants={heroLines}
            initial="hidden"
            animate="show"
            custom={0.6}
          >
            <Link className="qattan-button qattan-button-primary qattan-cta-pulse" href="/studio">
              {copy.hero.primary}<ArrowUpRight size={17} aria-hidden="true" />
            </Link>
            <a className="qattan-button qattan-button-secondary" href="#workflow">{copy.hero.secondary}</a>
          </motion.div>
          <motion.p
            className="qattan-hero-note"
            variants={heroLines}
            initial="hidden"
            animate="show"
            custom={0.75}
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
            animate={{ y: [0, -7, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <span className="qattan-hero-card-label"><Upload size={13} /> {copy.hero.visualInput}</span>
            <div className="qattan-hero-plan"><i /><i /><i /><i /><i /><i /><i /></div>
          </motion.div>
          <motion.div
            className="qattan-hero-arrow"
            aria-hidden="true"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
          >
            <WandSparkles size={20} />
          </motion.div>
          <motion.div
            className="qattan-hero-card qattan-hero-output-card"
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 0.6 }}
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
