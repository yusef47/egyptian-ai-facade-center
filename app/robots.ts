import type { MetadataRoute } from "next";
import { absoluteSiteUrl, SITE_ORIGIN } from "../lib/site";

/**
 * Crawler policy on the official domain. The private surfaces are the admin
 * dashboard, the OAuth callback, and the API routes (which are client-only
 * anyway, but excluding them keeps them out of long-tail crawl queues).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/auth/", "/api/"],
      },
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
    host: SITE_ORIGIN,
  };
}
