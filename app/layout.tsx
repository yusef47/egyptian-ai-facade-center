import type { Metadata } from "next";
import type { ReactNode } from "react";
import { absoluteSiteUrl, SITE_ORIGIN } from "../lib/site";
import "./globals.css";

/**
 * Canonical origin: https://www.qattan-ai.com (see lib/site.ts). Declaring it
 * via metadataBase *and* absolute OG/Twitter URLs keeps link previews
 * (WhatsApp, Facebook, X) on the official domain instead of resolving against
 * localhost.
 */
const OG_IMAGE_URL = absoluteSiteUrl("/og-image.jpg");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: "Qattan AI | منصة قطان المعمارية",
  description:
    "Transform architectural sketches into photorealistic renders with AI. 10 free daily credits.",
  openGraph: {
    title: "Qattan AI – AI Architectural Visualization",
    description: "Transform sketches into photorealistic architectural renders. Free daily credits.",
    url: SITE_ORIGIN,
    siteName: "Qattan AI",
    type: "website",
    images: [{ url: OG_IMAGE_URL, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Qattan AI – AI Architectural Visualization",
    description: "Transform sketches into photorealistic architectural renders.",
    images: [OG_IMAGE_URL],
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

/**
 * Restores the saved language and theme from localStorage BEFORE first paint,
 * eliminating any flash of the wrong theme or language. Blocking script —
 * kept deliberately tiny.
 */
const themeBootScript = `
(function(){try{
var t=localStorage.getItem("qattan-theme");
if(t==="light"||t==="dark"){document.documentElement.dataset.qattanTheme=t;}
var l=localStorage.getItem("qattan-lang");
if(l==="ar"||l==="en"){
document.documentElement.lang=l;
document.documentElement.dir=l==="ar"?"rtl":"ltr";
document.documentElement.dataset.qattanLocale=l;
}
var p=location.pathname;
if(p==="/"&&l==="ar"){location.replace("/ar");}
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
