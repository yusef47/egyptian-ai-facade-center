import { ArrowUpRight, Upload, WandSparkles, Download } from "lucide-react";
import Link from "next/link";
import { useQattan } from "./QattanProviders";

export function QattanHero() {
  const { copy } = useQattan();
  return (
    <section className="qattan-hero">
      <div className="qattan-container qattan-hero-grid">
        <div className="qattan-hero-copy">
          <p className="qattan-eyebrow">{copy.hero.eyebrow}</p>
          <h1>{copy.hero.title}</h1>
          <p className="qattan-hero-description">{copy.hero.description}</p>
          <div className="qattan-hero-actions">
            <Link className="qattan-button qattan-button-primary" href="/studio">{copy.hero.primary}<ArrowUpRight size={17} aria-hidden="true" /></Link>
            <a className="qattan-button qattan-button-secondary" href="#workflow">{copy.hero.secondary}</a>
          </div>
          <p className="qattan-hero-note">{copy.hero.freeNote}</p>
        </div>
        <div className="qattan-hero-visual" aria-label={`${copy.hero.visualInput} to ${copy.hero.visualOutput}`}>
          <div className="qattan-hero-grid-lines" aria-hidden="true" />
          <div className="qattan-hero-card qattan-hero-input-card">
            <span className="qattan-hero-card-label"><Upload size={13} /> {copy.hero.visualInput}</span>
            <div className="qattan-hero-plan"><i /><i /><i /><i /><i /><i /><i /></div>
          </div>
          <div className="qattan-hero-arrow" aria-hidden="true"><WandSparkles size={20} /></div>
          <div className="qattan-hero-card qattan-hero-output-card">
            <span className="qattan-hero-card-label"><Download size={13} /> {copy.hero.visualOutput}</span>
            <div className="qattan-hero-render"><i /><i /><i /><i /></div>
          </div>
          <span className="qattan-hero-coordinate">30°03′N / 31°14′E</span>
        </div>
      </div>
    </section>
  );
}
