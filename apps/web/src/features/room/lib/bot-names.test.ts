import assert from 'node:assert/strict';
import test from 'node:test';
import { getBotDisplayName } from './bot-names.ts';

test('bot names are stable per seat and unique across a 10-seat table', () => {
  const names = Array.from({ length: 10 }, (_, seat) => getBotDisplayName(seat));
  assert.equal(new Set(names).size, 10);
  assert.equal(getBotDisplayName(3), getBotDisplayName(3));
  assert.equal(getBotDisplayName(10), getBotDisplayName(0));
});
