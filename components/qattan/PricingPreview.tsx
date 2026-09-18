"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, Check } from "lucide-react";
import { useQattan } from "./QattanProviders";
import TopUpModal from "./TopUpModal";

/**
 * Official EGP top-up credit packs (Egypt — InstaPay exclusively). Each card
 * opens the top-up modal with that pack pre-selected. The daily 10 free
 * credits remain the headline; subscriptions stay closed (badge).
 */

type Pack = {
  id: "pack10" | "pack50" | "pack100";
  egp: number;
  credits: number;
  perCredit: string;
  nameEn: string;
  nameAr: string;
  noteEn?: string;
  noteAr?: string;
  featured?: boolean;
};

const PACKS: Pack[] = [
  {
    id: "pack10",
    egp: 50,
    credits: 10,
    perCredit: "5.00",
    nameEn: "Starter Pack",
    nameAr: "باقة البداية",
  },
  {
    id: "pack50",
    egp: 250,
    credits: 50,
    perCredit: "5.00",
    nameEn: "Student Pack",
    nameAr: "باقة الطالب ⭐",
    noteEn: "Most popular",
    noteAr: "الأكثر طلباً",
    featured: true,
  },
  {
    id: "pack100",
    egp: 450,
    credits: 100,
    perCredit: "4.50",
    nameEn: "Pro Pack",
    nameAr: "باقة المحترفين",
    noteEn: "Save 10%",
    noteAr: "وفّر ١٠٪",
  },
];

export function PricingPreview() {
  const { copy, locale } = useQattan();
  const L = locale === "ar";
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [preselected, setPreselected] = useState<Pack["id"]>("pack50");

  const openPack = (id: Pack["id"]) => {
    setPreselected(id);
    setTopUpOpen(true);
  };

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

        <div className="qattan-pricing-grid">
          {PACKS.map((pack, index) => (
            <motion.article
              key={pack.id}
              className={`qattan-pricing-card${pack.featured ? " qattan-pricing-card-featured" : ""}`}
              initial={{ opacity: 0, y: 30, scale: 0.92 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ type: "spring", stiffness: 100, damping: 15, delay: index * 0.1 }}
              whileHover={{ y: -6 }}
              data-testid={`pricing-pack-${pack.id}`}
            >
              {L ? pack.noteAr : pack.noteEn ? (
                <div className="qattan-pricing-soon" aria-label={L ? pack.noteAr : pack.noteEn}>
                  <span>{L ? pack.noteAr : pack.noteEn}</span>
                </div>
              ) : null}
              <div className="qattan-pricing-tier">
                <span className="qattan-pricing-tier-name">{L ? pack.nameAr : pack.nameEn}</span>
                <div className="qattan-pricing-price">
                  <strong>{pack.egp}</strong>
                  <span>{L ? "جنيه مصري" : "EGP"}</span>
                </div>
                <p className="qattan-pricing-credits">
                  {L ? `${pack.credits} كريديت` : `${pack.credits} Credits`}
                  <span className="qattan-pricing-percredit">
                    {" "}
                    · {L ? `${pack.perCredit} ج.م/كريديت` : `${pack.perCredit} EGP/credit`}
                  </span>
                </p>
                <ul className="qattan-pricing-featurelist">
                  {(L
                    ? [
                        "توليد 8K فوري بكل الأدوات الثمانية",
                        "صورة واحدة أو لوحة ثلاثية أو 3 بطاقات",
                        "بدون علامة مائية إطلاقاً",
                        "رصيد لا ينتهي صلاحيته",
                      ]
                    : [
                        "Instant 8K renders across all 8 tools",
                        "Single image, triptych board, or 3 cards",
                        "Zero watermarks, always",
                        "Credits never expire",
                      ]
                  ).map((feature) => (
                    <li key={feature}>
                      <Check size={14} aria-hidden="true" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="qattan-button qattan-button-primary qattan-cta-pulse"
                  data-testid={`pricing-topup-${pack.id}`}
                  onClick={() => openPack(pack.id)}
                >
                  {L ? "اشحن رصيدك" : "Top Up Credits"}
                  <ArrowUpRight size={16} aria-hidden="true" />
                </button>
              </div>
            </motion.article>
          ))}
        </div>

        <TopUpModal open={topUpOpen} onClose={() => setTopUpOpen(false)} initialPack={preselected} />
      </div>
    </section>
  );
}
