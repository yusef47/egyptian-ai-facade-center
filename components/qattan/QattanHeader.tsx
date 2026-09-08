"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { qattanLocaleHref, useQattan } from "./QattanProviders";

export function QattanHeader() {
  const { locale, copy } = useQattan();
  const [mobileOpen, setMobileOpen] = useState(false);
  const localeTarget = locale === "ar" ? "en" : "ar";
  const navLinks = [
    { label: copy.nav.tools, href: "#tools" },
    { label: copy.nav.solutions, href: "#workflow" },
    { label: copy.nav.pricing, href: "#pricing" },
  ];

  return (
    <header className="qattan-header">
      <div className="qattan-container qattan-header-inner">
        <Link className="qattan-brand" href={qattanLocaleHref(locale)} aria-label={`${copy.brand} — ${copy.tagline}`}>
          <span className="qattan-brand-mark" aria-hidden="true">Q</span>
          <span className="qattan-brand-copy">
            <span>{copy.brand}</span>
            <small>{copy.tagline}</small>
          </span>
        </Link>

        <nav className="qattan-nav" aria-label={copy.nav.tools}>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href}>{link.label}</a>
          ))}
          <Link href="/studio">{copy.nav.studio}</Link>
        </nav>

        <div className="qattan-header-actions">
          <div className="qattan-locale" aria-label={copy.nav.language}>
            <Link href={qattanLocaleHref("en")} aria-current={locale === "en" ? "page" : undefined}>EN</Link>
            <span aria-hidden="true">|</span>
            <Link href={qattanLocaleHref("ar")} aria-current={locale === "ar" ? "page" : undefined}>عربي</Link>
          </div>
          <Link className="qattan-button qattan-button-primary" href="/studio">{copy.nav.start}</Link>
          <button
            type="button"
            className="qattan-menu"
            aria-label={mobileOpen ? copy.nav.close : copy.nav.menu}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="qattan-container qattan-mobile-nav">
          {navLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMobileOpen(false)}>{link.label}</a>)}
          <Link href="/studio" onClick={() => setMobileOpen(false)}>{copy.nav.studio}</Link>
        </div>
      )}
    </header>
  );
}
