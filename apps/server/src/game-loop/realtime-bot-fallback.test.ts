import assert from 'node:assert/strict';
import test from 'node:test';

import { selectEmergencyBotActionInput } from './realtime-bot-fallback.ts';

test('selectEmergencyBotActionInput prefers check, then fold, then call, then all-in, then minimum raise', () => {
  assert.deepEqual(
    selectEmergencyBotActionInput('bot-1', {
      canCheck: true,
      canFold: true,
      canCall: true,
      canAllIn: true,
      canRaise: true,
      minRaiseTo: 900,
    }),
    { playerId: 'bot-1', type: 'check' },
  );

  assert.deepEqual(
    selectEmergencyBotActionInput('bot-1', {
      canCheck: false,
      canFold: false,
      canCall: true,
      canAllIn: true,
      canRaise: true,
      minRaiseTo: 900,
    }),
    { playerId: 'bot-1', type: 'call' },
  );

  assert.deepEqual(
    selectEmergencyBotActionInput('bot-1', {
      canCheck: false,
      canFold: false,
      canCall: false,
      canAllIn: false,
      canRaise: true,
      minRaiseTo: 900,
    }),
    { playerId: 'bot-1', type: 'raise_to', amount: 900 },
  );
});
