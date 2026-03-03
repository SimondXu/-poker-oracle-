import assert from 'node:assert/strict';
import test from 'node:test';

import { createHealthStatus, createServer } from './index.ts';

test('createHealthStatus builds stable payload', () => {
  const payload = createHealthStatus(1234);
  assert.deepEqual(payload, {
    service: 'aipoker-server',
    nowMs: 1234,
    ok: true
  });
});

test('GET /health returns service health snapshot', async () => {
  const server = createServer({ nowMs: () => 7788 });

  const response = await server.inject({
    method: 'GET',
    url: '/health'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    service: 'aipoker-server',
    nowMs: 7788,
    ok: true
  });

  await server.close();
});
