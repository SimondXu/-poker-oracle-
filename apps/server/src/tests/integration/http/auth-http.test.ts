import assert from 'node:assert/strict';
import test from 'node:test';

import { createServer } from '../../../index.ts';

function cookiePair(setCookieHeader: string): string {
  return setCookieHeader.split(';', 1)[0] ?? setCookieHeader;
}

test('POST /api/auth/guest sets cookie and returns guest user', async (t) => {
  const app = createServer({ nowMs: () => 1000 });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Alice' }
  });

  assert.equal(response.statusCode, 200);
  const setCookie = response.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  assert.equal(setCookie.includes('HttpOnly'), true);

  const body = response.json() as {
    ok: boolean;
    user: { id: string; username: string; isGuest: boolean };
  };
  assert.equal(body.ok, true);
  assert.equal(body.user.username, 'Alice');
  assert.equal(body.user.isGuest, true);
});

test('GET /api/auth/me resolves current guest from cookie', async (t) => {
  const app = createServer({ nowMs: () => 2000 });

  t.after(async () => {
    await app.close();
  });

  const guestResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/guest',
    payload: { username: 'Bob' }
  });
  const setCookie = guestResponse.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');

  const meResponse = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    headers: {
      cookie: cookiePair(setCookie)
    }
  });

  assert.equal(meResponse.statusCode, 200);
  const body = meResponse.json() as {
    ok: boolean;
    user: { id: string; username: string; isGuest: boolean };
  };
  assert.equal(body.ok, true);
  assert.equal(body.user.username, 'Bob');
  assert.equal(body.user.isGuest, true);
});

test('POST /api/auth/logout clears auth cookie', async (t) => {
  const app = createServer({ nowMs: () => 3000 });

  t.after(async () => {
    await app.close();
  });

  const logoutResponse = await app.inject({
    method: 'POST',
    url: '/api/auth/logout'
  });

  assert.equal(logoutResponse.statusCode, 200);
  const setCookie = logoutResponse.headers['set-cookie'];
  assert.equal(typeof setCookie, 'string');
  assert.equal(setCookie.includes('Max-Age=0'), true);
});
