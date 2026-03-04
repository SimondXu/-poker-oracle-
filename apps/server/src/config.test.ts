import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerConfig } from './config.ts';

test('parseServerConfig uses defaults when env is empty', () => {
  const result = parseServerConfig({});

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, {
    host: '0.0.0.0',
    port: 3001,
    corsOrigin: 'http://localhost:3000',
    authSecret: 'dev-guest-secret-change-me',
    authCookieName: 'aipoker_session',
    authTtlSeconds: 2592000,
    secureCookies: false,
    authStrict: false
  });
});

test('parseServerConfig validates numeric port range', () => {
  const result = parseServerConfig({ PORT: '99999' });

  assert.deepEqual(result, {
    ok: false,
    error: 'invalid_server_config'
  });
});

test('parseServerConfig parses boolean-like security flags', () => {
  const result = parseServerConfig({
    SECURE_COOKIES: 'true',
    AUTH_STRICT: '1'
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.secureCookies, true);
  assert.equal(result.value.authStrict, true);
});
