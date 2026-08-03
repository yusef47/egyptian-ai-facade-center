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
    <section className="relative overflow-hidden pt-32 pb-16">
      <div className="absolute inset-0 bg-gradient-to-b from-navy-lighter/30 to-background" />

      <div className="container relative z-10">
        <p className="mb-6 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.3em] text-gold">
          <Sparkles size={14} className="rtl:rotate-180" />
          {t("hero.label")}
        </p>

        <h1 className="mb-6 max-w-4xl font-serif text-4xl font-bold leading-tight text-foreground md:text-5xl lg:text-6xl">
          {t("hero.title")}
        </h1>

        <div
          data-testid="hero-branding"
          className="hero-branding mb-8 flex max-w-xl flex-col items-center gap-4 rounded-xl border border-gold/25 bg-navy-light/35 px-6 py-5 shadow-lg shadow-black/10 sm:max-w-2xl"
          aria-label="Official Egyptian architectural institutions"
        >
          <img
            className="hero-flag h-7 w-12 rounded border border-gold/45 object-cover shadow-sm"
            src="/logos/egypt-flag.png"
            alt="Egyptian flag"
          />
          <div className="flex w-full items-center justify-center gap-5 sm:gap-8">
            <img
              className="hero-syndicate-logo h-16 w-16 rounded-full object-cover shadow-lg shadow-black/25 sm:h-20 sm:w-20"
              src="/logos/syndicate-logo.png"
              alt="Egyptian Engineers Syndicate logo"
            />
            <span className="hero-logo-divider h-16 w-px bg-gradient-to-b from-transparent via-gold to-transparent sm:h-20" aria-hidden="true" />
            <img
              className="hero-center-logo h-16 w-auto max-w-[150px] rounded object-contain shadow-lg shadow-black/20 sm:h-20 sm:max-w-[190px]"
              src="/logos/center-logo.png"
              alt="Egyptian Center for AI in Architecture & Urbanism logo"
            />
          </div>
        </div>

        <p className="mb-10 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
          {t("hero.subtitle")}
        </p>

        <div className="mb-14 flex flex-wrap gap-4">
          <a
            href="#studio"
            className="inline-flex items-center gap-2 rounded bg-gold px-6 py-3 font-medium text-navy transition-all duration-200 hover:bg-gold-light active:scale-[0.97]"
          >
            {t("hero.cta1")} <ArrowRight size={16} className="rtl:rotate-180" />
          </a>
          <a
            href="#studio"
            className="inline-flex items-center gap-2 rounded border border-gold/40 px-6 py-3 font-medium text-gold transition-all duration-200 hover:bg-gold/10 active:scale-[0.97]"
          >
            {t("hero.cta2")}
          </a>
        </div>

        <div className="mb-14 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
          {heroStats.map((stat) => (
            <div key={stat.key} className="flex items-center gap-3 rounded-lg border border-border bg-navy-light/50 px-4 py-3">
              <stat.icon size={16} className="shrink-0 text-gold" />
              <span className="text-sm font-medium text-foreground">{t(stat.key)}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-4 border-t border-border/50 pt-8 md:gap-8">
          {heroBadges.map((badge) => (
            <div key={badge.key} className="flex items-center gap-2">
              <span className="text-gold">✦</span>
              <span className="font-mono text-xs font-medium uppercase tracking-wider text-foreground">{t(badge.key)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
