import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useQattan } from "./QattanProviders";

export function PricingPreview() {
  const { copy } = useQattan();
  return (
    <section id="pricing" className="qattan-section qattan-pricing-section">
      <div className="qattan-container qattan-pricing-card">
        <div>
          <p className="qattan-eyebrow">{copy.pricing.eyebrow}</p>
          <h2>{copy.pricing.title}</h2>
          <p className="qattan-pricing-description">{copy.pricing.description}</p>
        </div>
        <div className="qattan-pricing-details">
          <span className="qattan-pricing-badge">{copy.pricing.badge}</span>
          <ul>{copy.pricing.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
          <Link className="qattan-button qattan-button-primary" href="/studio">{copy.pricing.action}<ArrowUpRight size={16} /></Link>
        </div>
      </div>
    </section>
  );
}
