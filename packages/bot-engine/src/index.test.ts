import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext } from '@aipoker/shared';

import {
  analyzePostflop,
  canonicalizeHoleCards,
  chooseBotAction,
  getPreflopMix,
  getStackBucket,
} from './index.ts';

function sequenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return {
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
    holeCards: ['Ah', 'Kh'],
    communityCards: [],
    activePlayerCount: 6,
    opponentCount: 5,
    position: 'btn',
    effectiveStack: 6_000,
    effectiveStackBb: 60,
    spr: 10,
    bettingState: 'unopened',
    isPreflopAggressor: false,
    isLastStreetAggressor: false,
    ...overrides,
  };
}

test('canonicalizeHoleCards returns canonical pair, suited, and offsuit keys', () => {
  assert.equal(canonicalizeHoleCards(['Kh', 'Ah']), 'AKs');
  assert.equal(canonicalizeHoleCards(['Jd', 'Qs']), 'QJo');
  assert.equal(canonicalizeHoleCards(['8d', '8s']), '88');
});

test('getStackBucket uses the documented depth buckets', () => {
  assert.equal(getStackBucket(12), '<=12bb');
  assert.equal(getStackBucket(12.01), '13-25bb');
  assert.equal(getStackBucket(25), '13-25bb');
  assert.equal(getStackBucket(25.01), '26-60bb');
  assert.equal(getStackBucket(60), '26-60bb');
  assert.equal(getStackBucket(60.01), '>60bb');
});

test('preflop range mixes differentiate fish, tag, and lag personalities', () => {
  const fishMix = getPreflopMix('fish', 60, 'unopened', 'btn', ['Kh', '9h']);
  const tagMix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Kh', '9h']);
  const lagMix = getPreflopMix('lag', 60, 'unopened', 'btn', ['Kh', '9h']);

  assert.ok(lagMix.raise + lagMix.jam > tagMix.raise + tagMix.jam);
  assert.ok(fishMix.call > tagMix.call);
});

test('preflop mixes distinguish exact positions instead of collapsing to early/late buckets', () => {
  const utgMix = getPreflopMix('tag', 60, 'unopened', 'utg', ['Qh', '9h']);
  const hjMix = getPreflopMix('tag', 60, 'unopened', 'hj', ['Qh', '9h']);
  const coMix = getPreflopMix('tag', 60, 'unopened', 'co', ['Qh', '9h']);
  const btnMix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Qh', '9h']);

  assert.notDeepEqual(utgMix, hjMix);
  assert.notDeepEqual(coMix, btnMix);
});

test('preflop raise intent falls back to call when raising is not legal', () => {
  const action = chooseBotAction(
    makeContext({
      holeCards: ['Ah', 'Ad'],
      position: 'utg',
      canRaise: false,
      callAmount: 100,
      canCall: true,
    }),
    'tag',
    () => 0.5,
  );

  assert.equal(action.type, 'call');
  if (action.type === 'call') {
    assert.equal(action.amount, 100);
  }
});

test('heads-up button uses small-blind open sizing preflop', () => {
  const action = chooseBotAction(
    makeContext({
      holeCards: ['Ah', 'Ad'],
      position: 'btn',
      activePlayerCount: 2,
      opponentCount: 1,
      effectiveStack: 6_000,
      effectiveStackBb: 60,
      callAmount: 50,
      potTotal: 150,
      minRaiseTo: 200,
      maxRaiseTo: 1_000,
    }),
    'tag',
    () => 0.5,
  );

  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    assert.equal(action.amount, 300);
  }
});

test('preflop sizing respects the legal raise clamp', () => {
  const action = chooseBotAction(
    makeContext({
      holeCards: ['Ah', 'Ad'],
      position: 'sb',
      minRaiseTo: 150,
      maxRaiseTo: 180,
      canAllIn: false,
    }),
    'tag',
    () => 0.5,
  );

  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    assert.equal(action.amount, 180);
  }
});

test('analyzePostflop uses game-engine evaluation for flush-vs-straight and wheel straight cases', () => {
  const falseStraightFlush = analyzePostflop(
    makeContext({
      phase: 'river',
      holeCards: ['Ah', '2h'],
      communityCards: ['Kh', 'Qh', 'Jh', 'Td', '9c'],
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
    }),
    () => 0.99,
  );
  assert.equal(falseStraightFlush.madeHandRank, 5);

  const wheel = analyzePostflop(
    makeContext({
      phase: 'flop',
      holeCards: ['Ah', '2d'],
      communityCards: ['3c', '4s', '5h'],
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
    }),
    () => 0.99,
  );
  assert.equal(wheel.madeHandRank, 4);
});

test('tag recognizes a wheel straight and continues versus a small bet', () => {
  const action = chooseBotAction(
    makeContext({
      phase: 'flop',
      holeCards: ['Ah', '2d'],
      communityCards: ['3c', '4s', '5h'],
      callAmount: 20,
      potTotal: 80,
      canRaise: false,
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      spr: 6,
    }),
    'tag',
    sequenceRng(7),
  );

  assert.equal(action.type, 'call');
});

test('fish calls spots that tag folds when only the call buffer differs', () => {
  const context = makeContext({
    phase: 'river',
    holeCards: ['As', '9s'],
    communityCards: ['Kd', '9d', '4c', '2h', '7c'],
    callAmount: 40,
    potTotal: 60,
    canRaise: false,
    canAllIn: false,
    bettingState: 'facing_open',
    activePlayerCount: 2,
    opponentCount: 1,
    spr: 4,
  });

  const fishAction = chooseBotAction(context, 'fish', () => 0.5);
  const tagAction = chooseBotAction(context, 'tag', () => 0.5);

  assert.equal(fishAction.type, 'call');
  assert.equal(tagAction.type, 'fold');
});

test('lag semi-bluffs strong combo draws on the flop within the raise window', () => {
  const action = chooseBotAction(
    makeContext({
      phase: 'flop',
      holeCards: ['Ah', 'Qh'],
      communityCards: ['Jh', 'Th', '2c'],
      callAmount: 40,
      potTotal: 120,
      minRaiseTo: 140,
      maxRaiseTo: 220,
      canAllIn: false,
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      effectiveStack: 1_000,
      effectiveStackBb: 10,
      spr: 2,
    }),
    'lag',
    () => 0.1,
  );

  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    assert.ok(action.amount >= 140);
    assert.ok(action.amount <= 220);
  }
});

test('all chosen actions include a positive thinkingDelayMs', () => {
  const action = chooseBotAction(makeContext(), 'fish', () => 0.99);
  assert.ok(action.thinkingDelayMs > 0);
});
