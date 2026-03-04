import assert from 'node:assert/strict';
import test from 'node:test';

import { parseCookies } from '../../../auth/cookies.ts';

test('parseCookies parses basic cookie pairs', () => {
  const parsed = parseCookies('a=1; b=hello%20world');
  assert.equal(parsed.get('a'), '1');
  assert.equal(parsed.get('b'), 'hello world');
});

test('parseCookies tolerates malformed url-encoded cookie values', () => {
  const parsed = parseCookies('good=ok; bad=%E0%A4%A');
  assert.equal(parsed.get('good'), 'ok');
  assert.equal(parsed.get('bad'), '%E0%A4%A');
});
