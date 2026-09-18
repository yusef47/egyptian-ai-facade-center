/**
 * CSRF origin allowlist for state-changing API routes.
 *
 * Browsers attach the `Origin` header to every cross-site POST. Same-origin
 * requests may omit it (some browsers do), so an absent header is allowed —
 * the bearer-token + cookie authentication is the real security boundary;
 * this check only blocks cross-site browser form posts.
 *
 * Allowed:
 * - `https://qattan-ai.com` (apex) and `https://www.qattan-ai.com` (www) —
 *   Vercel serves the site from both, so the allowlist must never 403 the
 *   apex the way a www-only list would.
 * - Any `*.vercel.app` deployment origin (previews, production alias).
 * - `http://localhost:*` / `http://127.0.0.1:*` for local development only.
 */

/** Exact production origins, apex + www, never case- or slash-sensitive. */
export const ALLOWED_SITE_ORIGINS = ["https://qattan-ai.com", "https://www.qattan-ai.com"] as const;

function isLoopOrigin(origin: string): boolean {
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
}

/**
 * True when the request's Origin header is a trusted first-party origin.
 * Requests without an Origin header (same-origin fetches, server-to-server
 * calls, curl) are allowed — authentication remains the authority.
 */
export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.trim();
  if (!origin) return true;

  if ((ALLOWED_SITE_ORIGINS as readonly string[]).includes(origin.toLowerCase())) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    // Any Vercel deployment (production alias, previews): *.vercel.app
    if (hostname === "vercel.app" || hostname.endsWith(".vercel.app")) return true;
    // Local development servers.
    if (isLoopOrigin(origin)) return true;
  } catch {
    return false; // Malformed Origin header — reject.
  }

  return false;
}
