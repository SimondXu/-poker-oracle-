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

test('lag opens weak offsuit aces on the button instead of over-folding', () => {
  const mix = getPreflopMix('lag', 60, 'unopened', 'btn', ['Ah', '7d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.45);
});

test('fish limps marginal button hands more often and raises them less often than tag', () => {
  const fishMix = getPreflopMix('fish', 60, 'unopened', 'btn', ['Qh', '8d']);
  const tagMix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Qh', '8d']);

  assert.ok(fishMix.call > tagMix.call);
  assert.ok(fishMix.raise + fishMix.jam < tagMix.raise + tagMix.jam);
});

test('tag defends suited kings from the big blind versus opens at a playable frequency', () => {
  const mix = getPreflopMix('tag', 60, 'facing_open', 'bb', ['Kh', '7h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.2);
});

test('tag opens more marginal broadways on the button in the second data-tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Qh', '9d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.45);
});

test('tag opens suited broadway-gappers from the cutoff more often in the third tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'co', ['Jh', '9h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.5);
});

test('tag steals more weak offsuit aces on the button in the third tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Ah', '8d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.62);
});

test('tag opens cutoff suited gappers a bit wider in the fourth tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'co', ['Jh', '9h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.56);
});

test('tag defends suited connectors from the big blind more often against opens', () => {
  const mix = getPreflopMix('tag', 60, 'facing_open', 'bb', ['Th', '8h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.32);
});

test('tag steals weak offsuit aces on the button more often in the fourth tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Ah', '8d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.68);
});

test('tag keeps more marginal button queens in the opening mix for live-play pacing', () => {
  const mix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Qh', '8d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.58);
});

test('tag defends suited connectors from the big blind even more often in the fourth tuning pass', () => {
  const mix = getPreflopMix('tag', 60, 'facing_open', 'bb', ['Th', '8h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.36);
});

test('tag defends suited connectors from the big blind often enough to avoid over-fold streaks', () => {
  const mix = getPreflopMix('tag', 60, 'facing_open', 'bb', ['Th', '8h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.42);
});

test('fish defends suited kings from the big blind more often in live-play tuning', () => {
  const mix = getPreflopMix('fish', 60, 'facing_open', 'bb', ['Kh', '7h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.46);
});

test('fish prefers calling over 3-betting when defending suited broadways versus an open', () => {
  const fishMix = getPreflopMix('fish', 60, 'facing_open', 'bb', ['Ah', 'Jh']);
  const lagMix = getPreflopMix('lag', 60, 'facing_open', 'bb', ['Ah', 'Jh']);

  assert.ok(fishMix.call > fishMix.raise + fishMix.jam);
  assert.ok(fishMix.raise + fishMix.jam < lagMix.raise + lagMix.jam);
});

test('lag mixes more calls and fewer pure raises with deep-stack suited connectors on the button', () => {
  const mix = getPreflopMix('lag', 65, 'unopened', 'btn', ['7h', '5h']);

  assert.ok(mix.call >= 0.4);
  assert.ok(mix.raise + mix.jam <= 0.5);
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

test('anti-streak nudges marginal late-position opens out of pure fold territory', () => {
  const context = makeContext({
    holeCards: ['Jh', '9h'],
    position: 'co',
    bettingState: 'facing_open',
    activePlayerCount: 6,
    opponentCount: 5,
  });

  const baseline = chooseBotAction(context, 'tag', () => 0.65);
  const boosted = chooseBotAction(context, 'tag', () => 0.65, {
    preflopConsecutiveFolds: 3,
    isFirstPreflopDecision: true,
  });

  assert.equal(baseline.type, 'fold');
  assert.notEqual(boosted.type, 'fold');
});

test('tag button opening pressure is clearly wider than hijack on marginal offsuit queens', () => {
  const hijackMix = getPreflopMix('tag', 60, 'unopened', 'hj', ['Qh', '8d']);
  const buttonMix = getPreflopMix('tag', 60, 'unopened', 'btn', ['Qh', '8d']);

  assert.ok(buttonMix.call + buttonMix.raise + buttonMix.jam >= 0.7);
  assert.ok(buttonMix.raise + buttonMix.jam >= 0.36);
  assert.ok(buttonMix.raise + buttonMix.jam >= hijackMix.raise + hijackMix.jam + 0.2);
});

test('fish defends suited kings from the big blind mostly by calling rather than blasting back', () => {
  const mix = getPreflopMix('fish', 60, 'facing_open', 'bb', ['Kh', '7h']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.5);
  assert.ok(mix.call > mix.raise + mix.jam);
});

test('fish keeps more marginal offsuit broadways in the big blind defend mix', () => {
  const mix = getPreflopMix('fish', 60, 'facing_open', 'bb', ['Qh', '8d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.5);
  assert.ok(mix.call >= 0.45);
  assert.ok(mix.call > mix.raise + mix.jam);
});

test('tag does not snap-fold too much from the button versus opens with marginal broadways', () => {
  const mix = getPreflopMix('tag', 60, 'facing_open', 'btn', ['Qh', '8d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.45);
  assert.ok(mix.raise + mix.jam <= 0.24);
});

test('lag deep-stack button weak aces open often enough without turning into pure raise spam', () => {
  const mix = getPreflopMix('lag', 100, 'unopened', 'btn', ['Ah', '7d']);

  assert.ok(mix.call + mix.raise + mix.jam >= 0.72);
  assert.ok(mix.raise + mix.jam >= 0.4);
  assert.ok(mix.raise + mix.jam <= 0.52);
});

test('lag trims low-EV deep-stack big blind trash defends back under the overcooked line', () => {
  const mix = getPreflopMix('lag', 100, 'facing_open', 'bb', ['9c', '4d']);

  assert.ok(mix.call + mix.raise + mix.jam <= 0.28);
  assert.ok(mix.raise + mix.jam <= 0.12);
});

test('anti-streak does not widen UTG trash just to break a fold streak', () => {
  const context = makeContext({
    holeCards: ['9c', '4d'],
    position: 'utg',
    bettingState: 'unopened',
    activePlayerCount: 6,
    opponentCount: 5,
  });

  const baseline = chooseBotAction(context, 'tag', () => 0.3);
  const boosted = chooseBotAction(context, 'tag', () => 0.3, {
    preflopConsecutiveFolds: 4,
    isFirstPreflopDecision: true,
  });

  assert.equal(baseline.type, 'fold');
  assert.equal(boosted.type, 'fold');
});

test('fish thinking delay stays in the slower live-play range', () => {
  const minimum = chooseBotAction(makeContext(), 'fish', () => 0);
  const nearMaximum = chooseBotAction(makeContext(), 'fish', () => 0.999999);

  assert.equal(minimum.thinkingDelayMs, 900);
  assert.equal(nearMaximum.thinkingDelayMs, 1699);
});

test('tag thinking delay keeps a longer tank than the old snap pace', () => {
  const minimum = chooseBotAction(makeContext(), 'tag', () => 0);
  const nearMaximum = chooseBotAction(makeContext(), 'tag', () => 0.999999);

  assert.equal(minimum.thinkingDelayMs, 1100);
  assert.equal(nearMaximum.thinkingDelayMs, 2099);
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
    callAmount: 270,
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

test('lag floats small flop bets in position with two overcards and a backdoor flush draw', () => {
  const action = chooseBotAction(
    makeContext({
      phase: 'flop',
      holeCards: ['Ks', 'Qs'],
      communityCards: ['7s', '2c', '9d'],
      callAmount: 40,
      potTotal: 120,
      canRaise: false,
      canAllIn: false,
      bettingState: 'facing_open',
      activePlayerCount: 2,
      opponentCount: 1,
      position: 'btn',
      spr: 4,
    }),
    'lag',
    () => 0.5,
  );

  assert.equal(action.type, 'call');
});

test('postflop c-bet frequencies separate fish, tag, and lag on dry ace-high flops', () => {
  const context = makeContext({
    phase: 'flop',
    holeCards: ['Kc', 'Jh'],
    communityCards: ['Ad', '7s', '2c'],
    canCheck: true,
    canCall: false,
    callAmount: 0,
    bettingState: 'unopened',
    activePlayerCount: 2,
    opponentCount: 1,
    position: 'btn',
    isPreflopAggressor: true,
  });

  function countAggressiveActions(personality: 'fish' | 'tag' | 'lag'): number {
    let aggressive = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const action = chooseBotAction(context, personality, sequenceRng(seed));
      if (action.type === 'raise_to' || action.type === 'all_in') {
        aggressive += 1;
      }
    }
    return aggressive;
  }

  const fishAggression = countAggressiveActions('fish');
  const tagAggression = countAggressiveActions('tag');
  const lagAggression = countAggressiveActions('lag');

  assert.ok(fishAggression < tagAggression);
  assert.ok(tagAggression < lagAggression);
  assert.ok(lagAggression - tagAggression >= 55);
  assert.ok(tagAggression < 160);
  assert.ok(lagAggression < 190);
});

test('all chosen actions include a positive thinkingDelayMs', () => {
  const action = chooseBotAction(makeContext(), 'fish', () => 0.99);
  assert.ok(action.thinkingDelayMs > 0);
});

function countActions(context: BotDecisionContext, personality: 'fish' | 'tag' | 'lag', samples = 100): Record<string, number> {
  const rng = sequenceRng(7);
  const counts: Record<string, number> = {};
  for (let index = 0; index < samples; index += 1) {
    const type = chooseBotAction(context, personality, rng).type;
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

test('preflop calls of a 100bb shove need the equity the price asks for', () => {
  const facingShove = makeContext({
    holeCards: ['Kh', '9d'],
    position: 'btn',
    bettingState: 'facing_open',
    canRaise: false,
    callAmount: 9_900,
    currentBetToMatch: 10_000,
    potTotal: 10_150,
    myStack: 10_000,
    effectiveStack: 10_000,
    effectiveStackBb: 100,
    opponentCount: 3,
    opponents: [
      { id: 'sb', position: 'sb', actions: [] },
      { id: 'bb', position: 'bb', actions: [] },
      { id: 'utg', position: 'utg', actions: [{ phase: 'preflop', type: 'all_in', facing: 'unopened', sizeOfPot: 66 }] },
    ],
  });

  for (const personality of ['tag', 'lag'] as const) {
    const counts = countActions(facingShove, personality, 50);
    assert.equal(counts.fold, 50, `${personality} K9o vs a UTG shove: ${JSON.stringify(counts)}`);
  }
  assert.equal(countActions({ ...facingShove, holeCards: ['Ah', 'Ad'] }, 'tag', 20).fold ?? 0, 0);

  // The same shove from a player who has shoved all 50 hands so far comes from any two cards.
  const maniac = {
    hands: 50,
    preflopVoluntary: 50,
    preflopRaises: 50,
    preflopOversizedRaises: 50,
    postflopActions: 0,
    postflopAggressive: 0,
    postflopFacingBets: 0,
    postflopFoldsToBets: 0,
  };
  const facingManiac = {
    ...facingShove,
    opponents: facingShove.opponents!.map((opponent) => (opponent.id === 'utg' ? { ...opponent, stats: maniac } : opponent)),
  };
  // K9o has about 56% against any two cards and needs 49%; allow a rare Monte Carlo miss.
  assert.ok((countActions(facingManiac, 'tag', 50).fold ?? 0) <= 2);
});

test('position comes from who acts last after the flop, not from the seat name', () => {
  // The big blind acts after the small blind on every later street, so it is in position.
  const bigBlindVsSmallBlindOpen = makeContext({
    holeCards: ['Ah', 'Ad'],
    position: 'bb',
    bettingState: 'facing_open',
    opponentCount: 1,
    activePlayerCount: 6,
    opponents: [{ id: 'sb', position: 'sb', actions: [{ phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1.3 }] }],
  });
  const rng = sequenceRng(3);
  const raises = Array.from({ length: 30 }, () => chooseBotAction(bigBlindVsSmallBlindOpen, 'tag', rng))
    .filter((action) => action.type === 'raise_to');

  assert.ok(raises.length > 0);
  for (const action of raises) {
    assert.equal(action.type === 'raise_to' && action.amount, 400);
  }
});

test('a deep-stacked set bets instead of shoving 100bb into a small pot', () => {
  const checkedToSet = makeContext({
    phase: 'flop',
    holeCards: ['7h', '7c'],
    communityCards: ['Kd', '7d', '2s'],
    bettingState: 'unopened',
    canCheck: true,
    canCall: false,
    callAmount: 0,
    currentBetToMatch: 0,
    potTotal: 600,
    minRaiseTo: 100,
    maxRaiseTo: 9_700,
    myStack: 9_700,
    effectiveStack: 9_700,
    effectiveStackBb: 97,
    spr: 9_700 / 600,
    opponentCount: 1,
    activePlayerCount: 2,
  });

  const counts = countActions(checkedToSet, 'tag', 30);
  assert.equal(counts.all_in ?? 0, 0, JSON.stringify(counts));
});

test('no bluff c-bets into a player who never folds to a bet', () => {
  const missedFlop = makeContext({
    phase: 'flop',
    holeCards: ['5h', '4h'],
    communityCards: ['Kd', '9c', '2s'],
    bettingState: 'unopened',
    canCheck: true,
    canCall: false,
    callAmount: 0,
    currentBetToMatch: 0,
    potTotal: 600,
    minRaiseTo: 100,
    isPreflopAggressor: true,
    opponentCount: 1,
    activePlayerCount: 2,
    position: 'btn',
    opponents: [{ id: 'bb', position: 'bb', actions: [{ phase: 'preflop', type: 'call', facing: 'facing_open', sizeOfPot: 0 }] }],
  });
  const station = {
    hands: 100,
    preflopVoluntary: 100,
    preflopRaises: 0,
    preflopOversizedRaises: 0,
    postflopActions: 100,
    postflopAggressive: 0,
    postflopFacingBets: 100,
    postflopFoldsToBets: 0,
  };
  const versusStation = { ...missedFlop, opponents: missedFlop.opponents!.map((opponent) => ({ ...opponent, stats: station })) };

  assert.ok((countActions(missedFlop, 'tag', 100).raise_to ?? 0) > 0);
  assert.equal(countActions(versusStation, 'tag', 100).raise_to ?? 0, 0);
});
