import assert from 'node:assert/strict';
import test from 'node:test';

import { startServer } from '../../../main.ts';

test('startServer listens and serves health endpoint', async (t) => {
  const started = await startServer({
    host: '127.0.0.1',
    port: 0,
    nowMs: () => 4242,
    registerSignalHandlers: false
  });

  t.after(async () => {
    await started.close();
  });

  const response = await fetch(`http://127.0.0.1:${started.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    service: 'aipoker-server',
    nowMs: 4242,
    ok: true
  });
});

test('startServer rejects invalid env config', async () => {
  await assert.rejects(
    () =>
      startServer({
        env: {
          PORT: '99999'
        },
        registerSignalHandlers: false
      }),
    /invalid_server_config/
  );
});
