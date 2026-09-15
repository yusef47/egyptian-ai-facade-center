import type { Metadata } from "next";
import QattanMarketingPage from "../../components/qattan/QattanMarketingPage";

/**
 * Canonical + hreflang for the bilingual landing pair. Relative paths resolve
 * against metadataBase (lib/site.ts), so these can never drift off the
 * official origin.
 */
export const metadata: Metadata = {
  alternates: {
    canonical: "/en",
    languages: { en: "/en", ar: "/ar", "x-default": "/en" },
  },
};

export default function EnglishPage() {
  return <QattanMarketingPage locale="en" />;
}
