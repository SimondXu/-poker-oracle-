import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerConfig } from './config.ts';

test('parseServerConfig uses defaults when env is empty', () => {
  const result = parseServerConfig({});

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, {
    host: '0.0.0.0',
    port: 3001
  });
});

test('parseServerConfig validates numeric port range', () => {
  const result = parseServerConfig({ PORT: '99999' });

  assert.deepEqual(result, {
    ok: false,
    error: 'invalid_server_config'
  });
});
