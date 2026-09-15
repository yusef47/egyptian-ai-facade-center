/**
 * Single source of truth for the canonical origin of the deployed site.
 *
 * Everything that must resolve to an absolute URL (metadataBase, OpenGraph and
 * Twitter card images, canonical link tags, sitemap, robots) reads its origin
 * from here, so the official domain is declared in exactly one place.
 *
 * `NEXT_PUBLIC_SITE_URL` remains an override for preview/staging deployments.
 * The Vercel-inferred production host is deliberately NOT consulted: it can
 * resolve to the apex domain or the deployment host, either of which would
 * silently become the canonical origin and split link previews and search
 * signals away from https://www.qattan-ai.com.
 */
export const OFFICIAL_SITE_ORIGIN = "https://www.qattan-ai.com";

/** Resolves the origin, honouring an explicit environment override. */
export function resolveSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
  return configured ? configured : OFFICIAL_SITE_ORIGIN;
}

/** The canonical origin for this instance (no trailing slash). */
export const SITE_ORIGIN = resolveSiteOrigin();

/**
 * Builds an absolute URL on the canonical origin, e.g.
 * `absoluteSiteUrl("/og-image.jpg")` → `https://www.qattan-ai.com/og-image.jpg`.
 */
export function absoluteSiteUrl(path = "/"): string {
  return new URL(path, `${SITE_ORIGIN}/`).toString();
}
