import assert from 'node:assert/strict';
import test from 'node:test';

import { getStreetOpeningPauseMs } from '../../../game-loop/run-bot-turns.ts';

const action = (phase: 'betting_preflop' | 'betting_flop') => ({ phase }) as never;

test('first bot action of a hand waits for the hole-card deal', () => {
  assert.equal(getStreetOpeningPauseMs({ phase: 'betting_preflop', actions: [] }), 1_200);
});

test('first bot action of a new street waits for the closing-action hold and board reveal', () => {
  assert.equal(getStreetOpeningPauseMs({ phase: 'betting_flop', actions: [action('betting_preflop')] }), 1_800);
});

test('later actions on the same street get no extra pause', () => {
  assert.equal(getStreetOpeningPauseMs({ phase: 'betting_flop', actions: [action('betting_flop')] }), 0);
});
