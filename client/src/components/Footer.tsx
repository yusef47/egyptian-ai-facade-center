import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();

  const productLinks = [
    { key: "nav.styles" as const, href: "#editions" },
    { key: "nav.studio" as const, href: "#studio" },
    { key: "nav.academy" as const, href: "#academy" },
    { key: "nav.enterprise" as const, href: "#enterprise" },
  ];

  const centerLinks = [
    { key: "nav.home" as const, href: "#" },
    { key: "footer.center" as const, href: "#" },
    { key: "footer.product" as const, href: "#" },
  ];

  return (
    <footer className="py-16 border-t border-border">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
          {/* Brand */}
          <div>
            <a href="#" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded bg-gold/20 border border-gold/40 flex items-center justify-center text-base">
                🇪🇬
              </div>
              <div>
                <span className="text-foreground font-serif text-lg font-semibold leading-tight block max-w-xs">
                  {t("nav.center")}
                </span>
                <p className="text-muted-foreground text-[10px] tracking-[0.2em] uppercase mt-1">
                  {t("footer.tagline")}
                </p>
              </div>
            </a>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
              {t("footer.about")}
            </p>
          </div>

          {/* Platform Links */}
          <div>
            <h4 className="text-foreground font-medium text-sm mb-4">{t("footer.product")}</h4>
            <ul className="space-y-2">
              {productLinks.map((link) => (
                <li key={link.key}>
                  <a href={link.href} className="text-muted-foreground text-sm hover:text-gold transition-colors">
                    {t(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Center Links */}
          <div>
            <h4 className="text-foreground font-medium text-sm mb-4">{t("footer.center")}</h4>
            <ul className="space-y-2">
              {centerLinks.map((link) => (
                <li key={link.key}>
                  <a href={link.href} className="text-muted-foreground text-sm hover:text-gold transition-colors">
                    {t(link.key)}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border pt-8">
          <p className="text-muted-foreground text-xs mb-6">{t("footer.rights")}</p>

          {/* Disclaimer */}
          <div className="bg-navy-light/30 rounded p-4">
            <p className="text-muted-foreground text-xs leading-relaxed">
              <span className="text-gold font-medium">DISCLAIMER</span> — {t("footer.disclaimer")}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
