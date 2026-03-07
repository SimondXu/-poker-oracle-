import assert from 'node:assert/strict';
import test from 'node:test';

import { getRoomAutoNavigationTarget } from './room-navigation.ts';

test('returns the game route when the room has started playing', () => {
  assert.equal(getRoomAutoNavigationTarget('ROOM42', true), '/game/ROOM42');
});

test('returns null when the room is not yet playing', () => {
  assert.equal(getRoomAutoNavigationTarget('ROOM42', false), null);
});
