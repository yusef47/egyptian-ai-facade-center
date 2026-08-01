import { describe, expect, it } from "vitest";
import { createRateLimiter } from "../src/lib/rateLimit";

describe("restore API rate limiter", () => {
  it("allows a bounded burst and rejects the next request in the window", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 2 });

    expect(limiter.allow("198.51.100.5", 1_000)).toBe(true);
    expect(limiter.allow("198.51.100.5", 1_001)).toBe(true);
    expect(limiter.allow("198.51.100.5", 1_002)).toBe(false);
  });

  it("allows the same client again after the window expires", () => {
    const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1 });

    expect(limiter.allow("198.51.100.5", 1_000)).toBe(true);
    expect(limiter.allow("198.51.100.5", 61_001)).toBe(true);
  });
});
