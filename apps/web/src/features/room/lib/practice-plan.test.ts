import assert from 'node:assert/strict';
import test from 'node:test';

import { PRACTICE_LINEUP, planPracticeSeating } from './practice-plan.ts';

test('plans five bots on the five seats left after the player', () => {
  const steps = planPracticeSeating([0], 0);
  assert.deepEqual(steps.map((step) => step.seatIndex), [1, 2, 3, 4, 5]);
  assert.deepEqual(steps.map((step) => step.strategy), [...PRACTICE_LINEUP]);
});

test('mixes all three personalities', () => {
  assert.deepEqual(new Set(PRACTICE_LINEUP), new Set(['fish', 'tag', 'lag']));
});

test('a retry only adds the missing bots on free seats', () => {
  const steps = planPracticeSeating([0, 1, 2], 2);
  assert.deepEqual(steps.map((step) => step.seatIndex), [3, 4, 5]);
  assert.deepEqual(steps.map((step) => step.strategy), PRACTICE_LINEUP.slice(2));
});

test('plans nothing when the lineup is complete or seats run out', () => {
  assert.deepEqual(planPracticeSeating([0, 1, 2, 3, 4, 5], 5), []);
  assert.deepEqual(planPracticeSeating([0, 1, 2, 3, 4, 5], 0), []);
});

test('the player may sit on any seat (a friend joining a hosted room)', () => {
  const steps = planPracticeSeating([3], 0);
  assert.deepEqual(steps.map((step) => step.seatIndex), [0, 1, 2, 4, 5]);
});
