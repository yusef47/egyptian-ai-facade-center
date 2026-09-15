import type { Metadata } from "next";
import QattanMarketingPage from "../../components/qattan/QattanMarketingPage";

/**
 * Canonical + hreflang for the bilingual landing pair. Relative paths resolve
 * against metadataBase (lib/site.ts), so these can never drift off the
 * official origin.
 */
export const metadata: Metadata = {
  alternates: {
    canonical: "/ar",
    languages: { en: "/en", ar: "/ar", "x-default": "/en" },
  },
};

export default function ArabicPage() {
  return <QattanMarketingPage locale="ar" />;
}
