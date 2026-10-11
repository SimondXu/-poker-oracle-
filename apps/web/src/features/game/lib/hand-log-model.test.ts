import assert from 'node:assert/strict';
import test from 'node:test';

import type { GameAction, HandState, Phase, PlayerState } from '@aipoker/shared';

import {
  buildHandLog,
  describeAction,
  formatHandHeader,
  formatResultLine,
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

test('describeAction formats each action type', () => {
  assert.deepEqual(describeAction({ type: 'fold', amount: 0, addedAmount: 0, toAmount: 0 }), { verb: '弃牌', tone: 'fold', amount: null });
  assert.deepEqual(describeAction({ type: 'check', amount: 0, addedAmount: 0, toAmount: 0 }), { verb: '过牌', tone: 'check', amount: null });
  assert.deepEqual(describeAction({ type: 'call', amount: 40, addedAmount: 30, toAmount: 40 }), { verb: '跟注', tone: 'call', amount: '30' });
  assert.deepEqual(describeAction({ type: 'bet', amount: 50, addedAmount: 50, toAmount: 50 }), { verb: '下注', tone: 'raise', amount: '50' });
  assert.deepEqual(describeAction({ type: 'raise_to', amount: 60, addedAmount: 40, toAmount: 60 }), { verb: '加注到', tone: 'raise', amount: '60' });
  assert.deepEqual(describeAction({ type: 'all_in', amount: 1200, addedAmount: 1000, toAmount: 1200 }), { verb: '全压', tone: 'allin', amount: '1,200' });
});

test('header shows hand number, blinds and the button player', () => {
  const log = buildHandLog(makeHand());
  assert.equal(formatHandHeader(log.header), '第 12 手 · 盲注 10/20 · 庄位 Simon');
  assert.equal(formatHandHeader({ ...log.header, buttonName: null }), '第 12 手 · 盲注 10/20');
});

test('preflop section starts with blinds then actions in sequence order', () => {
  const hand = makeHand({
    actions: [action(2, 'betting_preflop', 1, 'raise_to', 60), action(1, 'betting_preflop', 0, 'fold')],
  });
  const kinds = buildHandLog(hand).entries.map((entry) => entry.kind);
  assert.deepEqual(kinds, ['street', 'blind', 'blind', 'action', 'action']);
  const actions = buildHandLog(hand).entries.filter((entry): entry is HandLogActionEntry => entry.kind === 'action');
  assert.deepEqual(actions.map((entry) => `${entry.playerName} ${entry.verb} ${entry.amount ?? ''}`.trim()), [
    'Simon 弃牌',
    'TAG Bot 1 加注到 60',
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

test('formatResultLine omits the hand name for uncontested pots', () => {
  assert.equal(formatResultLine({ playerName: 'TAG Bot 1', amount: 1240, handRankName: '两对' }), 'TAG Bot 1 赢得 1,240 · 两对');
  assert.equal(formatResultLine({ playerName: 'TAG Bot 1', amount: 40, handRankName: null }), 'TAG Bot 1 赢得 40');
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
