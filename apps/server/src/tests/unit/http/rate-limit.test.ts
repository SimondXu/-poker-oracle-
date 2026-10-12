import assert from 'node:assert/strict';
import test from 'node:test';

import { createFixedWindowRateLimiter } from '../../../http/rate-limit.ts';

test('fixed window rate limiter evicts buckets whose window has expired', () => {
  const limiter = createFixedWindowRateLimiter(1_000);
  for (let index = 0; index < 100; index += 1) {
    limiter(`ip:${index}`, 0, 5);
  }
  assert.equal(limiter.size(), 100);

  limiter('ip:fresh', 5_000, 5);
  assert.equal(limiter.size(), 1, 'expired buckets are swept once a window has passed');
});
