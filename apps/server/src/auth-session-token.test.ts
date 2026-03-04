import assert from 'node:assert/strict';
import test from 'node:test';

import { createGuestSessionToken, verifyGuestSessionToken } from './auth/session-token.ts';

test('createGuestSessionToken and verifyGuestSessionToken round-trip guest session', () => {
  const token = createGuestSessionToken({
    userId: 'user-1',
    username: 'Alice',
    nowMs: 1_000,
    ttlSeconds: 60,
    secret: '0123456789abcdef0123456789abcdef'
  });

  const session = verifyGuestSessionToken({
    token,
    nowMs: 30_000,
    secret: '0123456789abcdef0123456789abcdef'
  });

  assert.notEqual(session, null);
  assert.equal(session?.userId, 'user-1');
  assert.equal(session?.username, 'Alice');
  assert.equal(session?.isGuest, true);
});

test('verifyGuestSessionToken rejects tampered token', () => {
  const token = createGuestSessionToken({
    userId: 'user-2',
    username: 'Bob',
    nowMs: 1_000,
    ttlSeconds: 60,
    secret: '0123456789abcdef0123456789abcdef'
  });

  const tampered = `${token}x`;
  const session = verifyGuestSessionToken({
    token: tampered,
    nowMs: 2_000,
    secret: '0123456789abcdef0123456789abcdef'
  });

  assert.equal(session, null);
});

test('verifyGuestSessionToken rejects expired token', () => {
  const token = createGuestSessionToken({
    userId: 'user-3',
    username: 'Carol',
    nowMs: 1_000,
    ttlSeconds: 1,
    secret: '0123456789abcdef0123456789abcdef'
  });

  const session = verifyGuestSessionToken({
    token,
    nowMs: 10_000,
    secret: '0123456789abcdef0123456789abcdef'
  });

  assert.equal(session, null);
});
