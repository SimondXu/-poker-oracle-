import assert from 'node:assert/strict';
import test from 'node:test';

import { translate } from '../../../i18n/translate.ts';
import { getRoomErrorKey } from './room-errors.ts';

const FALLBACK = 'lobby.room.error.join';

test('room_full and too_many_players map to their own copy, in both locales', () => {
  for (const code of ['room_full', 'too_many_players', 'not_room_member', 'rate_limited', 'not_room_host']) {
    const key = getRoomErrorKey(code, FALLBACK);
    assert.notEqual(key, FALLBACK, code);
    for (const locale of ['en', 'zh'] as const) {
      const text = translate(locale, key);
      assert.notEqual(text, key, `${code} has no ${locale} copy`);
      assert.ok(!text.includes(code), `${code} leaks into ${locale} copy`);
    }
  }
  assert.match(translate('en', getRoomErrorKey('room_full', FALLBACK)), /9 seats/);
});

test('unknown, missing and prototype-named codes fall back instead of leaking', () => {
  assert.equal(getRoomErrorKey(undefined, FALLBACK), FALLBACK);
  assert.equal(getRoomErrorKey('', FALLBACK), FALLBACK);
  assert.equal(getRoomErrorKey('something_new', FALLBACK), FALLBACK);
  assert.equal(getRoomErrorKey('constructor', FALLBACK), FALLBACK);
  assert.equal(getRoomErrorKey('toString', FALLBACK), FALLBACK);
});
