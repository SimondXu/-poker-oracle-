import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from './index.ts';

test('server responses include CSP and baseline security headers', async (t) => {
  const app = createServer({ nowMs: () => 1_000 });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'GET',
    url: '/health'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(typeof response.headers['content-security-policy'], 'string');
  assert.equal(typeof response.headers['x-content-type-options'], 'string');
  assert.equal(typeof response.headers['x-frame-options'], 'string');
});
