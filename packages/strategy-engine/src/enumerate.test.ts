import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext, BotOpponentView } from '@aipoker/shared';

import { createStableAnalysisRng } from './cards.ts';
import { decide, samplingChooser, type Equities } from './decide.ts';
import { enumerateDecision } from './enumerate.ts';
import type { PostflopAnalysis, PostflopFeatures } from './types.ts';

const BASE: BotDecisionContext = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 100,
  canRaise: true,
  minRaiseTo: 200,
  maxRaiseTo: 2_000,
  canAllIn: true,
  phase: 'preflop',
  potTotal: 150,
  myStack: 1_900,
  myStreetCommitted: 0,
  currentBetToMatch: 100,
  lastFullRaiseSize: 100,
  bigBlind: 100,
  smallBlind: 50,
  preflopLimpersCount: 0,
  streetActionCount: 0,
  holeCards: ['Ah', 'Jh'],
  communityCards: [],
  activePlayerCount: 2,
  opponentCount: 1,
  position: 'btn',
  effectiveStack: 2_000,
  effectiveStackBb: 20,
  spr: 10,
  bettingState: 'facing_open',
  isPreflopAggressor: false,
  isLastStreetAggressor: false,
};

const NO_FEATURES: PostflopFeatures = {
  flushDraw: false,
  backdoorFlushDraw: false,
  oesd: false,
  gutshot: false,
  backdoorStraightDraw: false,
  twoOvercards: false,
  pairPlusDraw: false,
  boardPaired: false,
  boardMonotone: false,
  boardConnected: false,
};

/** Fixed estimates, so the only randomness left is the policy's own. */
function fixedEquities(analysis: Partial<PostflopAnalysis> | null, preflopVsCallers: number | null = null): Equities {
  return {
    postflop: () => {
      assert.ok(analysis, 'this spot should not need a postflop analysis');
      return { equity: 0.5, madeHandRank: 0, madeHandStrength: 0, equityVs: 'range', ...analysis, features: { ...NO_FEATURES, ...analysis.features } };
    },
    preflopVsCallers: () => preflopVsCallers,
  };
}

const RAISER: BotOpponentView = {
  id: 'villain',
  position: 'bb',
  actions: [{ phase: 'preflop', type: 'call', facing: 'facing_open', sizeOfPot: 0 }],
};

// The hero covers the shove, so the only ways to continue are a call.
const FACING_SHOVE: BotDecisionContext = {
  ...BASE,
  canRaise: false,
  canAllIn: false,
  myStack: 3_000,
  callAmount: 1_900,
  currentBetToMatch: 2_000,
  potTotal: 2_150,
  holeCards: ['9h', '9d'],
  bettingState: 'facing_3bet_plus',
  opponents: [{ id: 'villain', position: 'utg', actions: [{ phase: 'preflop', type: 'all_in', facing: 'unopened', sizeOfPot: 13 }] }],
};

const SPOTS: Array<{ name: string; context: BotDecisionContext; equities: Equities }> = [
  { name: 'preflop facing an open', context: BASE, equities: fixedEquities(null) },
  {
    name: 'unopened flop with a flush draw and the initiative',
    context: {
      ...BASE,
      phase: 'flop',
      canCheck: true,
      canCall: false,
      callAmount: 0,
      currentBetToMatch: 0,
      potTotal: 400,
      holeCards: ['Ah', '5h'],
      communityCards: ['Kh', '7h', '2c'],
      bettingState: 'unopened',
      isPreflopAggressor: true,
      opponents: [RAISER],
      selfView: { id: 'hero', position: 'btn', actions: [{ phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 }] },
    },
    equities: fixedEquities({ equity: 0.36, features: { ...NO_FEATURES, flushDraw: true } }),
  },
  {
    name: 'facing a flop bet near the price',
    context: {
      ...BASE,
      phase: 'flop',
      callAmount: 100,
      currentBetToMatch: 100,
      potTotal: 300,
      holeCards: ['Qd', '9c'],
      communityCards: ['Kh', '7s', '2c'],
      opponents: [RAISER],
    },
    equities: fixedEquities({ equity: 0.3 }),
  },
];

const SAMPLES = 5_000;

for (const spot of SPOTS) {
  test(`enumerated frequencies match sampled play: ${spot.name}`, () => {
    const outcomes = enumerateDecision(spot.context, 'tag', spot.equities);
    const total = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
    assert.ok(Math.abs(total - 1) < 1e-9, `probabilities sum to ${total}`);

    const rng = createStableAnalysisRng(`enumerate:${spot.name}`);
    const counts = new Map<string, number>();
    for (let i = 0; i < SAMPLES; i += 1) {
      const key = JSON.stringify(decide(spot.context, 'tag', samplingChooser(rng), spot.equities));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const enumerated = new Map(outcomes.map((outcome) => [JSON.stringify(outcome.action), outcome.probability]));
    for (const key of counts.keys()) {
      assert.ok(enumerated.has(key), `sampled ${key}, which enumeration missed`);
    }
    for (const [key, probability] of enumerated) {
      const sampled = (counts.get(key) ?? 0) / SAMPLES;
      // Three standard errors of a 5,000-draw frequency is at most 0.021.
      assert.ok(Math.abs(sampled - probability) < 0.03, `${key}: enumerated ${probability.toFixed(3)}, sampled ${sampled.toFixed(3)}`);
    }
  });
}

test('facing a shove, the price check decides every branch: call with the price, fold without it', () => {
  // Calling 1,900 to win 4,050 needs about 47% plus TAG's call buffer.
  const priced = enumerateDecision(FACING_SHOVE, 'tag', fixedEquities(null, 0.6));
  assert.deepEqual(priced.map(({ action, probability }) => ({ action, probability })), [{ action: { type: 'call', amount: 1_900 }, probability: 1 }]);
  assert.ok(priced[0]!.reasons.some((reason) => reason.code === 'price_ok'));

  const short = enumerateDecision(FACING_SHOVE, 'tag', fixedEquities(null, 0.4));
  assert.deepEqual(short.map(({ action, probability }) => ({ action, probability })), [{ action: { type: 'fold' }, probability: 1 }]);
  assert.ok(short[0]!.reasons.some((reason) => reason.code === 'price_short'));
});

test('reasons belong to the paths that use them: a slowplay is a reason only for the check', () => {
  const nearLock: BotDecisionContext = {
    ...SPOTS.find((spot) => spot.name.startsWith('unopened flop'))!.context,
    holeCards: ['Kd', 'Kc'],
    communityCards: ['Ks', '7h', '2c'],
  };
  const outcomes = enumerateDecision(nearLock, 'tag', fixedEquities({ equity: 0.85 }));
  const check = outcomes.find((outcome) => outcome.action.type === 'check');
  const bet = outcomes.find((outcome) => outcome.action.type === 'raise_to');
  assert.ok(check && bet, JSON.stringify(outcomes));
  assert.ok(check.reasons.some((reason) => reason.code === 'slowplay'));
  assert.ok(!bet.reasons.some((reason) => reason.code === 'slowplay'));
  assert.ok(bet.reasons.some((reason) => reason.code === 'value'));
});

test('every spot above is a real mix, so the comparison is not trivial', () => {
  for (const spot of SPOTS) {
    assert.ok(enumerateDecision(spot.context, 'tag', spot.equities).length >= 2, spot.name);
  }
});

test('a NaN chance is never taken, as rng() < NaN is never true for a bot', () => {
  const facingBet = SPOTS.find((spot) => spot.name.startsWith('facing a flop bet'))!;
  const outcomes = enumerateDecision(facingBet.context, 'tag', fixedEquities({ equity: Number.NaN }));
  const total = outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  assert.ok(outcomes.every((outcome) => Number.isFinite(outcome.probability)), JSON.stringify(outcomes));
  assert.ok(Math.abs(total - 1) < 1e-9);
});
