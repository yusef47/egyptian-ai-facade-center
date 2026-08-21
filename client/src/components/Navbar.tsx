import { useState } from "react";
import { DraftingCompass, Landmark, Menu, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import type { StudioMode } from "@/lib/studio";

const LOGOS = {
  syndicate: "/logos/syndicate-logo.png",
  center: "/logos/center-logo.png",
  flag: "/logos/egypt-flag.png",
} as const;

type NavbarProps = {
  activeStudio?: StudioMode;
  onStudioChange?: (mode: StudioMode) => void;
};

export default function Navbar({ activeStudio = "facade", onStudioChange }: NavbarProps) {
  const { t, lang, setLang } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { key: "nav.home" as const, href: "#top" },
    { key: "nav.studio" as const, href: "#studio" },
    { key: "nav.report" as const, href: "#report" },
  ];

  return (
    <nav className="site-navbar fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-md border-b border-border" dir="rtl">
      <div className="container flex items-center justify-between gap-4 h-20">
        <a href="#top" className="navbar-brand flex items-center gap-3 min-w-0" aria-label={t("nav.center")}>
          <img
            className="navbar-syndicate-logo h-12 w-12 shrink-0 rounded-full object-cover"
            src={LOGOS.syndicate}
            alt="Egyptian Engineers Syndicate logo"
          />
          <img
            className="navbar-flag h-7 w-12 shrink-0 rounded border border-gold/40 object-cover shadow-sm"
            src={LOGOS.flag}
            alt="Egyptian flag"
          />
          <span className="navbar-official-cluster navbar-center-brand flex min-w-0 items-center gap-3">
            <img
              className="navbar-center-logo h-12 w-auto max-w-[88px] shrink-0 rounded object-contain"
              src={LOGOS.center}
              alt="Egyptian Center for AI in Architecture & Urbanism logo"
            />
            <span className="min-w-0 hidden sm:block">
              <span className="block text-[9px] font-medium uppercase tracking-[0.22em] text-gold whitespace-nowrap">
                {t("nav.syndicate")}
              </span>
              <span className="block max-w-[240px] truncate font-cairo text-sm font-semibold leading-tight text-foreground md:max-w-[400px] md:text-base">
                {t("nav.center")}
              </span>
            </span>
          </span>
        </a>

        <div className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors duration-200 hover:text-gold"
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href="#studio"
            className="rounded bg-gold px-4 py-2 text-sm font-medium text-navy transition-colors duration-200 hover:bg-gold-light"
          >
            {t("nav.cta")}
          </a>
        </div>

        <div className="navbar-controls flex shrink-0 items-center gap-3">
          <div className="navbar-language-toggle flex items-center overflow-hidden rounded-full border border-gold/40" role="group" aria-label="Language">
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
          <button
            className="navbar-menu-button text-foreground lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
            type="button"
          >
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <div className="container overflow-x-auto pb-2 pt-1">
        <div className="navbar-studio-tabs mx-auto flex min-w-max items-center justify-center gap-1 rounded-lg border border-gold/20 bg-navy-light/50 p-1" role="tablist" aria-label={t("nav.studioTabs")}>
          <button
            type="button"
            id="facade-studio-tab"
            role="tab"
            aria-selected={activeStudio === "facade"}
            aria-controls="facade-studio-panel"
            onClick={() => onStudioChange?.("facade")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
              activeStudio === "facade"
                ? "bg-gold text-navy shadow-[0_0_16px_rgba(197,160,89,0.2)]"
                : "text-muted-foreground hover:bg-gold/10 hover:text-gold"
            }`}
          >
            <Landmark size={15} aria-hidden="true" />
            {t("nav.facadeTab")}
          </button>
          <button
            type="button"
            id="cad-studio-tab"
            role="tab"
            aria-selected={activeStudio === "cad"}
            aria-controls="cad-studio-panel"
            onClick={() => onStudioChange?.("cad")}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold transition-all duration-200 sm:px-4 sm:text-sm ${
              activeStudio === "cad"
                ? "bg-gold text-navy shadow-[0_0_16px_rgba(197,160,89,0.2)]"
                : "text-muted-foreground hover:bg-gold/10 hover:text-gold"
            }`}
          >
            <DraftingCompass size={15} aria-hidden="true" />
            {t("nav.cadTab")}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-b border-border bg-background px-4 pb-4 lg:hidden">
          {navLinks.map((link) => (
            <a
              key={link.key}
              href={link.href}
              className="block py-3 text-sm text-muted-foreground transition-colors hover:text-gold"
              onClick={() => setMobileOpen(false)}
            >
              {t(link.key)}
            </a>
          ))}
          <a
            href="#studio"
            className="mt-2 block rounded bg-gold px-4 py-2 text-center text-sm font-medium text-navy"
            onClick={() => setMobileOpen(false)}
          >
            {t("nav.cta")}
          </a>
        </div>
      )}
    </nav>
  );
}
