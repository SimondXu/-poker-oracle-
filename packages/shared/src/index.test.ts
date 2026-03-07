import assert from 'node:assert/strict';
import test from 'node:test';

import {
  err,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
  ok,
  ROOM_CODE_LENGTH,
} from './index.ts';

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

test('normalizeRoomCode uppercases and strips unsupported characters', () => {
  assert.equal(normalizeRoomCode(' ab-c1o '), 'ABC1O');
});

test('isValidRoomCode accepts only canonical invite codes', () => {
  assert.equal(isValidRoomCode('ABC234'), true);
  assert.equal(isValidRoomCode('abc234'), true);
  assert.equal(isValidRoomCode('ABCD12X'), false);
  assert.equal(isValidRoomCode('ABCI23'), false);
  assert.equal(isValidRoomCode('ABO123'), false);
});

test('generateRoomCode returns a canonical invite code', () => {
  const code = generateRoomCode();
  assert.equal(code.length, ROOM_CODE_LENGTH);
  assert.equal(isValidRoomCode(code), true);
});
