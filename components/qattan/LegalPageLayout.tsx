import Link from "next/link";
import type { ReactNode } from "react";
import { ShieldCheck } from "lucide-react";

export type LegalSection = { heading: string; body: string[] };

type LegalPageLayoutProps = {
  title: string;
  subtitle: string;
  effectiveLabel: string;
  backLabel: string;
  sections: LegalSection[];
  direction?: "ltr" | "rtl";
  children?: ReactNode;
};

/**
 * Shared obsidian & gold layout for the legal pages (Privacy Policy, Terms
 * of Service) in both locales. Server component — no interactivity needed.
 */
export default function LegalPageLayout({
  title,
  subtitle,
  effectiveLabel,
  backLabel,
  sections,
  direction = "ltr",
}: LegalPageLayoutProps) {
  return (
    <main className="qattan-legal" dir={direction} lang={direction === "rtl" ? "ar" : "en"}>
      <div className="qattan-legal-inner">
        <header className="qattan-legal-header">
          <p className="qattan-legal-eyebrow">
            <ShieldCheck size={14} aria-hidden="true" /> Qattan AI
          </p>
          <h1 className="qattan-legal-title">{title}</h1>
          <p className="qattan-legal-subtitle">{subtitle}</p>
          <p className="qattan-legal-effective">{effectiveLabel}</p>
        </header>

        <div className="qattan-legal-body">
          {sections.map((section) => (
            <section key={section.heading} className="qattan-legal-section">
              <h2>{section.heading}</h2>
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="qattan-legal-footer">
          <Link className="qattan-admin-back" href="/en">
            {backLabel}
          </Link>
        </div>
      </div>
    </main>
  );
}
