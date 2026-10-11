import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSizingPresets,
  clampRaiseTo,
  formatAmount,
  getRaiseBounds,
  isCallAllIn,
  parseAmountDraft,
  potFractionRaiseTo,
  resolveRaiseAction,
} from './action-bar-sizing.ts';

const wide = { min: 20, max: 1000 };

test('getRaiseBounds: short stack that cannot make a full raise collapses to its max', () => {
  assert.deepEqual(getRaiseBounds({ minBetOrRaiseTo: 80, maxBetOrRaiseTo: 50 }), { min: 50, max: 50 });
  assert.deepEqual(getRaiseBounds({ minBetOrRaiseTo: 20, maxBetOrRaiseTo: 500 }), { min: 20, max: 500 });
});

test('clampRaiseTo rounds and clamps both ends', () => {
  assert.equal(clampRaiseTo(5, wide), 20);
  assert.equal(clampRaiseTo(5000, wide), 1000);
  assert.equal(clampRaiseTo(33.4, wide), 33);
  assert.equal(clampRaiseTo(Number.NaN, wide), 20);
});

test('unopened street: fractions are plain pot fractions', () => {
  const ctx = { pot: 90, callAmount: 0, heroStreetBet: 0 };
  assert.equal(potFractionRaiseTo(1 / 3, ctx), 30);
  assert.equal(potFractionRaiseTo(1 / 2, ctx), 45);
  assert.equal(potFractionRaiseTo(1, ctx), 90);
});

test('facing a bet: call first, then add the fraction of the pot after the call', () => {
  // pot 100 already holds villain's 40. Pot-sized raise = 40 call + 140 = 180.
  const ctx = { pot: 100, callAmount: 40, heroStreetBet: 0 };
  assert.equal(potFractionRaiseTo(1, ctx), 180);
  assert.equal(potFractionRaiseTo(1 / 2, ctx), 110);
});

test('facing a bet with chips already in: result is a street total, not an increment', () => {
  // BB (20 in) faces a raise to 60: callAmount 40. Raise-to = 20 in + 40 call + 140 = 200.
  const ctx = { pot: 100, callAmount: 40, heroStreetBet: 20 };
  assert.equal(potFractionRaiseTo(1, ctx), 200);
});

test('presets: five entries in order, last is all-in at the max', () => {
  const presets = buildSizingPresets({ pot: 90, callAmount: 0, heroStreetBet: 0, bounds: wide });
  assert.deepEqual(presets.map((p) => p.label), ['1/3', '1/2', '3/4', 'Pot', 'All-in']);
  assert.deepEqual(presets.map((p) => p.amount), [30, 45, 68, 90, 1000]);
  assert.equal(presets[4]?.isAllIn, true);
  assert.equal(presets[3]?.isAllIn, false);
});

test('presets clamp up to the minimum raise', () => {
  const presets = buildSizingPresets({
    pot: 30,
    callAmount: 20,
    heroStreetBet: 0,
    bounds: { min: 60, max: 1000 },
  });
  // 1/3: 20 + round(50/3)=37 -> clamped to 60
  assert.equal(presets[0]?.amount, 60);
});

test('presets clamp down to the stack and flag all-in', () => {
  const presets = buildSizingPresets({ pot: 900, callAmount: 0, heroStreetBet: 0, bounds: { min: 20, max: 300 } });
  assert.deepEqual(presets.map((p) => p.amount), [300, 300, 300, 300, 300]);
  assert.ok(presets.every((p) => p.isAllIn));
});

test('presets with a collapsed range (short stack) are all the max', () => {
  const bounds = getRaiseBounds({ minBetOrRaiseTo: 80, maxBetOrRaiseTo: 50 });
  const presets = buildSizingPresets({ pot: 100, callAmount: 30, heroStreetBet: 0, bounds });
  assert.ok(presets.every((p) => p.amount === 50 && p.isAllIn));
});

test('parseAmountDraft: strips junk, clamps, empty is null', () => {
  assert.equal(parseAmountDraft('', wide), null);
  assert.equal(parseAmountDraft('abc', wide), null);
  assert.equal(parseAmountDraft('1,250', wide), 1000);
  assert.equal(parseAmountDraft('3', wide), 20);
  assert.equal(parseAmountDraft('150', wide), 150);
});

test('resolveRaiseAction: bet vs raise_to vs all_in', () => {
  const unopened = { canBet: true, minBetOrRaiseTo: 20, maxBetOrRaiseTo: 500 };
  const facing = { canBet: false, minBetOrRaiseTo: 80, maxBetOrRaiseTo: 500 };
  assert.deepEqual(resolveRaiseAction(100, unopened), { type: 'bet', amount: 100 });
  assert.deepEqual(resolveRaiseAction(100, facing), { type: 'raise_to', amount: 100 });
  assert.deepEqual(resolveRaiseAction(10, facing), { type: 'raise_to', amount: 80 });
  assert.deepEqual(resolveRaiseAction(500, facing), { type: 'all_in', amount: 500 });
  assert.deepEqual(resolveRaiseAction(9999, unopened), { type: 'all_in', amount: 500 });
});

test('isCallAllIn needs the hero stack', () => {
  assert.equal(isCallAllIn({ canCall: true, callAmount: 300 }, 300), true);
  assert.equal(isCallAllIn({ canCall: true, callAmount: 100 }, 300), false);
  assert.equal(isCallAllIn({ canCall: true, callAmount: 100 }, null), false);
  assert.equal(isCallAllIn({ canCall: false, callAmount: 0 }, 0), false);
});

test('formatAmount keeps exact digits', () => {
  assert.equal(formatAmount(12500), '12,500');
});
