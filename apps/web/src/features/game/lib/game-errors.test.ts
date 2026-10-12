import assert from 'node:assert/strict';
import test from 'node:test';

import { translate } from '../../../i18n/translate.ts';
import { getGameErrorKey } from './game-errors.ts';

const FALLBACK = 'common.game.toast.actionFailed';

test('game and room error codes resolve to translated copy, never to the raw code', () => {
  const codes = [
    'stale_state_version',
    'duplicate_action_seq',
    'not_current_actor',
    'hand_not_started',
    'hand_not_actionable',
    'invalid_action',
    'too_many_players',
    'room_full',
    'not_room_member',
    'players_not_ready',
    'hand_already_started',
  ];
  for (const code of codes) {
    const key = getGameErrorKey(code, FALLBACK);
    assert.notEqual(key, FALLBACK, code);
    for (const locale of ['en', 'zh'] as const) {
      const text = translate(locale, key);
      assert.notEqual(text, key, `${code} has no ${locale} copy`);
      assert.ok(!text.includes(code), `${code} leaks into ${locale} copy`);
    }
  }
});

test('unknown or missing codes use the caller fallback', () => {
  assert.equal(getGameErrorKey(undefined, FALLBACK), FALLBACK);
  assert.equal(getGameErrorKey('totally_new_error', FALLBACK), FALLBACK);
  assert.equal(getGameErrorKey('hasOwnProperty', FALLBACK), FALLBACK);
});

test('every game.* toast and error key has English and Chinese copy', () => {
  const keys = [
    'common.game.player.fallbackName',
    'common.game.toast.reconnecting',
    'common.game.toast.reconnected',
    'common.game.toast.sessionFailed',
    'common.game.toast.invalidPlayer',
    'common.game.toast.identityMissing',
    'common.game.toast.joinFailed',
    'common.game.toast.actionFailed',
    'common.game.toast.nextHandFailed',
    'common.game.toast.requestTimeout',
    'common.game.toast.spectateTimeout',
    'common.game.toast.spectateNotAllowed',
    'common.game.toast.spectateFailed',
    'common.game.error.generic',
  ] as const;
  for (const key of keys) {
    assert.notEqual(translate('en', key), key);
    assert.match(translate('zh', key), /[\u4e00-\u9fff]/, key);
  }
});
