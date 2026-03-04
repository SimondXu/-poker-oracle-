interface RateLimitBucket {
  count: number;
  windowStartMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export function createFixedWindowRateLimiter(windowMs = 60_000) {
  const buckets = new Map<string, RateLimitBucket>();

  return (key: string, nowMs: number, maxRequests: number): RateLimitResult => {
    const existing = buckets.get(key);
    if (!existing || nowMs - existing.windowStartMs >= windowMs) {
      buckets.set(key, {
        count: 1,
        windowStartMs: nowMs
      });
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - 1),
        resetAtMs: nowMs + windowMs
      };
    }

    if (existing.count >= maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAtMs: existing.windowStartMs + windowMs
      };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - existing.count),
      resetAtMs: existing.windowStartMs + windowMs
    };
  };
}
