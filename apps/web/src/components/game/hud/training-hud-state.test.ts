import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatTrainingStrength,
  getTrainingDetailLines,
  getTrainingStrengthBarValue,
} from './training-hud-state.ts';

test('formatTrainingStrength renders preflop percentiles and postflop equity differently', () => {
  assert.equal(
    formatTrainingStrength({ kind: 'top_percent', value: 0.08 }),
    'Top 8%',
  );
  assert.equal(
    formatTrainingStrength({ kind: 'equity', value: 0.36 }),
    '权益 36%',
  );
});

test('getTrainingStrengthBarValue inverts top-percent but keeps equity direct', () => {
  assert.equal(getTrainingStrengthBarValue({ kind: 'top_percent', value: 0.08 }), 0.92);
  assert.equal(getTrainingStrengthBarValue({ kind: 'equity', value: 0.36 }), 0.36);
});

test('getTrainingDetailLines includes suggestion reason and threshold explanation when available', () => {
  const lines = getTrainingDetailLines({
    strength: { kind: 'equity', value: 0.41 },
    potOdds: 0.25,
    winRequirement: 0.26,
    suggestion: 'call',
    suggestionReason: '当前权益高于继续投入门槛。',
  });

  assert.deepEqual(lines, [
    '当前权益高于继续投入门槛。',
    '当前底池赔率 25%，继续至少需要 26% 的权益。',
    '你的当前权益约 41%，已经高于继续门槛。',
  ]);
});
