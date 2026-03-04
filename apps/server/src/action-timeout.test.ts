import assert from 'node:assert/strict';
import test from 'node:test';

import { clearRoomActionTimeout, scheduleRoomActionTimeout, type RoomActionTimeouts } from './game-loop/action-timeout.ts';

test('scheduleRoomActionTimeout stores an unrefed timer handle', () => {
  const timeouts: RoomActionTimeouts = new Map();

  scheduleRoomActionTimeout(timeouts, 'room-timeout-1', 1000, () => {});

  const handle = timeouts.get('room-timeout-1');
  assert.ok(handle);
  assert.equal(typeof handle.hasRef, 'function');
  assert.equal(handle.hasRef(), false);

  clearRoomActionTimeout(timeouts, 'room-timeout-1');
});

test('clearRoomActionTimeout cancels and removes existing timer', () => {
  const timeouts: RoomActionTimeouts = new Map();
  let fired = false;

  scheduleRoomActionTimeout(timeouts, 'room-timeout-2', 10, () => {
    fired = true;
  });
  clearRoomActionTimeout(timeouts, 'room-timeout-2');

  assert.equal(timeouts.has('room-timeout-2'), false);
  assert.equal(fired, false);
});
