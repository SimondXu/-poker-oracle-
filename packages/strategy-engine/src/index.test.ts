import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext } from '@aipoker/shared';

import {
  analyzeTrainingSpot,
  chooseBotAction,
  createStableAnalysisRng,
  evaluatePreflopPercentile,
  getPreflopMix,
} from './index.ts';

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
    myStreetCommitted: 0,
    currentBetToMatch: 100,
    lastFullRaiseSize: 100,
    bigBlind: 100,
    smallBlind: 50,
    preflopLimpersCount: 0,
    streetActionCount: 0,
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

test('evaluatePreflopPercentile orders premium, playable, and trash hands', () => {
  const pocketAces = evaluatePreflopPercentile(['Ah', 'Ad']);
  const aceKingSuited = evaluatePreflopPercentile(['Ah', 'Kh']);
  const sevenSixSuited = evaluatePreflopPercentile(['7h', '6h']);
  const sevenTwoOffsuit = evaluatePreflopPercentile(['7h', '2d']);

  assert.ok(pocketAces < aceKingSuited);
  assert.ok(aceKingSuited < sevenSixSuited);
  assert.ok(sevenSixSuited < sevenTwoOffsuit);
  assert.ok(pocketAces <= 0.02);
  assert.ok(sevenTwoOffsuit >= 0.95);
});

test('createStableAnalysisRng produces a repeatable sequence for the same seed', () => {
  const first = createStableAnalysisRng('hand-42:hero');
  const second = createStableAnalysisRng('hand-42:hero');

  assert.deepEqual(
    [first(), first(), first()],
    [second(), second(), second()],
  );
});

test('analyzeTrainingSpot returns a deterministic preflop raise recommendation', () => {
  const advice = analyzeTrainingSpot(
    makeContext({
      canCall: false,
      callAmount: 0,
      holeCards: ['Ah', 'Jh'],
      position: 'btn',
      bettingState: 'unopened',
    }),
  );

  assert.equal(advice.strength.kind, 'top_percent');
  assert.equal(advice.suggestion, 'raise');
  assert.ok((advice.suggestionReason ?? '').includes('TAG'));
});

test('analyzeTrainingSpot returns deterministic postflop equity and a call recommendation', () => {
  const context = makeContext({
    phase: 'flop',
    potTotal: 150,
    callAmount: 50,
    canRaise: false,
    canAllIn: false,
    activePlayerCount: 2,
    opponentCount: 1,
    holeCards: ['Ah', 'Qh'],
    communityCards: ['Kh', '7h', '2c'],
    bettingState: 'facing_open',
    isPreflopAggressor: false,
  });

  const first = analyzeTrainingSpot(context);
  const second = analyzeTrainingSpot(context);

  assert.equal(first.strength.kind, 'equity');
  assert.equal(first.suggestion, 'call');
  assert.ok(first.strength.value > 0);
  assert.ok(first.potOdds !== undefined);
  assert.ok(first.winRequirement !== undefined);
  assert.ok(first.strength.value >= (first.winRequirement ?? 1));
  assert.deepEqual(first, second);
});

test('facing_raise reuses the 3-bet defense mix instead of open-defense ranges', () => {
  const facingOpenMix = getPreflopMix('tag', 60, 'facing_open', 'btn', ['Ah', 'Jh']);
  const facingRaiseMix = getPreflopMix('tag', 60, 'facing_raise', 'btn', ['Ah', 'Jh']);
  const facingThreeBetMix = getPreflopMix('tag', 60, 'facing_3bet_plus', 'btn', ['Ah', 'Jh']);

  assert.deepEqual(facingRaiseMix, facingThreeBetMix);
  assert.notDeepEqual(facingRaiseMix, facingOpenMix);
  assert.ok(facingRaiseMix.raise + facingRaiseMix.jam < facingOpenMix.raise + facingOpenMix.jam);
});

test('analyzeTrainingSpot labels facing_raise spots as 3-bet decisions', () => {
  const advice = analyzeTrainingSpot(
    makeContext({
      bettingState: 'facing_raise',
      holeCards: ['Ah', 'Jh'],
      position: 'btn',
    }),
  );

  assert.ok((advice.suggestionReason ?? '').includes('3-bet+'));
});

test('facing_limpers keeps a dedicated iso-raise mix instead of open-defense heuristics', () => {
  const facingLimpersMix = getPreflopMix('tag', 60, 'facing_limpers', 'btn', ['Qh', '8d']);
  const facingOpenMix = getPreflopMix('tag', 60, 'facing_open', 'btn', ['Qh', '8d']);

  assert.notDeepEqual(facingLimpersMix, facingOpenMix);
  assert.ok(facingLimpersMix.raise + facingLimpersMix.jam > facingOpenMix.raise + facingOpenMix.jam);
});

test('chooseBotAction sizes limper iso-raises larger than standard reopen sizings', () => {
  const action = chooseBotAction(
    makeContext({
      holeCards: ['Ah', 'Ad'],
      bettingState: 'facing_limpers',
      position: 'btn',
      callAmount: 100,
      potTotal: 250,
      minRaiseTo: 200,
      maxRaiseTo: 2_000,
    }),
    'tag',
    () => 0.5,
  );

  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    assert.equal(action.amount, 450);
  }
});
