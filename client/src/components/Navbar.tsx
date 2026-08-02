import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";

function SyndicateEmblem({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <circle cx="20" cy="20" r="18" fill="none" stroke="#c5a059" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="13" fill="none" stroke="#c5a059" strokeWidth="0.8" opacity="0.5" />
      <path d="M11 25 L17 14 L23 25 Z" fill="#c5a059" opacity="0.9" />
      <path d="M19 25 L24 16.5 L29 25 Z" fill="#c5a059" opacity="0.55" />
      <path d="M20 9.5 L21.8 20 L20 30.5 L18.2 20 Z" fill="#f3ead8" opacity="0.9" />
    </svg>
  );
}

function CenterEmblem({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect x="4" y="4" width="32" height="32" rx="6" fill="none" stroke="#c5a059" strokeWidth="1.5" />
      <path d="M11.5 20.5 L20 11.5 L28.5 20.5 Z" fill="none" stroke="#c5a059" strokeWidth="1.2" />
      <path d="M13.5 30 V22" stroke="#c5a059" strokeWidth="1.2" />
      <path d="M20 30 V22" stroke="#c5a059" strokeWidth="1.2" />
      <path d="M26.5 30 V22" stroke="#c5a059" strokeWidth="1.2" />
      <path d="M10.5 30 H29.5" stroke="#c5a059" strokeWidth="1.2" />
    </svg>
  );
}

export default function Navbar() {
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { key: "nav.home" as const, href: "#" },
    { key: "nav.styles" as const, href: "#editions" },
    { key: "nav.studio" as const, href: "#studio" },
    { key: "nav.academy" as const, href: "#academy" },
    { key: "nav.enterprise" as const, href: "#enterprise" },
  ];

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border">
      <div className="container flex items-center justify-between gap-4 h-20">
        {/* Brand */}
        <a href="#" className="flex items-center gap-3 min-w-0" aria-label={t("nav.center")}>
          <div className="flex items-center gap-1.5 shrink-0">
            <SyndicateEmblem />
            <CenterEmblem />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="text-[9px] tracking-[0.22em] uppercase text-gold font-medium whitespace-nowrap">
              {t("nav.syndicate")}
            </p>
            <p className="font-serif text-sm md:text-base font-semibold text-foreground leading-tight truncate max-w-[240px] md:max-w-[400px]">
              {t("nav.center")}
            </p>
          </div>
          <span
            className="inline-flex items-center justify-center rounded border border-gold/40 bg-gold/10 px-1.5 py-0.5 text-sm shrink-0"
            role="img"
            aria-label="Egypt 🇪🇬"
          >
            🇪🇬
          </span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-muted-foreground text-sm hover:text-gold transition-colors duration-200"
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href="#studio"
            className="px-4 py-2 bg-gold text-navy text-sm font-medium rounded hover:bg-gold-light transition-colors duration-200"
          >
            {t("nav.cta")}
          </a>
        </div>

        {/* Language toggle */}
        <div
          className="flex items-center rounded-full border border-gold/40 overflow-hidden shrink-0"
          role="group"
          aria-label="Language"
        >
          <button
            type="button"
            onClick={() => setLang("en")}
            aria-pressed={lang === "en"}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              lang === "en" ? "bg-gold text-navy" : "text-muted-foreground hover:text-gold"
            }`}
          >
            {t("nav.langEn")}
          </button>
          <button
            type="button"
            onClick={() => setLang("ar")}
            aria-pressed={lang === "ar"}
            className={`px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${
              lang === "ar" ? "bg-gold text-navy" : "text-muted-foreground hover:text-gold"
            }`}
          >
            {t("nav.langAr")}
          </button>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden text-foreground shrink-0"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Menu"
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className="lg:hidden bg-background border-b border-border px-4 pb-4">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="block py-3 text-muted-foreground text-sm hover:text-gold transition-colors"
              onClick={() => setMobileOpen(false)}
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href="#studio"
            className="block mt-2 px-4 py-2 bg-gold text-navy text-sm font-medium rounded text-center"
            onClick={() => setMobileOpen(false)}
          >
            {t("nav.cta")}
          </a>
        </div>
      )}
    </nav>
  );
}
