import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext, BotOpponentView } from '@aipoker/shared';

import { adviseFromEquities } from './coach.ts';
import { analyzePostflop, createStableAnalysisRng } from './index.ts';
import { ALL_COMBOS, buildOpponentRange } from './range.ts';

const RIVER: BotDecisionContext = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 1_000,
  canRaise: true,
  minRaiseTo: 2_000,
  maxRaiseTo: 6_000,
  canAllIn: true,
  phase: 'river',
  potTotal: 2_000,
  myStack: 6_000,
  myStreetCommitted: 0,
  currentBetToMatch: 1_000,
  lastFullRaiseSize: 1_000,
  bigBlind: 100,
  smallBlind: 50,
  preflopLimpersCount: 0,
  streetActionCount: 1,
  holeCards: ['3c', '2d'],
  communityCards: ['Kh', '7d', '2c', '9s', 'Jh'],
  activePlayerCount: 2,
  opponentCount: 1,
  position: 'bb',
  effectiveStack: 7_000,
  effectiveStackBb: 70,
  spr: 3.5,
  bettingState: 'facing_open',
  isPreflopAggressor: false,
  isLastStreetAggressor: false,
};

const TRIPLE_BARREL: BotOpponentView = {
  id: 'villain',
  position: 'btn',
  actions: [
    { phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 },
    { phase: 'flop', type: 'raise_to', facing: 'unopened', sizeOfPot: 0.5 },
    { phase: 'turn', type: 'raise_to', facing: 'unopened', sizeOfPot: 0.66 },
    { phase: 'river', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 },
  ],
};

function weightOf(range: Float64Array, first: string, second: string): number {
  const index = ALL_COMBOS.findIndex(([a, b]) => (a === first && b === second) || (a === second && b === first));
  return range[index] ?? 0;
}

test('a six-max UTG raise weights strong hands far above trash', () => {
  const range = buildOpponentRange(
    { ...TRIPLE_BARREL, position: 'utg', actions: TRIPLE_BARREL.actions.slice(0, 1) },
    { ...RIVER, communityCards: [], activePlayerCount: 6 },
  );

  assert.ok(weightOf(range, 'Ah', 'Ad') > 20 * weightOf(range, '7h', '2d'));
});

test('bottom pair facing a triple barrel is a fold against the range, not a call against random hands', () => {
  const versusRandom = analyzePostflop(RIVER, createStableAnalysisRng('river-random'));
  const versusRange = analyzePostflop({ ...RIVER, opponents: [TRIPLE_BARREL] }, createStableAnalysisRng('river-range'));

  assert.equal(versusRandom.equityVs, 'random');
  assert.equal(versusRange.equityVs, 'range');
  // A pot-sized bet needs 1/3 equity to call.
  assert.ok(versusRandom.equity > 1 / 3);
  assert.ok(versusRange.equity < 1 / 3);
  const advice = adviseFromEquities({ ...RIVER, opponents: [TRIPLE_BARREL] }, { postflop: () => versusRange, preflopVsCallers: () => null }, {
    handId: 'h',
    actionIndex: 0,
    stateVersion: 0,
  });
  assert.equal(advice.options[0]?.kind, 'fold');
});

test('a range is cached per stack bucket: 24.6bb and 25.4bb round alike but are read from different charts', () => {
  const opener: BotOpponentView = {
    id: 'cache-key-opener',
    position: 'utg',
    actions: [{ phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 }],
  };
  const preflop = { ...RIVER, communityCards: [], activePlayerCount: 6 };
  const shallow = buildOpponentRange(opener, { ...preflop, effectiveStackBb: 24.6 });
  const deeper = buildOpponentRange(opener, { ...preflop, effectiveStackBb: 25.4 });
  assert.notDeepEqual(deeper, shallow);
});
