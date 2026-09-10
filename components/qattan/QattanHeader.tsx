"use client";

import Link from "next/link";
import { Menu, Moon, Sun, X } from "lucide-react";
import { useState } from "react";
import { qattanLocaleHref, useQattan } from "./QattanProviders";
import AuthButton from "./AuthButton";

/**
 * mnml.ai-style fixed marketing header: locale-aware nav (Explore Tools,
 * Product, Use Cases, Pricing), language toggle, dark/light theme toggle,
 * sign-in, and the primary Get Started button.
 */
export function QattanHeader() {
  const { locale, copy } = useQattan();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const localeTarget = locale === "ar" ? "en" : "ar";
  const navLinks = [
    { label: copy.nav.tools, href: "#tools" },
    { label: copy.nav.solutions, href: "#workflow" },
    { label: copy.nav.useCases, href: "#proof" },
    { label: copy.nav.pricing, href: "#pricing" },
  ];

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.qattanTheme = next;
  };

  return (
    <header className="qattan-header" data-theme={theme}>
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
        </nav>

        <div className="qattan-header-actions">
          <div className="qattan-locale" aria-label={copy.nav.language}>
            <Link href={qattanLocaleHref("en")} aria-current={locale === "en" ? "page" : undefined}>EN</Link>
            <span aria-hidden="true">|</span>
            <Link href={qattanLocaleHref("ar")} aria-current={locale === "ar" ? "page" : undefined}>عربي</Link>
          </div>
          <button
            type="button"
            className="qattan-theme-toggle"
            aria-label={copy.nav.theme}
            aria-pressed={theme === "light"}
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          </button>
          <AuthButton />
          <Link className="qattan-button qattan-button-primary qattan-cta-pulse" href={qattanLocaleHref(locale, "/studio")}>
            {copy.nav.start}
          </Link>
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
          <Link href={qattanLocaleHref(locale, "/studio")} onClick={() => setMobileOpen(false)}>{copy.nav.studio}</Link>
          <div className="qattan-mobile-auth">
            <AuthButton />
          </div>
        </div>
      )}
      <span className="qattan-sr-only" aria-hidden="true">{localeTarget}</span>
    </header>
  );
}
