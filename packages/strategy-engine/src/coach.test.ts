import assert from 'node:assert/strict';
import test from 'node:test';

import { COACH_POLICY_VERSION, type BotDecisionContext, type CoachAdvice } from '@aipoker/shared';

import { computePotOdds } from './actions.ts';
import { adviseFromEquities, buildCoachAdvice, preflopPlayShare } from './coach.ts';
import type { DecisionHand, DecisionValidActions } from './context.ts';
import type { Equities } from './decide.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import type { PostflopAnalysis } from './types.ts';

const KEYS = { handId: 'ROOM01:3', actionIndex: 2, stateVersion: 41 };

/** Heads-up, the button raised preflop and the hero (big blind) called; the hero is first to act on the flop with top set. */
const FLOP: DecisionHand = {
  phase: 'betting_flop',
  smallBlind: 10,
  bigBlind: 20,
  buttonMarkerSeat: 1,
  potTotal: 120,
  players: [
    { id: 'hero', seatIndex: 0, stack: 940, streetCommitted: 0, handCommitted: 60, status: 'active', holeCards: ['As', 'Ad'] },
    { id: 'villain', seatIndex: 1, stack: 940, streetCommitted: 0, handCommitted: 60, status: 'active', holeCards: [] },
  ],
  communityCards: ['Ah', '7c', '2d'],
  actions: [
    { playerId: 'villain', phase: 'betting_preflop', type: 'raise_to', toAmount: 60, potTotalBefore: 30 },
    { playerId: 'hero', phase: 'betting_preflop', type: 'call', toAmount: 60, potTotalBefore: 80 },
  ],
  betting: { currentBetToMatch: 0, lastFullRaiseSize: 20 },
};

const UNOPENED: DecisionValidActions = {
  canFold: false,
  canCheck: true,
  canCall: false,
  callAmount: 0,
  canRaise: true,
  minRaiseTo: 20,
  maxRaiseTo: 940,
  canAllIn: true,
};

function advise(view: DecisionHand = FLOP): CoachAdvice {
  const advice = buildCoachAdvice({ view, heroId: 'hero', valid: UNOPENED, seed: 'coach-test', keys: KEYS });
  assert.ok(advice);
  return advice;
}

function assertWellFormed(advice: CoachAdvice): void {
  const total = advice.options.reduce((sum, option) => sum + option.frequency, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `frequencies sum to ${total}`);
  for (const [i, option] of advice.options.entries()) {
    assert.ok(i === 0 || option.frequency <= advice.options[i - 1]!.frequency, 'sorted by frequency');
    assert.equal(option.size !== undefined, option.kind === 'bet' || option.kind === 'raise', `size only for bet and raise: ${option.kind}`);
  }
}

test('advice on an unopened flop offers a bet sized as a share of the pot, with the numbers behind it', () => {
  const advice = advise();
  assertWellFormed(advice);
  assert.equal(advice.policyVersion, COACH_POLICY_VERSION);
  assert.deepEqual([advice.handId, advice.street, advice.actionIndex, advice.stateVersion], ['ROOM01:3', 'flop', 2, 41]);
  assert.deepEqual(advice.spot, { holeCards: ['As', 'Ad'], board: ['Ah', '7c', '2d'], pot: 120, toCall: 0, heroStack: 940, bigBlind: 20 });

  const bet = advice.options.find((option) => option.kind === 'bet');
  assert.ok(bet, JSON.stringify(advice.options));
  assert.equal(bet.size?.unit, 'pot');
  assert.ok((bet.to ?? 0) > 0);
  assert.equal(advice.equityVs, 'range');
  assert.ok((advice.equity ?? 0) > 0.8);
  assert.ok((advice.equityStdErr ?? 0) > 0 && (advice.equityStdErr ?? 1) < 0.03);
  assert.equal(advice.spr, 940 / 120);
  assert.equal(advice.potOdds, undefined, 'nothing to call');
  // Top set heads-up against a player who folds sometimes slowplays: that reason belongs to the check only.
  const check = advice.options.find((option) => option.kind === 'check');
  assert.ok(check?.reasons.some((reason) => reason.code === 'slowplay'));
  assert.ok(!bet.reasons.some((reason) => reason.code === 'slowplay'));
  assert.ok(advice.reasons.some((reason) => reason.code === 'value'), 'value is common to both paths');
});

test('advice is the same for the same spot and seed, and never depends on other players’ cards', () => {
  const first = advise();
  assert.deepEqual(advise(), first);
  const villainCardsKnown: DecisionHand = {
    ...FLOP,
    players: FLOP.players.map((player) => (player.id === 'villain' ? { ...player, holeCards: ['7d', '7h'] } : player)),
  };
  assert.deepEqual(advise(villainCardsKnown), first);
});

// ---- With the equity fixed, the rest of the contract can be checked exactly.

const FACING_BET: BotDecisionContext = {
  canFold: true,
  canCheck: false,
  canCall: true,
  callAmount: 100,
  canRaise: true,
  minRaiseTo: 200,
  maxRaiseTo: 1_900,
  canAllIn: true,
  phase: 'flop',
  potTotal: 300,
  myStack: 1_900,
  myStreetCommitted: 0,
  currentBetToMatch: 100,
  lastFullRaiseSize: 100,
  bigBlind: 100,
  smallBlind: 50,
  preflopLimpersCount: 0,
  streetActionCount: 1,
  holeCards: ['Qd', '9c'],
  communityCards: ['Kh', '7s', '2c'],
  activePlayerCount: 2,
  opponentCount: 1,
  position: 'btn',
  effectiveStack: 2_000,
  effectiveStackBb: 20,
  spr: 6,
  bettingState: 'facing_open',
  isPreflopAggressor: false,
  isLastStreetAggressor: false,
};

function fixedEquities(analysis: Partial<PostflopAnalysis> | null, preflopVsCallers: number | null = null): Equities {
  return {
    postflop: () => ({
      equity: 0.5,
      madeHandRank: 0,
      madeHandStrength: 0,
      equityVs: 'range',
      ...analysis,
      features: {
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
      },
    }),
    preflopVsCallers: () => preflopVsCallers,
  };
}

const required = clampRequired(computePotOdds(FACING_BET));
function clampRequired(potOdds: number): number {
  return Math.min(1, Math.max(0, potOdds + PERSONALITY_PROFILES.tag.callBuffer));
}

test('the price: pot odds and the equity a call needs, as decide.ts compares them', () => {
  const advice = adviseFromEquities(FACING_BET, fixedEquities({ equity: 0.3 }), KEYS);
  assertWellFormed(advice);
  assert.equal(advice.potOdds, computePotOdds(FACING_BET));
  assert.equal(advice.requiredEquity, required);
});

test('equity at the price is unstable; equity far from it is stable and drops vanishing options', () => {
  const atPrice = adviseFromEquities(FACING_BET, fixedEquities({ equity: required }), KEYS);
  assert.equal(atPrice.stable, false);

  const ahead = adviseFromEquities(FACING_BET, fixedEquities({ equity: 0.85 }), KEYS);
  assertWellFormed(ahead);
  assert.equal(ahead.stable, true);
  // The call logistic leaves a fold of about 1e-11 here; the advice doesn't list it.
  assert.ok(ahead.options.every((option) => option.kind !== 'fold'), JSON.stringify(ahead.options));
  assert.deepEqual(ahead.options.map((option) => option.kind), ['raise', 'call']);
});

test('an all-in for no more than the call is offered as a call', () => {
  const shove: BotDecisionContext = {
    ...FACING_BET,
    phase: 'preflop',
    communityCards: [],
    canRaise: false,
    callAmount: 1_900,
    currentBetToMatch: 2_000,
    potTotal: 2_150,
    holeCards: ['9h', '9d'],
    bettingState: 'facing_3bet_plus',
    opponents: [{ id: 'villain', position: 'utg', actions: [{ phase: 'preflop', type: 'all_in', facing: 'unopened', sizeOfPot: 13 }] }],
  };
  const advice = adviseFromEquities(shove, fixedEquities(null, 0.6), KEYS);
  assertWellFormed(advice);
  assert.deepEqual(advice.options.map((option) => option.kind), ['call']);
  assert.equal(advice.equity, 0.6);
  assert.equal(advice.equityVs, 'range');
  assert.ok(advice.handPercentile !== undefined);
  assert.equal(advice.spr, undefined, 'SPR is shown from the flop on');
});

test('position: the chart plays more hands the later the seat, and preflop advice says how wide this seat plays', () => {
  const sixMax = { effectiveStackBb: 100, activePlayerCount: 6 };
  const shares = (['utg', 'hj', 'co', 'btn'] as const).map((position) => preflopPlayShare(sixMax, 'unopened', position));
  assert.ok(shares.every((share, i) => share > 0 && share < 1 && (i === 0 || share > shares[i - 1]!)), shares.join(' '));

  const utgOpen: BotDecisionContext = {
    ...FACING_BET,
    phase: 'preflop',
    communityCards: [],
    position: 'utg',
    activePlayerCount: 6,
    opponentCount: 5,
    effectiveStackBb: 100,
    bettingState: 'unopened',
    holeCards: ['Kd', '9c'],
  };
  const range = adviseFromEquities(utgOpen, fixedEquities(null), KEYS).reasons.find((reason) => reason.code === 'position_range');
  assert.ok(range?.code === 'position_range');
  assert.equal(range.params.share, shares[0]);
  assert.equal(range.params.buttonShare, shares[3]);

  const onButton = adviseFromEquities({ ...utgOpen, position: 'btn' }, fixedEquities(null), KEYS).reasons.find((reason) => reason.code === 'position_range');
  assert.ok(onButton?.code === 'position_range');
  assert.equal(onButton.params.buttonShare, null);
});

test('position: checked to in position without the initiative, the policy says why it may bet', () => {
  const checkedTo: BotDecisionContext = {
    ...FACING_BET,
    canFold: false,
    canCheck: true,
    canCall: false,
    callAmount: 0,
    currentBetToMatch: 0,
    bettingState: 'unopened',
    position: 'btn',
    streetActionCount: 1,
    opponents: [
      {
        id: 'villain',
        position: 'bb',
        actions: [
          { phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 },
          { phase: 'flop', type: 'check', facing: 'unopened', sizeOfPot: 0 },
        ],
      },
    ],
    selfView: { id: 'hero', position: 'btn', actions: [{ phase: 'preflop', type: 'call', facing: 'facing_open', sizeOfPot: 0 }] },
  };
  const advice = adviseFromEquities(checkedTo, fixedEquities({ equity: 0.2 }), KEYS);
  assert.ok(advice.reasons.some((reason) => reason.code === 'checked_to_in_position'), JSON.stringify(advice));
});

test('preflop equity says how many players it is against: only those who put chips in, not everyone still to act', () => {
  const quiet = (id: string, position: 'sb' | 'bb' | 'hj' | 'co') => ({ id, position, actions: [] });
  const facingOneOpen: BotDecisionContext = {
    ...FACING_BET,
    phase: 'preflop',
    communityCards: [],
    position: 'btn',
    holeCards: ['Ah', 'Jh'],
    activePlayerCount: 6,
    opponentCount: 5,
    bettingState: 'facing_open',
    opponents: [
      { id: 'opener', position: 'utg', actions: [{ phase: 'preflop', type: 'raise_to', facing: 'unopened', sizeOfPot: 1 }] },
      quiet('hj', 'hj'),
      quiet('co', 'co'),
      quiet('sb', 'sb'),
      quiet('bb', 'bb'),
    ],
  };
  const advice = adviseFromEquities(facingOneOpen, fixedEquities(null, 0.45), KEYS);
  assert.equal(advice.equity, 0.45);
  assert.equal(advice.opponents, 5);
  assert.equal(advice.equityAgainst, 1);
});
