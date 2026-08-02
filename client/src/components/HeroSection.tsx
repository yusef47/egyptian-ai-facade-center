import { ArrowRight, Landmark, Sparkles, Timer, Trophy } from "lucide-react";
import { useI18n } from "@/lib/i18n";

const heroBadges = [
  { key: "hero.badge1" as const },
  { key: "hero.badge2" as const },
  { key: "hero.badge3" as const },
  { key: "hero.badge4" as const },
];

const heroStats = [
  { icon: Trophy, key: "hero.stat1" as const },
  { icon: Timer, key: "hero.stat2" as const },
  { icon: Landmark, key: "hero.stat3" as const },
];

export default function HeroSection() {
  const { t } = useI18n();

  return (
    <section className="relative pt-32 pb-16 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-navy-lighter/30 to-background" />

      <div className="container relative z-10">
        {/* Section label */}
        <p className="text-gold text-xs tracking-[0.3em] uppercase mb-6 font-medium flex items-center gap-2">
          <Sparkles size={14} className="rtl:rotate-180" />
          {t("hero.label")}
        </p>

        {/* Main heading */}
        <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight mb-6 max-w-4xl">
          {t("hero.title")}
        </h1>

        {/* Description */}
        <p className="text-muted-foreground text-base md:text-lg max-w-2xl leading-relaxed mb-10">
          {t("hero.subtitle")}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-wrap gap-4 mb-14">
          <a
            href="#studio"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gold text-navy font-medium rounded hover:bg-gold-light transition-all duration-200 active:scale-[0.97]"
          >
            {t("hero.cta1")} <ArrowRight size={16} className="rtl:rotate-180" />
          </a>
          <a
            href="#studio"
            className="inline-flex items-center gap-2 px-6 py-3 border border-gold/40 text-gold font-medium rounded hover:bg-gold/10 transition-all duration-200 active:scale-[0.97]"
          >
            {t("hero.cta2")}
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14 max-w-3xl">
          {heroStats.map((stat) => (
            <div
              key={stat.key}
              className="flex items-center gap-3 rounded-lg border border-border bg-navy-light/50 px-4 py-3"
            >
              <stat.icon size={16} className="text-gold shrink-0" />
              <span className="text-foreground text-sm font-medium">{t(stat.key)}</span>
            </div>
          ))}
        </div>

        {/* Bottom Info Bar */}
        <div className="flex flex-wrap gap-4 md:gap-8 pt-8 border-t border-border/50">
          {heroBadges.map((badge) => (
            <div key={badge.key} className="flex items-center gap-2">
              <span className="text-gold">✦</span>
              <span className="text-foreground text-xs uppercase tracking-wider font-mono font-medium">
                {t(badge.key)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
