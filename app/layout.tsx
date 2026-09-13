import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Canonical origin for social/meta URLs. Without metadataBase, Next resolves
 * the relative OG/Twitter image paths against localhost, so link previews
 * (WhatsApp, Facebook, X) came out broken. Overridable per environment.
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://egyptian-ai-facade-center.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Qattan AI | منصة قطان المعمارية",
  description:
    "Transform architectural sketches into photorealistic renders with AI. 10 free daily credits.",
  openGraph: {
    title: "Qattan AI – AI Architectural Visualization",
    description: "Transform sketches into photorealistic architectural renders. Free daily credits.",
    url: SITE_URL,
    siteName: "Qattan AI",
    type: "website",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Qattan AI – AI Architectural Visualization",
    description: "Transform sketches into photorealistic architectural renders.",
    images: ["/og-image.jpg"],
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
