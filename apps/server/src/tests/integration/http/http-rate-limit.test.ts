import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from '../../../index.ts';

test('API routes return 429 after per-minute limit is exceeded', async (t) => {
  let now = 1_000;
  const app = createServer({
    nowMs: () => now,
    httpRateLimitPerMinute: 2
  });

  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Alice' }
  });
  assert.equal(first.statusCode, 200);

  const second = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Bob' }
  });
  assert.equal(second.statusCode, 200);

  const third = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Carol' }
  });
  assert.equal(third.statusCode, 429);
  assert.deepEqual(third.json(), { ok: false, error: 'rate_limited' });

  now += 60_000;
  const fourth = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Dora' }
  });
  assert.equal(fourth.statusCode, 200);
});

test('non-API routes are not rate-limited by API limiter', async (t) => {
  const app = createServer({
    nowMs: () => 2_000,
    httpRateLimitPerMinute: 1
  });

  t.after(async () => {
    await app.close();
  });

  const first = await app.inject({
    method: 'GET',
    url: '/health'
  });
  const second = await app.inject({
    method: 'GET',
    url: '/health'
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});
