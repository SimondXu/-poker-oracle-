import assert from 'node:assert/strict';
import test from 'node:test';

import { SEAT_SLOTS, seatToSlot, slotToSeat } from './seat-slots.ts';

test('the anchor seat is always the bottom slot', () => {
  for (let anchor = 0; anchor < 6; anchor += 1) {
    assert.equal(seatToSlot(anchor, anchor), 0);
  }
});

test('seat and slot mappings invert each other', () => {
  for (let anchor = 0; anchor < 6; anchor += 1) {
    for (let seat = 0; seat < 6; seat += 1) {
      assert.equal(slotToSeat(seatToSlot(seat, anchor), anchor), seat);
    }
  }
});

test('six distinct slots', () => {
  assert.equal(SEAT_SLOTS.length, 6);
  const wide = new Set(SEAT_SLOTS.map((slot) => `${slot.wide.x},${slot.wide.y}`));
  const tall = new Set(SEAT_SLOTS.map((slot) => `${slot.tall.x},${slot.tall.y}`));
  assert.equal(wide.size, 6);
  assert.equal(tall.size, 6);
});
