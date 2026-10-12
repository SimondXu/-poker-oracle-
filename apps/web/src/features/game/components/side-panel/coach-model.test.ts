import assert from 'node:assert/strict';
import test from 'node:test';

import type { HandState, PlayerState } from '@aipoker/shared';

import { translate } from '../../../../i18n/translate.ts';
import { clearsPrice, coachEmptyState, coachReason, deriveCoachContext, formatPotOddsRatio, strengthFill, type CoachData } from './coach-model.ts';

function player(id: string, seatIndex: number, overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id,
    name: id,
    seatIndex,
    stack: 500,
    streetCommitted: 0,
    handCommitted: 0,
    status: 'active',
    holeCards: [],
    isBot: id !== 'hero',
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
    ...overrides,
  };
}

function hand(overrides: Partial<HandState> = {}): HandState {
  return {
    id: 'h',
    roomId: 'r',
    handNumber: 1,
    phase: 'betting_flop',
    maxSeats: 9,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players: [
      player('hero', 0, { streetCommitted: 20, handCommitted: 40 }),
      player('a', 1, { streetCommitted: 140, handCommitted: 160 }),
      player('b', 2, { status: 'folded', handCommitted: 20 }),
      player('c', 3, { status: 'out' }),
    ],
    communityCards: [],
    pots: [],
    betting: { currentBetToMatch: 140, lastFullRaiseSize: 120, lastAggressorId: 'a' },
    currentActorSeat: 0,
    actions: [],
    ...overrides,
  };
}

test('context counts live opponents, the call amount and the pot on the table', () => {
  assert.deepEqual(deriveCoachContext(hand(), 'hero'), { opponents: 1, toCall: 120, pot: 220 });
});

test('the call amount is capped by the hero stack and is never negative', () => {
  const short = hand({ players: [player('hero', 0, { stack: 50, streetCommitted: 20 }), player('a', 1)] });
  assert.equal(deriveCoachContext(short, 'hero')?.toCall, 50);
  const free = hand({ betting: { currentBetToMatch: 20, lastFullRaiseSize: 20, lastAggressorId: null } });
  assert.equal(deriveCoachContext(free, 'hero')?.toCall, 0);
});

test('no context without a hand or a hero seat', () => {
  assert.equal(deriveCoachContext(null, 'hero'), null);
  assert.equal(deriveCoachContext(hand(), 'ghost'), null);
  assert.equal(deriveCoachContext(hand(), null), null);
});

test('pot odds ratio', () => {
  assert.equal(formatPotOddsRatio(0.25), '3.0');
  assert.equal(formatPotOddsRatio(0.3158), '2.2');
  assert.equal(formatPotOddsRatio(0.05), '19');
  assert.equal(formatPotOddsRatio(0), null);
  assert.equal(formatPotOddsRatio(1), null);
});

const equity = (value: number, extra: Partial<CoachData> = {}): CoachData => ({ strength: { kind: 'equity', value }, ...extra });

test('strength fill: equity as is, preflop percentile inverted', () => {
  assert.equal(strengthFill(equity(0.71)), 0.71);
  assert.ok(Math.abs(strengthFill({ strength: { kind: 'top_percent', value: 0.12 } }) - 0.88) < 1e-9);
});

test('equity clears the price only when both numbers exist', () => {
  assert.equal(clearsPrice(equity(0.5, { winRequirement: 0.3 })), true);
  assert.equal(clearsPrice(equity(0.2, { winRequirement: 0.3 })), false);
  assert.equal(clearsPrice(equity(0.5)), null);
  assert.equal(clearsPrice({ strength: { kind: 'top_percent', value: 0.1 }, winRequirement: 0.3 }), null);
});

const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars);

test('the reason is composed from the analysis in either locale', () => {
  const call = equity(0.45, { suggestion: 'call', winRequirement: 0.3, suggestionReason: '原文' });
  assert.equal(coachReason(call, en), 'Equity is about 45%, and calling needs about 30%. That clears the price to continue.');
  const zh = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('zh', key, vars);
  assert.equal(coachReason(call, zh), '当前权益约 45%，跟注所需约 30%。 已经覆盖继续投入的门槛。');
  const pre: CoachData = { strength: { kind: 'top_percent', value: 0.08 }, suggestion: 'raise', position: 'BTN' };
  assert.equal(coachReason(pre, en), 'This hand beats about 92% of starting hands, from BTN. Raising is the best training play here.');
  const pricedCall = equity(0.17, { suggestion: 'fold', winRequirement: 0.29, potOdds: 0.28 });
  assert.equal(
    coachReason(pricedCall, en)?.startsWith('Equity is about 17%, and calling needs about 29% (pot odds 28% plus a small safety margin).'),
    true,
  );
  assert.equal(coachReason({ strength: { kind: 'equity', value: 0.5 } }, en), null);
});

test('empty state tells a finished hand, a fold, a wait and no cards apart', () => {
  const dealt = (overrides: Partial<PlayerState>) => hand({ players: [player('hero', 0, { holeCards: ['Ah', 'Kd'], ...overrides }), player('a', 1)] });
  assert.equal(coachEmptyState(dealt({}), 'hero'), 'waiting');
  assert.equal(coachEmptyState(dealt({ status: 'folded' }), 'hero'), 'folded');
  assert.equal(coachEmptyState(dealt({ holeCards: [] }), 'hero'), 'no_cards');
  assert.equal(coachEmptyState({ ...dealt({}), phase: 'hand_end' }, 'hero'), 'hand_over');
  assert.equal(coachEmptyState(null, 'hero'), 'no_cards');
  assert.equal(coachEmptyState(dealt({}), 'ghost'), 'no_cards');
});

test('a hand that starts at hand_end (all-in from the blinds): context is safe, empty state is hand_over', () => {
  const over = hand({
    phase: 'hand_end',
    currentActorSeat: null,
    communityCards: ['Ah', 'Kd', '7c', '2s', '9h'],
    actions: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    players: [
      player('hero', 0, { status: 'all_in', stack: 0, handCommitted: 500, holeCards: ['As', 'Ad'] }),
      player('a', 1, { status: 'all_in', stack: 0, handCommitted: 500, holeCards: ['Kc', '3d'] }),
      player('b', 2, { status: 'folded', handCommitted: 20, holeCards: [] }),
    ],
    pots: [{ amount: 1020, eligiblePlayerIds: ['hero', 'a'] }],
  });
  assert.deepEqual(deriveCoachContext(over, 'hero'), { opponents: 1, toCall: 0, pot: 1020 });
  assert.equal(coachEmptyState(over, 'hero'), 'hand_over');
});

test('preflop straight to hand_end with a folded hero and empty hole cards is still hand_over', () => {
  const over = hand({
    phase: 'hand_end',
    communityCards: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    players: [player('hero', 0, { status: 'folded', holeCards: [] }), player('a', 1)],
  });
  assert.equal(coachEmptyState(over, 'hero'), 'hand_over');
  assert.deepEqual(deriveCoachContext(over, 'hero'), { opponents: 1, toCall: 0, pot: 0 });
});
