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
      { playerId: 'utg', phase: 'betting_preflop', type: 'raise_to', toAmount: 60, potTotalBefore: 30 },
      { playerId: 'hero', phase: 'betting_preflop', type: 'call', toAmount: 60, potTotalBefore: 90 },
    ],
    betting: { currentBetToMatch: 60, lastFullRaiseSize: 40 },
  };

  const context = buildDecisionContext(hand, 'hero', VALID);

  assert.equal(context?.preflopLimpersCount, 0);
  assert.equal(context?.bettingState, 'facing_open');
});

test('stack depth and SPR count only chips still behind at the start of the street', () => {
  const flopPlayer = (id: string, seatIndex: number, streetCommitted: number) => ({
    ...player(id, seatIndex, 0),
    stack: 700 - streetCommitted,
    streetCommitted,
    handCommitted: 300 + streetCommitted,
  });
  const hand: DecisionHand = {
    phase: 'betting_flop',
    smallBlind: 5,
    bigBlind: 10,
    buttonMarkerSeat: 0,
    potTotal: 600 + 200 + 200,
    players: [flopPlayer('villain', 0, 200), flopPlayer('hero', 1, 200)],
    communityCards: ['Kh', '7d', '2c'],
    actions: [],
    betting: { currentBetToMatch: 200, lastFullRaiseSize: 200 },
  };

  const context = buildDecisionContext(hand, 'hero', VALID);

  // 30bb went in preflop and a 20bb flop bet was called: 70bb were behind when the flop came, into a 60bb pot.
  assert.equal(context?.effectiveStackBb, 70);
  assert.equal(context?.spr, 700 / 600);
});

test('opponent views record what each live opponent did and what they faced', () => {
  const hand: DecisionHand = {
    phase: 'betting_flop',
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    potTotal: 270,
    players: [
      { ...player('btn', 0, 0), status: 'folded' },
      player('sb', 1, 0),
      player('bb', 2, 0),
      player('hero', 3, 0),
    ],
    communityCards: ['Kh', '7d', '2c'],
    actions: [
      { playerId: 'hero', phase: 'betting_preflop', type: 'call', toAmount: 20, potTotalBefore: 30 },
      { playerId: 'btn', phase: 'betting_preflop', type: 'fold', toAmount: 0, potTotalBefore: 50 },
      { playerId: 'sb', phase: 'betting_preflop', type: 'raise_to', toAmount: 80, potTotalBefore: 50 },
      { playerId: 'bb', phase: 'betting_preflop', type: 'call', toAmount: 80, potTotalBefore: 120 },
      { playerId: 'hero', phase: 'betting_preflop', type: 'call', toAmount: 80, potTotalBefore: 180 },
      { playerId: 'sb', phase: 'betting_flop', type: 'raise_to', toAmount: 160, potTotalBefore: 240 },
      { playerId: 'bb', phase: 'betting_flop', type: 'all_in', toAmount: 100, potTotalBefore: 400 },
    ],
    betting: { currentBetToMatch: 160, lastFullRaiseSize: 160 },
  };

  const views = buildDecisionContext(hand, 'hero', VALID)?.opponents;

  assert.deepEqual(views?.map((view) => view.id), ['sb', 'bb']);
  assert.deepEqual(views?.[0]?.actions, [
    { phase: 'preflop', type: 'raise_to', facing: 'facing_limpers', sizeOfPot: 60 / 50 },
    { phase: 'flop', type: 'raise_to', facing: 'unopened', sizeOfPot: 160 / 240 },
  ]);
  // A short all-in below the bet to match is a call, not a raise.
  assert.deepEqual(views?.[1]?.actions, [
    { phase: 'preflop', type: 'call', facing: 'facing_open', sizeOfPot: 0 },
    { phase: 'flop', type: 'call', facing: 'facing_open', sizeOfPot: 0 },
  ]);
});
