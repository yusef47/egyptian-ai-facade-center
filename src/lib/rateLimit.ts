export type RateLimiter = {
  allow: (key: string, now?: number) => boolean;
};

type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
};

export function createRateLimiter({
  windowMs,
  maxRequests,
}: RateLimiterOptions): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  return {
    allow(key: string, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.startedAt >= windowMs) {
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      if (current.count >= maxRequests) return false;
      current.count += 1;
      return true;
    },
  };
}
