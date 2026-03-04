import assert from 'node:assert/strict';
import test from 'node:test';

import { chooseBotAction } from './index.ts';
import type { BotValidActions } from '@aipoker/shared';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeActions(overrides: Partial<BotValidActions> = {}): BotValidActions {
  return {
    canFold: true,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    canAllIn: false,
    potTotal: 100,
    myStack: 1000,
    holeCards: ['Ah', 'Kh'],
    communityCards: [],
    ...overrides,
  };
}

const alwaysHigh: () => number = () => 0.99;
const alwaysLow:  () => number = () => 0.01;

// ── Check / Call / Fold basics ────────────────────────────────────────────────

test('fish: checks when check is available and no raise desire', () => {
  const action = chooseBotAction(
    makeActions({ canCheck: true }),
    'fish',
    alwaysHigh, // high rng → no bluff, no raise desire
  );
  assert.equal(action.type, 'check');
});

test('fish: calls when canCall and hand is strong enough', () => {
  // AhKh preflop → strength ≈ 0.76, fish callThreshold = 0.15 → should call
  const action = chooseBotAction(
    makeActions({ canCall: true, callAmount: 20 }),
    'fish',
    alwaysHigh,
  );
  assert.equal(action.type, 'call');
  if (action.type === 'call') assert.equal(action.amount, 20);
});

test('fish: folds weak hand vs large bet', () => {
  // 72o preflop → low strength; high pot odds demand a lot
  const action = chooseBotAction(
    makeActions({ canCall: true, callAmount: 90, potTotal: 10, holeCards: ['7h', '2d'] }),
    'fish',
    alwaysHigh,
  );
  // pot odds = 90/(10+90) = 0.90 → far exceeds fish callThreshold (0.15) and hand strength
  assert.equal(action.type, 'fold');
});

test('fish: folds when neither check nor call available', () => {
  const action = chooseBotAction(
    makeActions({ canFold: true, canCheck: false, canCall: false }),
    'fish',
    alwaysHigh,
  );
  assert.equal(action.type, 'fold');
});

// ── Raise logic ───────────────────────────────────────────────────────────────

test('tag: raises with strong hand when rng favors it', () => {
  // alwaysLow rng → bluffFrequency check fires (0.01 < 0.12 = bluffFrequency)
  // so TAG may raise even with moderate hand
  const action = chooseBotAction(
    makeActions({
      canRaise: true,
      minRaiseTo: 60,
      maxRaiseTo: 1000,
      potTotal: 100,
      myStack: 1000,
    }),
    'tag',
    alwaysLow,
  );
  // With low rng, bluff fires → should raise
  assert.equal(action.type, 'raise_to');
  if (action.type === 'raise_to') {
    assert.ok(action.amount >= 60, 'raise amount must be >= minRaiseTo');
    assert.ok(action.amount <= 1000, 'raise amount must be <= maxRaiseTo');
  }
});

test('lag: raises more aggressively', () => {
  // rng at 0.2 → for LAG: raiseFrequency=0.85 for strong hands, bluffFreq=0.28
  // 0.2 < 0.28 → bluff fires
  const action = chooseBotAction(
    makeActions({
      canRaise: true,
      minRaiseTo: 40,
      maxRaiseTo: 500,
      potTotal: 80,
      myStack: 500,
    }),
    'lag',
    () => 0.2,
  );
  assert.equal(action.type, 'raise_to');
});

// ── All-in ────────────────────────────────────────────────────────────────────

test('goes all-in when raise amount equals maxRaiseTo', () => {
  // Force raise_to amount to equal maxRaiseTo → triggers all_in
  // potTotal=10, betSizingFactor=0.50 → target ≈ 5; minRaiseTo=900, maxRaiseTo=900 → clamps to 900
  const action = chooseBotAction(
    makeActions({
      canRaise: true,
      canAllIn: true,
      minRaiseTo: 900,
      maxRaiseTo: 900,
      potTotal: 100,
      myStack: 900,
    }),
    'fish',
    alwaysLow, // low rng → bluffFrequency check fires
  );
  assert.equal(action.type, 'all_in');
});

// ── Thinking delay ────────────────────────────────────────────────────────────

test('all actions include a positive thinkingDelayMs', () => {
  const cases: Array<() => void> = [
    () => {
      const a = chooseBotAction(makeActions({ canCheck: true }), 'fish', alwaysHigh);
      assert.ok(a.thinkingDelayMs > 0);
    },
    () => {
      const a = chooseBotAction(makeActions({ canCall: true, callAmount: 10 }), 'tag', alwaysHigh);
      assert.ok(a.thinkingDelayMs > 0);
    },
    () => {
      const a = chooseBotAction(makeActions({ canFold: true }), 'lag', alwaysHigh);
      assert.ok(a.thinkingDelayMs > 0);
    },
  ];
  for (const fn of cases) fn();
});

// ── Postflop hand evaluation ──────────────────────────────────────────────────

test('fish calls postflop with a flopped pair', () => {
  // AhKh hole cards, Ah 7d 2c board → pair of aces → strength ≈ 0.42+noise
  // fish callThreshold = 0.15 → should call
  const action = chooseBotAction(
    makeActions({
      canCall: true,
      callAmount: 20,
      potTotal: 80,
      holeCards: ['Ah', 'Kh'],
      communityCards: ['Ad', '7d', '2c'],
    }),
    'fish',
    alwaysHigh,
  );
  assert.equal(action.type, 'call');
});

test('tag folds postflop with nothing and expensive bet', () => {
  // 72o vs AKQ board → high card, ~0.26 strength
  // potOdds = 80/(80+80) = 0.50 > tag callThreshold(0.40) → fold
  const action = chooseBotAction(
    makeActions({
      canCall: true,
      callAmount: 80,
      potTotal: 80,
      holeCards: ['7h', '2d'],
      communityCards: ['Ah', 'Kd', 'Qc'],
    }),
    'tag',
    alwaysHigh,
  );
  assert.equal(action.type, 'fold');
});
