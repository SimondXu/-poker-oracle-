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
  const presets = buildSizingPresets({ pot: 90, callAmount: 0, heroStreetBet: 0, bounds: wide, canAllIn: true });
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
    canAllIn: true,
  });
  // 1/3: 20 + round(50/3)=37 -> clamped to 60
  assert.equal(presets[0]?.amount, 60);
});

test('presets that clamp to the stack collapse into the single all-in', () => {
  const presets = buildSizingPresets({ pot: 900, callAmount: 0, heroStreetBet: 0, bounds: { min: 20, max: 300 }, canAllIn: true });
  assert.deepEqual(presets.map((p) => [p.label, p.amount]), [['All-in', 300]]);
});

test('presets with a collapsed range (short stack) are just the all-in', () => {
  const bounds = getRaiseBounds({ minBetOrRaiseTo: 80, maxBetOrRaiseTo: 50 });
  const presets = buildSizingPresets({ pot: 100, callAmount: 30, heroStreetBet: 0, bounds, canAllIn: true });
  assert.deepEqual(presets.map((p) => [p.id, p.amount, p.isAllIn]), [['all-in', 50, true]]);
});

test('presets never repeat an amount: two fractions clamped to the min raise show once', () => {
  const presets = buildSizingPresets({ pot: 30, callAmount: 0, heroStreetBet: 0, bounds: { min: 40, max: 1000 }, canAllIn: true });
  const amounts = presets.map((p) => p.amount);
  assert.equal(new Set(amounts).size, amounts.length);
  assert.equal(amounts[0], 40);
});

test('preflop presets are multiples of the bet to match, then pot and all-in', () => {
  // Unopened in the small blind: the bet to match is the big blind (20).
  const unopened = buildSizingPresets({ pot: 30, callAmount: 10, heroStreetBet: 10, bounds: { min: 40, max: 1000 }, canAllIn: true, isPreflop: true });
  // Pot (60) equals 3x here, so it is left out.
  assert.deepEqual(unopened.map((p) => [p.label, p.amount]), [['2.5x', 50], ['3x', 60], ['4x', 80], ['All-in', 1000]]);
  // Facing a raise to 60: 3-bet sizes.
  const facing = buildSizingPresets({ pot: 90, callAmount: 60, heroStreetBet: 0, bounds: { min: 100, max: 1000 }, canAllIn: true, isPreflop: true });
  assert.deepEqual(facing.slice(0, 3).map((p) => p.amount), [150, 180, 240]);
});

test('parseAmountDraft: strips junk, clamps, empty is null', () => {
  assert.equal(parseAmountDraft('', wide), null);
  assert.equal(parseAmountDraft('abc', wide), null);
  assert.equal(parseAmountDraft('1,250', wide), 1000);
  assert.equal(parseAmountDraft('3', wide), 20);
  assert.equal(parseAmountDraft('150', wide), 150);
});

test('resolveRaiseAction: bet vs raise_to vs all_in', () => {
  const unopened = { canBet: true, canAllIn: true, minBetOrRaiseTo: 20, maxBetOrRaiseTo: 500 };
  const facing = { canBet: false, canAllIn: true, minBetOrRaiseTo: 80, maxBetOrRaiseTo: 500 };
  assert.deepEqual(resolveRaiseAction(100, unopened), { type: 'bet', amount: 100 });
  assert.deepEqual(resolveRaiseAction(100, facing), { type: 'raise_to', amount: 100 });
  assert.deepEqual(resolveRaiseAction(10, facing), { type: 'raise_to', amount: 80 });
  assert.deepEqual(resolveRaiseAction(500, facing), { type: 'all_in', amount: 500 });
  assert.deepEqual(resolveRaiseAction(9999, unopened), { type: 'all_in', amount: 500 });
});

test('canAllIn false (cannot raise, stack > call): no all-in preset, max is never sent as all_in', () => {
  const bounds = { min: 80, max: 500 };
  const presets = buildSizingPresets({ pot: 900, callAmount: 40, heroStreetBet: 0, bounds, canAllIn: false });
  // 1/2 and larger all clamp to the max, so it shows once; none is an all-in.
  assert.deepEqual(presets.map((p) => [p.label, p.amount]), [['1/3', 353], ['1/2', 500]]);
  assert.ok(presets.every((p) => p.amount <= bounds.max && !p.isAllIn));

  const facing = { canBet: false, canAllIn: false, minBetOrRaiseTo: 80, maxBetOrRaiseTo: 500 };
  const unopened = { canBet: true, canAllIn: false, minBetOrRaiseTo: 20, maxBetOrRaiseTo: 500 };
  assert.deepEqual(resolveRaiseAction(500, facing), { type: 'raise_to', amount: 500 });
  assert.deepEqual(resolveRaiseAction(9999, facing), { type: 'raise_to', amount: 500 });
  assert.deepEqual(resolveRaiseAction(9999, unopened), { type: 'bet', amount: 500 });
});

test('canAllIn true: all-in preset and the max resolve to all_in at the max', () => {
  const presets = buildSizingPresets({ pot: 90, callAmount: 0, heroStreetBet: 0, bounds: wide, canAllIn: true });
  assert.deepEqual(presets.at(-1), { id: 'all-in', label: 'All-in', amount: 1000, isAllIn: true });
  const facing = { canBet: false, canAllIn: true, minBetOrRaiseTo: 80, maxBetOrRaiseTo: 500 };
  assert.deepEqual(resolveRaiseAction(500, facing), { type: 'all_in', amount: 500 });
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
