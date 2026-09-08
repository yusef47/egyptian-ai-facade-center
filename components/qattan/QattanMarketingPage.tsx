"use client";

import { QattanFooter } from "./QattanFooter";
import { FaqSection } from "./FaqSection";
import { QattanHeader } from "./QattanHeader";
import { QattanHero } from "./QattanHero";
import { IntegrationStrip } from "./IntegrationStrip";
import { PricingPreview } from "./PricingPreview";
import { QattanProviders, useQattan } from "./QattanProviders";
import { ToolShowcase } from "./ToolShowcase";
import { WorkflowSection } from "./WorkflowSection";
import BeforeAfterSlider from "./BeforeAfterSlider";
import type { QattanLocale } from "./qattan-content";

function ProofSection() {
  const { copy } = useQattan();
  return (
    <section className="qattan-section qattan-proof-section">
      <div className="qattan-container">
        <div className="qattan-section-heading qattan-section-heading-centered">
          <p className="qattan-eyebrow">{copy.proof.eyebrow}</p>
          <h2>{copy.proof.title}</h2>
          <p>{copy.proof.description}</p>
        </div>
        <BeforeAfterSlider beforeLabel={copy.proof.before} afterLabel={copy.proof.after} />
      </div>
    </section>
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
        <IntegrationStrip />
        <PricingPreview />
        <section id="faq"><FaqSection /></section>
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
