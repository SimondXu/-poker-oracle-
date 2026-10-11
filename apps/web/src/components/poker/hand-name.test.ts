import assert from 'node:assert/strict';
import test from 'node:test';

import { describeBestHand, describeRankVector } from './hand-name.ts';

test('describeBestHand names every category from real cards', () => {
  const board = ['Kd', '7c', '2h', '9s', '4d'];
  assert.equal(describeBestHand(['Ah', 'Js'], board), 'Ace High');
  assert.equal(describeBestHand(['Kh', 'Qs'], board), 'Pair of Kings');
  assert.equal(describeBestHand(['Kh', '7s'], board), 'Two Pair, Kings and Sevens');
  assert.equal(describeBestHand(['7h', '7s'], board), 'Three of a Kind, Sevens');
  assert.equal(describeBestHand(['5h', '3s'], ['Ad', '7c', '2h', '9s', '4d']), 'Straight, Five High');
  assert.equal(describeBestHand(['Ad', 'Qd'], ['Kd', '7d', '2d', '9s', '4c']), 'Flush, Ace High');
  assert.equal(describeBestHand(['Kh', 'Ks'], ['Kd', '7c', '7h', '9s', '4d']), 'Full House, Kings full of Sevens');
  assert.equal(describeBestHand(['7h', '7s'], ['7d', '7c', '2h', '9s', '4d']), 'Four of a Kind, Sevens');
  assert.equal(describeBestHand(['Th', 'Jh'], ['Qh', 'Kh', 'Ah', '2c', '3d']), 'Royal Flush');
  assert.equal(describeBestHand(['6h', '7h'], ['8h', '9h', 'Th', '2c', '3d']), 'Straight Flush, Ten High');
});

test('describeBestHand needs five cards; describeRankVector tolerates odd input', () => {
  assert.equal(describeBestHand(['Ah', 'Kh'], ['2c', '3d']), null);
  assert.equal(describeBestHand(['Ah', 'Kh'], ['2c', '3d', '9s']), 'Ace High');
  assert.equal(describeRankVector([0]), '? High');
});
