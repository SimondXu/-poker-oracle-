import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDecisionContext, type DecisionHand } from './index.ts';

const VALID = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 60,
  canRaise: true,
  minRaiseTo: 100,
  maxRaiseTo: 1_000,
  canAllIn: true,
};

function player(id: string, seatIndex: number, streetCommitted: number) {
  return {
    id,
    seatIndex,
    stack: 1_000 - streetCommitted,
    streetCommitted,
    handCommitted: streetCommitted,
    status: 'active',
    holeCards: id === 'hero' ? (['Ah', 'Kd'] as const) : [],
  };
}

test('a call of an open raise is not counted as a limp', () => {
  const hand: DecisionHand = {
    phase: 'betting_preflop',
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    potTotal: 150,
    players: [player('btn', 0, 0), player('sb', 1, 10), player('bb', 2, 20), player('utg', 3, 60), player('hero', 4, 60)],
    communityCards: [],
    actions: [
      { playerId: 'utg', phase: 'betting_preflop', type: 'raise_to', toAmount: 60 },
      { playerId: 'hero', phase: 'betting_preflop', type: 'call', toAmount: 60 },
    ],
    betting: { currentBetToMatch: 60, lastFullRaiseSize: 40 },
  };

  const context = buildDecisionContext(hand, 'hero', VALID);

  assert.equal(context?.preflopLimpersCount, 0);
  assert.equal(context?.bettingState, 'facing_open');
});
