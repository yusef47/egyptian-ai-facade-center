import type { MetadataRoute } from "next";
import { absoluteSiteUrl } from "../lib/site";

/**
 * Public, indexable surfaces only. `/` is excluded because it redirects to
 * `/en` (a sitemap should list final URLs), and `/admin`, `/auth`, and the API
 * routes are private.
 *
 * Trailing slashes are intentional: `/ar` and `/ar/` are distinct URLs to a
 * crawler, so the sitemap advertises the exact form that `alternates.canonical`
 * declares for each page.
 */
const LAST_MODIFIED = new Date();

const ENGLISH_PAGES: MetadataRoute.Sitemap = [
  {
    url: absoluteSiteUrl("/en"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 1,
    alternates: { languages: { en: absoluteSiteUrl("/en"), ar: absoluteSiteUrl("/ar") } },
  },
  {
    url: absoluteSiteUrl("/ar"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "weekly",
    priority: 0.9,
    alternates: { languages: { en: absoluteSiteUrl("/en"), ar: absoluteSiteUrl("/ar") } },
  },
];

const LEGAL_PAGES: MetadataRoute.Sitemap = [
  {
    url: absoluteSiteUrl("/privacy"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.4,
    alternates: {
      languages: { en: absoluteSiteUrl("/privacy"), ar: absoluteSiteUrl("/ar/privacy") },
    },
  },
  {
    url: absoluteSiteUrl("/ar/privacy"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.3,
    alternates: {
      languages: { en: absoluteSiteUrl("/privacy"), ar: absoluteSiteUrl("/ar/privacy") },
    },
  },
  {
    url: absoluteSiteUrl("/terms"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.4,
    alternates: {
      languages: { en: absoluteSiteUrl("/terms"), ar: absoluteSiteUrl("/ar/terms") },
    },
  },
  {
    url: absoluteSiteUrl("/ar/terms"),
    lastModified: LAST_MODIFIED,
    changeFrequency: "monthly",
    priority: 0.3,
    alternates: {
      languages: { en: absoluteSiteUrl("/terms"), ar: absoluteSiteUrl("/ar/terms") },
    },
  },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...ENGLISH_PAGES,
    { url: absoluteSiteUrl("/studio"), lastModified: LAST_MODIFIED, changeFrequency: "weekly", priority: 0.8 },
    ...LEGAL_PAGES,
  ];
}
