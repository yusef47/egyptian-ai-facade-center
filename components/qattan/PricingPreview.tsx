"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { useQattan } from "./QattanProviders";

/**
 * mnml.ai-style pricing tier card with a prominent "SOON / قريباً" overlay —
 * the layout ships today while subscriptions remain closed.
 */
export function PricingPreview() {
  const { copy, locale } = useQattan();
  const tier = copy.pricing.tier;

  return (
    <section id="pricing" className="qattan-section qattan-pricing-section">
      <div className="qattan-container">
        <motion.div
          className="qattan-section-heading qattan-section-heading-centered"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: [0.23, 1, 0.32, 1] as [number, number, number, number] }}
        >
          <p className="qattan-eyebrow">{copy.pricing.eyebrow}</p>
          <h2>{copy.pricing.title}</h2>
          <p>{copy.pricing.description}</p>
        </motion.div>

        <motion.div
          className="qattan-pricing-card"
          initial={{ opacity: 0, y: 30, scale: 0.92 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ type: "spring", stiffness: 100, damping: 15 }}
          whileHover={{ y: -6 }}
        >
          <div className="qattan-pricing-soon" aria-label={copy.pricing.badge}>
            <span>{copy.pricing.badge}</span>
          </div>
          <div className="qattan-pricing-tier">
            <span className="qattan-pricing-tier-name">{tier.name}</span>
            <div className="qattan-pricing-price">
              <strong>{tier.price}</strong>
              <span>{tier.period}</span>
            </div>
            <ul className="qattan-pricing-featurelist">
              {tier.features.map((feature) => (
                <li key={feature}>
                  <Check size={14} aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
            <Link className="qattan-button qattan-button-primary qattan-cta-pulse" href={locale === "ar" ? "/ar/studio" : "/studio"}>
              {tier.action}<ArrowUpRight size={16} aria-hidden="true" />
            </Link>
            <a className="qattan-pricing-allplans" href="#pricing">{copy.pricing.action}</a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
