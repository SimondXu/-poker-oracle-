import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from '../../../index.ts';
import { attachRealtime } from '../../../realtime.ts';

test('attachRealtime uses the configured Socket.IO CORS origin', async (t) => {
  const app = createServer({ nowMs: () => 42 });
  const io = attachRealtime(app, { corsOrigin: 'http://localhost:3000' });

  t.after(async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await app.close();
  });

  assert.equal((io.engine.opts.cors as { origin?: string }).origin, 'http://localhost:3000');
});
