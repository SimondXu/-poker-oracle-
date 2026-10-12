import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canOfferPreAction,
  getHeroContext,
  getStreetKey,
  isPreActionCurrent,
  resolvePreAction,
  type HeroContext,
} from './action-bar-preaction.ts';

const free = { canCheck: true, canCall: false, canFold: true };
const facing = { canCheck: false, canCall: true, canFold: true };

test('check/fold: checks when free, folds when facing a bet', () => {
  assert.deepEqual(resolvePreAction('check_fold', free), { type: 'check' });
  assert.deepEqual(resolvePreAction('check_fold', facing), { type: 'fold' });
});

test('call any: checks when free, calls any amount otherwise', () => {
  assert.deepEqual(resolvePreAction('call_any', free), { type: 'check' });
  assert.deepEqual(resolvePreAction('call_any', facing), { type: 'call' });
});

test('no selection or nothing legal resolves to null', () => {
  assert.equal(resolvePreAction(null, free), null);
  assert.equal(resolvePreAction('call_any', { canCheck: false, canCall: false, canFold: true }), null);
  assert.equal(resolvePreAction('check_fold', { canCheck: false, canCall: true, canFold: false }), null);
});

const hand = {
  handNumber: 7,
  communityCards: ['Ah', 'Kd', '2c'],
  players: [
    { id: 'hero', status: 'active', stack: 400, streetCommitted: 20 },
    { id: 'bot', status: 'folded', stack: 100, streetCommitted: 0 },
  ],
} as unknown as Parameters<typeof getHeroContext>[0];

test('getHeroContext reads hero stack/status and a street key', () => {
  assert.deepEqual(getHeroContext(hand, 'hero'), {
    status: 'active',
    stack: 400,
    streetCommitted: 20,
    streetKey: '7:3',
    isPreflop: false,
  });
  assert.equal(getHeroContext(hand, 'nobody'), null);
  assert.equal(getHeroContext(null, 'hero'), null);
  assert.equal(getHeroContext(hand, undefined), null);
});

test('getStreetKey changes per street and per hand', () => {
  assert.equal(getStreetKey({ handNumber: 1, communityCards: [] }), '1:0');
  assert.notEqual(getStreetKey({ handNumber: 1, communityCards: ['Ah', 'Kd', '2c'] }), '1:0');
  assert.notEqual(getStreetKey({ handNumber: 2, communityCards: [] }), '1:0');
});

test('pre-actions are only offered to a live hero with chips', () => {
  const live: HeroContext = { status: 'active', stack: 10, streetCommitted: 0, streetKey: '1:0', isPreflop: true };
  assert.equal(canOfferPreAction(live), true);
  assert.equal(canOfferPreAction({ ...live, status: 'folded' }), false);
  assert.equal(canOfferPreAction({ ...live, status: 'all_in' }), false);
  assert.equal(canOfferPreAction({ ...live, stack: 0 }), false);
  assert.equal(canOfferPreAction(null), false);
});

test('a selection goes stale when the street or hand changes, or hero is out', () => {
  const live: HeroContext = { status: 'active', stack: 10, streetCommitted: 0, streetKey: '1:0', isPreflop: true };
  const selection = { kind: 'call_any' as const, streetKey: '1:0' };
  assert.equal(isPreActionCurrent(selection, live), true);
  assert.equal(isPreActionCurrent(selection, { ...live, streetKey: '1:3' }), false);
  assert.equal(isPreActionCurrent(selection, { ...live, streetKey: '2:0' }), false);
  assert.equal(isPreActionCurrent(selection, { ...live, status: 'folded' }), false);
  assert.equal(isPreActionCurrent(null, live), false);
});
