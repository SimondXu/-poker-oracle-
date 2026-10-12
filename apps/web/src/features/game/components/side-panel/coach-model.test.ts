import assert from 'node:assert/strict';
import test from 'node:test';

import type { CoachAdvice, CoachReason, HandState, PlayerState } from '@aipoker/shared';

import { translate } from '../../../../i18n/translate.ts';
import {
  clearsPrice,
  coachEmptyState,
  coachVerdict,
  deriveCoachContext,
  formatPotOddsRatio,
  formatSpr,
  frequencyLabel,
  optionText,
  reasonText,
  sizeText,
  strengthFill,
} from './coach-model.ts';

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

test('SPR keeps one decimal below 10', () => {
  assert.equal(formatSpr(2.44), '2.4');
  assert.equal(formatSpr(13.6), '14');
});

const en = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars);
const zh = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('zh', key, vars);

function advice(overrides: Partial<CoachAdvice> = {}): CoachAdvice {
  return {
    policyVersion: 'test',
    personality: 'tag',
    handId: 'R:1',
    street: 'flop',
    actionIndex: 3,
    stateVersion: 7,
    spot: { holeCards: ['As', 'Ad'], board: ['Ah', '7c', '2d'], pot: 120, toCall: 0, heroStack: 940, bigBlind: 20 },
    options: [
      { kind: 'bet', to: 40, size: { unit: 'pot', value: 1 / 3 }, frequency: 0.85, reasons: [] },
      { kind: 'check', frequency: 0.15, reasons: [{ code: 'slowplay', params: { equity: 0.98 } }] },
    ],
    stable: true,
    equity: 0.98,
    equityStdErr: 0.006,
    equityVs: 'range',
    spr: 7.8,
    effStackBb: 47,
    position: 'bb',
    scenario: 'unopened',
    opponents: 1,
    reasons: [{ code: 'value', params: { equity: 0.98 } }],
    ...overrides,
  };
}

test('strength fill: equity from the advice, else the preflop percentile inverted, else nothing', () => {
  assert.equal(strengthFill({ heroTurn: true, advice: advice({ equity: 0.71 }) }), 0.71);
  assert.ok(Math.abs((strengthFill({ heroTurn: false, handPercentile: 0.12 }) ?? 0) - 0.88) < 1e-9);
  assert.equal(strengthFill({ heroTurn: false }), null);
});

test('equity clears the price only when both numbers exist', () => {
  assert.equal(clearsPrice(advice({ equity: 0.5, requiredEquity: 0.3 })), true);
  assert.equal(clearsPrice(advice({ equity: 0.2, requiredEquity: 0.3 })), false);
  assert.equal(clearsPrice(advice()), null);
  assert.equal(clearsPrice(undefined), null);
});

test('options name bet, raise-to and all-in with their amounts, and sizes in pot or big blinds', () => {
  const [bet] = advice().options;
  assert.equal(optionText(bet!, en), 'Bet 40');
  assert.equal(sizeText(bet!, en), '33% pot');
  assert.equal(optionText(bet!, zh), '下注 40');
  assert.equal(optionText({ kind: 'raise', to: 50, size: { unit: 'bb', value: 2.5 }, frequency: 1, reasons: [] }, en), 'Raise to 50');
  assert.equal(sizeText({ kind: 'raise', to: 50, size: { unit: 'bb', value: 2.5 }, frequency: 1, reasons: [] }, en), '2.5 BB');
  assert.equal(optionText({ kind: 'all_in', to: 940, frequency: 1, reasons: [] }, en), 'All-in 940');
  assert.equal(optionText({ kind: 'call', frequency: 1, reasons: [] }, en), 'Call');
  assert.equal(sizeText({ kind: 'call', frequency: 1, reasons: [] }, en), null);
});

test('the verdict commits only to a strong, stable top option', () => {
  assert.equal(coachVerdict(advice()), 'commit');
  assert.equal(coachVerdict(advice({ options: [{ kind: 'call', frequency: 0.55, reasons: [] }, { kind: 'fold', frequency: 0.45, reasons: [] }] })), 'mix');
  assert.equal(coachVerdict(advice({ stable: false })), 'close');
  assert.equal(frequencyLabel(0.53), '55%');
  assert.equal(frequencyLabel(0.01), '<5%');
  assert.equal(frequencyLabel(0.98), '>95%');
  assert.equal(frequencyLabel(1), '100%');
});

const EVERY_REASON: CoachReason[] = [
  { code: 'preflop_chart', params: { handClass: 'playable', scenario: 'facing_open', position: 'btn', effStackBb: 47.2 } },
  { code: 'price_ok', params: { equity: 0.41, required: 0.3 } },
  { code: 'price_short', params: { equity: 0.21, required: 0.3 } },
  { code: 'jam', params: { trigger: 'short_stack', effStackBb: 9, spr: 0.8 } },
  { code: 'jam', params: { trigger: 'low_spr', effStackBb: 30, spr: 0.9 } },
  { code: 'jam', params: { trigger: 'near_lock', effStackBb: 40, spr: 2.6 } },
  { code: 'value', params: { equity: 0.72 } },
  { code: 'slowplay', params: { equity: 0.95 } },
  { code: 'draw', params: { draw: 'oesd' } },
  { code: 'bluff_share', params: { frequency: 0.18 } },
  { code: 'cbet', params: { frequency: 0.6 } },
  { code: 'no_initiative', params: {} },
  { code: 'checked_to_in_position', params: {} },
  { code: 'position_range', params: { position: 'utg', scenario: 'unopened', share: 0.14, buttonShare: 0.48 } },
  { code: 'position_range', params: { position: 'btn', scenario: 'unopened', share: 0.48, buttonShare: null } },
  { code: 'sticky_opponent', params: { playerId: 'p3', foldToBet: 0.14, facingBets: 9 } },
];

test('every reason code reads as a sentence in both languages, with every value filled in', () => {
  const nameOf = (id: string) => (id === 'p3' ? 'Viper' : id);
  for (const t of [en, zh]) {
    for (const reason of EVERY_REASON) {
      const text = reasonText(reason, t, nameOf);
      assert.ok(!text.includes('{') && !text.startsWith('panel.'), `${reason.code}: ${text}`);
    }
  }
  assert.equal(reasonText(EVERY_REASON[1]!, en, nameOf), 'Equity 41% clears the 30% a call needs.');
  assert.equal(
    reasonText(EVERY_REASON[0]!, en, nameOf),
    'TAG chart: a playable hand facing an open from BTN, 47 BB deep.',
  );
  assert.equal(reasonText(EVERY_REASON.at(-1)!, zh, nameOf), 'Viper 面对下注只弃牌 14%（共 9 次），所以不诈唬。');
  const fromUtg = EVERY_REASON.find((reason) => reason.code === 'position_range' && reason.params.position === 'utg')!;
  assert.equal(reasonText(fromUtg, en, nameOf), 'From UTG, the TAG chart plays 14% of hands with no one in yet; on the button, 48%.');
  assert.equal(reasonText(fromUtg, zh, nameOf), '在 UTG，TAG 起手牌表无人入池时会玩 14% 的牌；按钮位是 48%。');
});
