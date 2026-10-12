import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext } from '@aipoker/shared';

import {
  analyzePostflop,
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

function makeRiverContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return makeContext({
    phase: 'river',
    canFold: false,
    canCheck: true,
    canCall: false,
    callAmount: 0,
    canRaise: true,
    minRaiseTo: 100,
    potTotal: 600,
    activePlayerCount: 2,
    opponentCount: 1,
    bettingState: 'unopened',
    ...overrides,
  });
}

test('river equity does not credit a board-only pair to the hero', () => {
  const analysis = analyzePostflop(
    makeRiverContext({ holeCards: ['7h', '2d'], communityCards: ['Ks', 'Kd', '9c', '5h', '3s'] }),
    createStableAnalysisRng('river-board-pair'),
  );

  assert.equal(analysis.madeHandRank, 0);
  assert.ok(analysis.equity < 0.35, `equity ${analysis.equity}`);
});

test('river board full house does not make a bot jam with irrelevant hole cards', () => {
  const context = makeRiverContext({ holeCards: ['7h', '2d'], communityCards: ['Ks', 'Kd', 'Kc', '9d', '9s'] });
  const headsUp = analyzePostflop(context, createStableAnalysisRng('river-board-boat'));
  const multiway = analyzePostflop(
    { ...context, opponentCount: 3, activePlayerCount: 4 },
    createStableAnalysisRng('river-board-boat'),
  );

  assert.ok(headsUp.equity < 0.7, `heads-up equity ${headsUp.equity}`);
  assert.ok(multiway.equity < 0.5, `multiway equity ${multiway.equity}`);
  for (const personality of ['fish', 'tag', 'lag'] as const) {
    const action = chooseBotAction(context, personality, createStableAnalysisRng(`boat-${personality}`));
    assert.notEqual(action.type, 'all_in');
  }
});

test('river heuristic fallback does not credit board-only hands', () => {
  const analysis = analyzePostflop(
    makeRiverContext({ holeCards: ['7h', '2d'], communityCards: ['Ks', 'Kd', 'Kc', '9d', '9s'] }),
    createStableAnalysisRng('river-heuristic'),
    { riverIterations: 0, preferExactRiverHeadsUp: false },
  );

  assert.equal(analysis.madeHandRank, 0);
  assert.ok(analysis.equity < 0.3, `equity ${analysis.equity}`);
});

test('river hole cards that really improve the board are still credited', () => {
  const analysis = analyzePostflop(
    makeRiverContext({ holeCards: ['Ah', 'As'], communityCards: ['Ks', 'Kd', '9c', '5h', '3s'] }),
    createStableAnalysisRng('river-real-two-pair'),
  );

  assert.equal(analysis.madeHandRank, 2);
  assert.ok(analysis.equity > 0.8, `equity ${analysis.equity}`);
});

test('missed draws on the river get no draw bonus', () => {
  const analysis = analyzePostflop(
    makeRiverContext({ holeCards: ['Ah', '2h'], communityCards: ['Kh', '9h', '5c', '7d', 'Js'] }),
    createStableAnalysisRng('river-missed-flush'),
    { riverIterations: 0, preferExactRiverHeadsUp: false },
  );

  assert.equal(analysis.features.flushDraw, false);
  assert.equal(analysis.equity, analysis.madeHandStrength);
});

test('flush draws must use a hole card', () => {
  const boardOnly = analyzePostflop(
    makeContext({ phase: 'turn', holeCards: ['Ac', '2d'], communityCards: ['Kh', '9h', '5h', '7h'], opponentCount: 1 }),
    createStableAnalysisRng('board-flush-draw'),
  );
  const withHole = analyzePostflop(
    makeContext({ phase: 'turn', holeCards: ['Ah', '2d'], communityCards: ['Kh', '9h', '5h', '7d'], opponentCount: 1 }),
    createStableAnalysisRng('hole-flush-draw'),
  );

  assert.equal(boardOnly.features.flushDraw, false);
  assert.equal(withHole.features.flushDraw, true);
});

test('straight draws must use a hole card', () => {
  const analyze = (holeCards: BotDecisionContext['holeCards']) => analyzePostflop(
    makeContext({ phase: 'turn', holeCards, communityCards: ['5s', '6h', '7d', '8c'], opponentCount: 1 }),
    createStableAnalysisRng('straight-draw'),
  ).features;

  const boardOnly = analyze(['Ac', '2d']);
  assert.equal(boardOnly.oesd, false);
  assert.equal(boardOnly.gutshot, false);

  const irrelevantLowCard = analyze(['3c', 'Kd']);
  assert.equal(irrelevantLowCard.oesd, false);
  assert.equal(irrelevantLowCard.gutshot, false);

  const gutshot = analyze(['Tc', '2d']);
  assert.equal(gutshot.oesd, false);
  assert.equal(gutshot.gutshot, true);
});

test('backdoor draws must use a hole card', () => {
  const analyze = (holeCards: BotDecisionContext['holeCards'], communityCards: BotDecisionContext['communityCards']) =>
    analyzePostflop(
      makeContext({ phase: 'flop', holeCards, communityCards, opponentCount: 1 }),
      createStableAnalysisRng('backdoor-draw'),
    ).features;

  assert.equal(analyze(['6c', '5d'], ['Kh', '9h', '2h']).backdoorFlushDraw, false);
  assert.equal(analyze(['Ah', '5d'], ['Kh', '9h', '2c']).backdoorFlushDraw, true);

  assert.equal(analyze(['2c', '4d'], ['9s', 'Td', 'Jh']).backdoorStraightDraw, false);
  assert.equal(analyze(['8c', '2d'], ['9s', 'Td', '3h']).backdoorStraightDraw, true);
});

test('A-2-3-4 and J-Q-K-A are one-ended draws, not open-ended', () => {
  const analyze = (holeCards: BotDecisionContext['holeCards'], communityCards: BotDecisionContext['communityCards']) =>
    analyzePostflop(
      makeContext({ phase: 'flop', holeCards, communityCards, opponentCount: 1 }),
      createStableAnalysisRng('one-ended'),
    ).features;

  const wheelDraw = analyze(['Ah', '2d'], ['3c', '4s', '9d']);
  assert.equal(wheelDraw.oesd, false);
  assert.equal(wheelDraw.gutshot, true);

  const broadwayDraw = analyze(['Ks', 'Ad'], ['Jd', 'Qh', '2c']);
  assert.equal(broadwayDraw.oesd, false);
  assert.equal(broadwayDraw.gutshot, true);

  const openEnded = analyze(['5h', '6d'], ['7s', '8c', 'Kd']);
  assert.equal(openEnded.oesd, true);
});

test('postflop raise sizing includes chips already committed on the street', () => {
  const action = chooseBotAction(
    makeContext({
      phase: 'flop',
      holeCards: ['Ah', 'Ad'],
      communityCards: ['Ac', '7d', '2s'],
      activePlayerCount: 2,
      opponentCount: 1,
      bettingState: 'facing_open',
      canAllIn: false,
      canCall: true,
      callAmount: 100,
      myStreetCommitted: 100,
      currentBetToMatch: 200,
      potTotal: 500,
      minRaiseTo: 300,
      maxRaiseTo: 5_000,
      spr: 1,
    }),
    'tag',
    createStableAnalysisRng('raise-sizing'),
  );

  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    // committed 100 + call 100 + 1.0 x pot after calling (600)
    assert.equal(action.amount, 800);
  }
});

test('passive fallback is a legal call when neither check nor fold is available', () => {
  const action = chooseBotAction(
    makeRiverContext({
      holeCards: ['7h', '2d'],
      communityCards: ['As', 'Kd', 'Qc', '9h', '4s'],
      canCheck: false,
      canFold: false,
      canCall: true,
      callAmount: 400,
      canRaise: false,
      canAllIn: false,
      bettingState: 'facing_open',
    }),
    'tag',
    createStableAnalysisRng('passive-fallback'),
  );

  assert.equal(action.type, 'call');
});

test('heads-up preflop plays a wider range than the six-max baseline for the same seat', () => {
  // Q4o: folded by the six-max small-blind baseline, a standard heads-up button open.
  const sixMax = getPreflopMix('tag', 50, 'unopened', 'sb', ['Qh', '4c'], 6);
  const headsUp = getPreflopMix('tag', 50, 'unopened', 'btn', ['Qh', '4c'], 2);
  assert.ok(sixMax.fold > 0.5, `six-max SB should mostly fold Q4o (fold ${sixMax.fold})`);
  assert.ok(headsUp.fold < 0.5, `heads-up button should mostly play Q4o (fold ${headsUp.fold})`);
});
