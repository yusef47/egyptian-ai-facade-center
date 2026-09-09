"use client";

import { motion } from "framer-motion";
import { QattanFooter } from "./QattanFooter";
import { QattanHeader } from "./QattanHeader";
import { QattanHero } from "./QattanHero";
import { PricingPreview } from "./PricingPreview";
import { QattanProviders, useQattan } from "./QattanProviders";
import { ToolShowcase } from "./ToolShowcase";
import { WorkflowSection } from "./WorkflowSection";
import BeforeAfterSlider from "./BeforeAfterSlider";
import { Reveal } from "./Reveal";
import type { QattanLocale } from "./qattan-content";

const sectionReveal = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.55, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] },
};

/** Section 3: side-by-side interactive comparison cards (Exterior & Sketch). */
function ProofSection() {
  const { copy } = useQattan();
  return (
    <motion.section
      id="proof"
      className="qattan-section qattan-proof-section"
      initial={sectionReveal.initial}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={sectionReveal.viewport}
      transition={sectionReveal.transition}
    >
      <div className="qattan-container">
        <Reveal className="qattan-section-heading qattan-section-heading-centered">
          <p className="qattan-eyebrow">{copy.proof.eyebrow}</p>
          <h2>{copy.proof.title}</h2>
          <p>{copy.proof.description}</p>
        </Reveal>
        <div className="qattan-proof-grid">
          <Reveal className="qattan-proof-card">
            <h3>{copy.proof.exteriorCard}</h3>
            <BeforeAfterSlider
              beforeLabel={copy.proof.before}
              afterLabel={copy.proof.after}
              beforeSrc="/facade-before-blueprint.svg"
              afterSrc="/facade-after-render.svg"
            />
          </Reveal>
          <Reveal className="qattan-proof-card">
            <h3>{copy.proof.sketchCard}</h3>
            <BeforeAfterSlider
              beforeLabel={copy.proof.before}
              afterLabel={copy.proof.after}
              beforeSrc="/facade-before-blueprint.svg"
              afterSrc="/facade-after-render.svg"
            />
          </Reveal>
        </div>
      </div>
    </motion.section>
  );
}

function QattanMarketingContent() {
  const { copy } = useQattan();
  return (
    <>
      <QattanHeader />
      <main>
        <QattanHero />
        <ProofSection />
        <WorkflowSection />
        <ToolShowcase />
        <PricingPreview />
      </main>
      <QattanFooter />
      <div className="qattan-proof-banner"><div className="qattan-container"><span>{copy.footer.disclaimer}</span></div></div>
    </>
  );
}

export function QattanMarketingPage({ locale }: { locale: QattanLocale }) {
  return (
    <QattanProviders locale={locale}>
      <div className={`qattan-page ${locale === "ar" ? "qattan-arabic" : "qattan-english"}`} dir={locale === "ar" ? "rtl" : "ltr"}>
        <QattanMarketingContent />
      </div>
    </QattanProviders>
  );
}

export default QattanMarketingPage;
