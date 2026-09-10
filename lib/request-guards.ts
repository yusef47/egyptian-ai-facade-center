/**
 * In-memory request guards for the generation API (single-serverless-instance
 * scope — sufficient for the current deployment scale, and still effective
 * across warm invocations).
 *
 * - `rateLimit`: max N requests per key per rolling 60s window (security brief).
 * - `dedupe`: blocks concurrent duplicate requests from the same user within
 *   a 3-second window, protecting the credit balance from double-fires.
 */

export type GuardResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 5;
const DEDUPE_WINDOW_MS = 3_000;

type Bucket = { hits: number[]; lastSeen: number };

const globalGuards = globalThis as unknown as {
  __qattanRateBuckets?: Map<string, Bucket>;
  __qattanDedupe?: Map<string, number>;
};

const rateBuckets: Map<string, Bucket> = (globalGuards.__qattanRateBuckets ??= new Map());
const dedupeMap: Map<string, number> = (globalGuards.__qattanDedupe ??= new Map());

function pruneExpired(now: number) {
  for (const [key, bucket] of rateBuckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (bucket.hits.length === 0 && now - bucket.lastSeen > RATE_WINDOW_MS * 2) {
      rateBuckets.delete(key);
    }
  }
  for (const [key, ts] of dedupeMap) {
    if (now - ts > DEDUPE_WINDOW_MS) dedupeMap.delete(key);
  }
}

/** Rolling-window rate limit: max 5 requests per key per minute. */
export function rateLimit(key: string): GuardResult {
  const now = Date.now();
  pruneExpired(now);
  const bucket = rateBuckets.get(key) ?? { hits: [], lastSeen: now };
  bucket.hits = bucket.hits.filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.hits.length >= RATE_MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((RATE_WINDOW_MS - (now - bucket.hits[0])) / 1000);
    return { allowed: false, retryAfterSeconds };
  }
  bucket.hits.push(now);
  bucket.lastSeen = now;
  rateBuckets.set(key, bucket);
  return { allowed: true };
}

/** Duplicate-generation guard: one request per user per 3-second window. */
export function dedupe(key: string): GuardResult {
  const now = Date.now();
  pruneExpired(now);
  const last = dedupeMap.get(key);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((DEDUPE_WINDOW_MS - (now - last)) / 1000) };
  }
  dedupeMap.set(key, now);
  return { allowed: true };
}

/** Test seam: clear all guard state. */
export function resetRequestGuards() {
  rateBuckets.clear();
  dedupeMap.clear();
}
