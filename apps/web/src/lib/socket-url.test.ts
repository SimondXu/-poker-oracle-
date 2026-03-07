import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveServerUrl } from './socket.ts';

test('resolveServerUrl prefers explicit environment configuration', () => {
  assert.equal(
    resolveServerUrl('https://api.example.com', {
      protocol: 'https:',
      hostname: 'play.example.com',
      origin: 'https://play.example.com',
    }),
    'https://api.example.com',
  );
});

test('resolveServerUrl uses the dev socket port for local http hosts', () => {
  assert.equal(
    resolveServerUrl(undefined, {
      protocol: 'http:',
      hostname: 'localhost',
      origin: 'http://localhost:3000',
    }),
    'http://localhost:3001',
  );
});

test('resolveServerUrl keeps same-origin on https pages to avoid mixed content', () => {
  assert.equal(
    resolveServerUrl(undefined, {
      protocol: 'https:',
      hostname: 'play.example.com',
      origin: 'https://play.example.com',
    }),
    'https://play.example.com',
  );
});
