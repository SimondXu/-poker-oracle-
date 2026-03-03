import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseBotAction } from './index.ts';

test('bot chooses check by default when check is available', () => {
  const action = chooseBotAction(
    {
      canCheck: true,
      canCall: true,
      callAmount: 20
    },
    () => 0.9
  );

  assert.deepEqual(action, { type: 'check' });
});

test('bot may choose call over check when rng branch is hit', () => {
  const action = chooseBotAction(
    {
      canCheck: true,
      canCall: true,
      callAmount: 20
    },
    () => 0.1
  );

  assert.deepEqual(action, { type: 'call', amount: 20 });
});

test('bot falls back to call when check is unavailable', () => {
  const action = chooseBotAction(
    {
      canCheck: false,
      canCall: true,
      callAmount: 40
    },
    () => 0.8
  );

  assert.deepEqual(action, { type: 'call', amount: 40 });
});

test('bot folds when neither check nor call are legal', () => {
  const action = chooseBotAction(
    {
      canCheck: false,
      canCall: false,
      callAmount: 0
    },
    () => 0.2
  );

  assert.deepEqual(action, { type: 'fold' });
});
