/**
 * In-memory request guard for the generation API (single-serverless-instance
 * scope — sufficient for the current deployment scale, and still effective
 * across warm invocations).
 *
 * - `rateLimit`: max N requests per key per rolling 60s window.
 *
 * Deliberately simple: no dedupe windows, no client mutexes, no credit
 * caching — those layers produced false rejections in production and were
 * removed per the launch spec. The atomic deduct_credit RPC is the sole
 * authority on balances.
 */

export type GuardResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

const RATE_WINDOW_MS = 60_000;
/**
 * 15 generations per rolling minute: comfortable for students exploring all
 * 9 tools during a testing session, while still blunting abusive bursts.
 */
const RATE_MAX_REQUESTS = 15;

type Bucket = { hits: number[]; lastSeen: number };

/**
 * Friendly bilingual notice returned when the rate limit is hit — smooth and
 * inviting rather than a hard block, per the launch UX brief.
 */
export const RATE_LIMIT_MESSAGE_BILINGUAL =
  "يرجى الانتظار بضع ثوانٍ قبل التوليد التالي. | Please wait a few seconds before the next generation.";

const globalGuards = globalThis as unknown as {
  __qattanRateBuckets?: Map<string, Bucket>;
};

const rateBuckets: Map<string, Bucket> = (globalGuards.__qattanRateBuckets ??= new Map());

function pruneExpired(now: number) {
  for (const [key, bucket] of rateBuckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < RATE_WINDOW_MS);
    if (bucket.hits.length === 0 && now - bucket.lastSeen > RATE_WINDOW_MS * 2) {
      rateBuckets.delete(key);
    }
  }
}

/** Rolling-window rate limit: max 15 requests per key per minute. */
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

/** Test seam: clear all guard state. */
export function resetRequestGuards() {
  rateBuckets.clear();
}
