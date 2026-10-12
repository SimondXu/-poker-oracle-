interface RateLimitBucket {
  count: number;
  windowStartMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

export type FixedWindowRateLimiter = ReturnType<typeof createFixedWindowRateLimiter>;

export function createFixedWindowRateLimiter(windowMs = 60_000) {
  const buckets = new Map<string, RateLimitBucket>();
  let lastSweepMs = 0;

  // Drop expired buckets at most once per window so one-off keys cannot grow the map forever.
  function sweepExpired(nowMs: number): void {
    if (nowMs - lastSweepMs < windowMs) {
      return;
    }
    lastSweepMs = nowMs;
    for (const [key, bucket] of buckets) {
      if (nowMs - bucket.windowStartMs >= windowMs) {
        buckets.delete(key);
      }
    }
  }

  const limit = (key: string, nowMs: number, maxRequests: number): RateLimitResult => {
    sweepExpired(nowMs);
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

  return Object.assign(limit, { size: () => buckets.size });
}
