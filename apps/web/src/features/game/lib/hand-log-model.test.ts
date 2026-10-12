import assert from 'node:assert/strict';
import test from 'node:test';

import type { GameAction, HandState, Phase, PlayerState } from '@aipoker/shared';

import {
  buildHandLog,
  describeAction,
  handRankKey,
  summarizeResult,
  type HandLogActionEntry,
} from './hand-log-model.ts';

function player(id: string, name: string, seatIndex: number): PlayerState {
  return {
    id,
    name,
    seatIndex,
    stack: 1000,
    streetCommitted: 0,
    handCommitted: 0,
    status: 'active',
    holeCards: [],
    isBot: false,
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
  };
}

function action(sequenceNum: number, phase: Phase, playerIndex: number, type: GameAction['type'], toAmount = 0, addedAmount = toAmount): GameAction {
  const p = PLAYERS[playerIndex]!;
  return {
    playerId: p.id,
    playerName: p.name,
    seatIndex: p.seatIndex,
    phase,
    type,
    amount: toAmount,
    addedAmount,
    toAmount,
    stackBefore: 1000,
    potTotalBefore: 0,
    sequenceNum,
    timestamp: sequenceNum,
  };
}

const PLAYERS = [player('p0', 'Simon', 0), player('p1', 'TAG Bot 1', 1), player('p2', 'Fish Bot 2', 2)];

function makeHand(overrides: Partial<HandState> = {}): HandState {
  return {
    id: 'h1',
    roomId: 'room-1',
    handNumber: 12,
    phase: 'betting_preflop',
    maxSeats: 9,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players: PLAYERS,
    communityCards: [],
    pots: [],
    betting: { currentBetToMatch: 20, lastFullRaiseSize: 20, lastAggressorId: null },
    currentActorSeat: 0,
    actions: [],
    ...overrides,
  };
}

test('describeAction returns the amount to show and the chips-to-pot ratio', () => {
  assert.deepEqual(describeAction({ type: 'fold', amount: 0, addedAmount: 0, toAmount: 0 }), { type: 'fold', tone: 'fold', amount: null, betRatio: null });
  assert.deepEqual(describeAction({ type: 'check', amount: 0, addedAmount: 0, toAmount: 0 }), { type: 'check', tone: 'check', amount: null, betRatio: null });
  assert.deepEqual(describeAction({ type: 'call', amount: 40, addedAmount: 30, toAmount: 40, potTotalBefore: 90 }), { type: 'call', tone: 'call', amount: 30, betRatio: 30 / 90 });
  assert.deepEqual(describeAction({ type: 'bet', amount: 50, addedAmount: 50, toAmount: 50, potTotalBefore: 100 }), { type: 'bet', tone: 'raise', amount: 50, betRatio: 0.5 });
  assert.deepEqual(describeAction({ type: 'raise_to', amount: 60, addedAmount: 40, toAmount: 60, potTotalBefore: 80 }), { type: 'raise_to', tone: 'raise', amount: 60, betRatio: 0.5 });
  assert.deepEqual(describeAction({ type: 'all_in', amount: 1200, addedAmount: 1000, toAmount: 1200, potTotalBefore: 500 }), { type: 'all_in', tone: 'allin', amount: 1200, betRatio: 2 });
});

test('a bet with no known pot has no ratio', () => {
  assert.equal(describeAction({ type: 'bet', amount: 50, addedAmount: 50, toAmount: 50, potTotalBefore: 0 }).betRatio, null);
});

test('handRankKey maps the server hand names and rejects the rest', () => {
  assert.equal(handRankKey('两对'), 'two_pair');
  assert.equal(handRankKey('同花顺'), 'straight_flush');
  assert.equal(handRankKey(''), null);
  assert.equal(handRankKey('未知'), null);
  assert.equal(handRankKey(null), null);
});

test('blinds carry the player id, side and amount', () => {
  const blinds = buildHandLog(makeHand()).entries.flatMap((entry) => (entry.kind === 'blind' ? [entry] : []));
  assert.deepEqual(blinds.map((entry) => [entry.playerId, entry.blind, entry.amount]), [['p1', 'sb', 10], ['p2', 'bb', 20]]);
});

test('the header carries hand number, blinds and the button player', () => {
  const log = buildHandLog(makeHand());
  assert.deepEqual(log.header, { handNumber: 12, smallBlind: 10, bigBlind: 20, buttonName: 'Simon' });
});

test('preflop section starts with blinds then actions in sequence order', () => {
  const hand = makeHand({
    actions: [action(2, 'betting_preflop', 1, 'raise_to', 60), action(1, 'betting_preflop', 0, 'fold')],
  });
  const kinds = buildHandLog(hand).entries.map((entry) => entry.kind);
  assert.deepEqual(kinds, ['street', 'blind', 'blind', 'action', 'action']);
  const actions = buildHandLog(hand).entries.filter((entry): entry is HandLogActionEntry => entry.kind === 'action');
  assert.deepEqual(actions.map((entry) => `${entry.playerName} ${entry.type} ${entry.amount ?? ''}`.trim()), [
    'Simon fold',
    'TAG Bot 1 raise_to 60',
  ]);
});

test('street separators carry the cumulative board and appear for all-in run-outs', () => {
  const hand = makeHand({
    phase: 'hand_end',
    communityCards: ['Ah', 'Kd', '7c', '2s', '9h'],
    actions: [action(1, 'betting_preflop', 0, 'all_in', 1000), action(2, 'betting_preflop', 1, 'call', 1000)],
  });
  const streets = buildHandLog(hand).entries.flatMap((entry) => (entry.kind === 'street' ? [entry] : []));
  assert.deepEqual(streets.map((entry) => entry.street), ['preflop', 'flop', 'turn', 'river']);
  assert.deepEqual(streets[1]?.board, ['Ah', 'Kd', '7c']);
  assert.deepEqual(streets[3]?.board, ['Ah', 'Kd', '7c', '2s', '9h']);
  assert.deepEqual(streets[0]?.board, []);
});

test('streets without board cards or actions are omitted', () => {
  const hand = makeHand({ phase: 'betting_flop', communityCards: ['Ah', 'Kd', '7c'] });
  const streets = buildHandLog(hand).entries.flatMap((entry) => (entry.kind === 'street' ? [entry.street] : []));
  assert.deepEqual(streets, ['preflop', 'flop']);
});

test('summarizeResult merges payouts per player, biggest first', () => {
  const lines = summarizeResult({
    potTotal: 300,
    payouts: [
      { playerId: 'p1', playerName: 'TAG Bot 1', amount: 100, handRankName: '', bestCards: [] },
      { playerId: 'p2', playerName: 'Fish Bot 2', amount: 50, handRankName: '一对', bestCards: ['Ah', 'Ad'] },
      { playerId: 'p1', playerName: 'TAG Bot 1', amount: 150, handRankName: '两对', bestCards: ['Kh', 'Kd'] },
    ],
  });
  assert.deepEqual(lines.map((line) => [line.playerId, line.amount, line.handRankName]), [
    ['p1', 250, '两对'],
    ['p2', 50, '一对'],
  ]);
  assert.deepEqual(lines[0]?.cards, ['Kh', 'Kd']);
});

test('results are only attached when a result is given', () => {
  assert.deepEqual(buildHandLog(makeHand()).results, []);
  const log = buildHandLog(makeHand(), {
    potTotal: 80,
    payouts: [{ playerId: 'p1', playerName: 'TAG Bot 1', amount: 80, handRankName: '', bestCards: [] }],
  });
  assert.equal(log.results.length, 1);
  assert.equal(log.potTotal, 80);
});

const RUNOUT_BOARD: HandState['communityCards'] = ['Ah', 'Kd', '7c', '2s', '9h'];

test('a hand that starts at hand_end (0 actions, five board cards): blinds, one block per dealt street, result rows', () => {
  const hand = makeHand({ phase: 'hand_end', communityCards: RUNOUT_BOARD, actions: [], currentActorSeat: null });
  const log = buildHandLog(hand, {
    potTotal: 60,
    payouts: [{ playerId: 'p0', playerName: 'Simon', amount: 60, handRankName: '一对', bestCards: ['Ah', 'Ad', 'Kd', '9h', '7c'] }],
  });

  const blocks: { street: string; board: number; actions: number }[] = [];
  for (const entry of log.entries) {
    if (entry.kind === 'street') blocks.push({ street: entry.street, board: entry.board.length, actions: 0 });
    else if (entry.kind === 'action') blocks.at(-1)!.actions += 1;
  }
  assert.deepEqual(blocks.map((block) => block.street), ['preflop', 'flop', 'turn', 'river']);
  // No block is empty: either it has actions or its board cards are dealt (preflop has the blinds).
  assert.ok(blocks.slice(1).every((block) => block.board > 0 || block.actions > 0));
  assert.deepEqual(log.entries.filter((entry) => entry.kind === 'blind').map((entry) => entry.key), ['blind-sb', 'blind-bb']);
  assert.equal(log.results.length, 1);
  assert.equal(log.results[0]?.handRankName, '一对');
  assert.equal(log.potTotal, 60);
});

test('preflop straight to hand_end with no board: a single preflop block, uncontested result row', () => {
  const hand = makeHand({
    phase: 'hand_end',
    communityCards: [],
    currentActorSeat: null,
    actions: [action(1, 'betting_preflop', 0, 'raise_to', 60), action(2, 'betting_preflop', 1, 'fold'), action(3, 'betting_preflop', 2, 'fold')],
  });
  const log = buildHandLog(hand, {
    potTotal: 90,
    payouts: [{ playerId: 'p0', playerName: 'Simon', amount: 90, handRankName: '', bestCards: [] }],
  });
  const streets = log.entries.flatMap((entry) => (entry.kind === 'street' ? [entry.street] : []));
  assert.deepEqual(streets, ['preflop']);
  assert.equal(log.entries.filter((entry) => entry.kind === 'action').length, 3);
  assert.deepEqual(log.results.map((line) => [line.playerName, line.amount, line.handRankName, line.cards]), [['Simon', 90, null, []]]);
});

test('hand_end with no actions and no board still builds (blinds only, no crash on missing seats)', () => {
  const hand = makeHand({ phase: 'hand_end', communityCards: [], actions: [], sbSeat: null, bbSeat: 8 });
  const log = buildHandLog(hand);
  assert.deepEqual(log.entries.map((entry) => entry.kind), ['street']);
  assert.deepEqual(log.results, []);
});
