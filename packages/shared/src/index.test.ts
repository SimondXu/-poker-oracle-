import assert from 'node:assert/strict';
import test from 'node:test';

import { err, ok } from './index.ts';

test('ok helper wraps value with success result', () => {
  const result = ok(42);
  assert.deepEqual(result, {
    ok: true,
    value: 42
  });
});

test('err helper wraps error with failure result', () => {
  const result = err('bad_action');
  assert.deepEqual(result, {
    ok: false,
    error: 'bad_action'
  });
});
