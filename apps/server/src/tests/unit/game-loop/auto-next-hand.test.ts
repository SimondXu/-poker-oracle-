import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearRoomNextHandTimeout,
  scheduleRoomNextHandTimeout,
  type RoomNextHandTimeouts
} from '../../../game-loop/auto-next-hand.ts';

test('scheduleRoomNextHandTimeout stores an unrefed timer handle', () => {
  const timeouts: RoomNextHandTimeouts = new Map();

  scheduleRoomNextHandTimeout(timeouts, 'room-next-hand-1', 1000, () => {});

  const handle = timeouts.get('room-next-hand-1');
  assert.ok(handle);
  assert.equal(typeof handle.hasRef, 'function');
  assert.equal(handle.hasRef(), false);

  clearRoomNextHandTimeout(timeouts, 'room-next-hand-1');
});

test('clearRoomNextHandTimeout cancels and removes existing timer', () => {
  const timeouts: RoomNextHandTimeouts = new Map();
  let fired = false;

  scheduleRoomNextHandTimeout(timeouts, 'room-next-hand-2', 10, () => {
    fired = true;
  });
  clearRoomNextHandTimeout(timeouts, 'room-next-hand-2');

  assert.equal(timeouts.has('room-next-hand-2'), false);
  assert.equal(fired, false);
});
