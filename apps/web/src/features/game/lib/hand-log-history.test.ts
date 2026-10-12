import assert from 'node:assert/strict';
import test from 'node:test';

import type { HandState, PlayerState } from '@aipoker/shared';

import { recordHandSummary, selectPastHands, summarizeFinishedHand, type HandLogSummary } from './hand-log-history.ts';

function summary(handNumber: number, roomId = 'room-1', amount = 100): HandLogSummary {
  return {
    roomId,
    handNumber,
    board: [],
    potTotal: amount,
    results: [{ playerId: 'p1', playerName: 'TAG Bot 1', amount, handRankName: null, cards: [] }],
    log: { header: { handNumber, smallBlind: 10, bigBlind: 20, buttonName: null }, entries: [], results: [], potTotal: amount },
    hero: null,
  };
}

test('records hands in order and keeps only the newest `limit`', () => {
  let history: readonly HandLogSummary[] = [];
  for (let n = 1; n <= 5; n += 1) history = recordHandSummary(history, summary(n), 3);
  assert.deepEqual(history.map((entry) => entry.handNumber), [3, 4, 5]);
});

test('re-recording the same hand replaces it, and identical content returns the same array', () => {
  const first = recordHandSummary([], summary(1));
  assert.equal(recordHandSummary(first, summary(1)), first);
  const replaced = recordHandSummary(first, summary(1, 'room-1', 250));
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0]?.potTotal, 250);
});

test('switching room drops the previous room history', () => {
  const history = recordHandSummary(recordHandSummary([], summary(1, 'a')), summary(1, 'b'));
  assert.deepEqual(history.map((entry) => entry.roomId), ['b']);
});

test('selectPastHands excludes the current hand and other rooms', () => {
  const history = recordHandSummary(recordHandSummary([], summary(1)), summary(2));
  assert.deepEqual(selectPastHands(history, 'room-1', 2).map((entry) => entry.handNumber), [1]);
  assert.deepEqual(selectPastHands(history, 'other', 2), []);
  assert.deepEqual(selectPastHands(history, null, null), []);
});

test('session history path: a hand that starts at hand_end and a preflop fold-out both summarize and record', () => {
  const players: PlayerState[] = ['hero', 'bot-tag-1', 'bot-fish-2'].map((id, seatIndex) => ({
    id,
    name: id,
    seatIndex,
    stack: 1000,
    streetCommitted: 0,
    handCommitted: seatIndex === 2 ? 20 : 500,
    status: seatIndex === 2 ? 'folded' : 'all_in',
    holeCards: seatIndex === 2 ? [] : ['As', 'Kd'],
    isBot: seatIndex > 0,
    hasActedThisStreet: false,
    matchedBetToMatchAtLastAction: 0,
  }));
  const base: HandState = {
    id: 'room-1:5',
    roomId: 'room-1',
    handNumber: 5,
    phase: 'hand_end',
    maxSeats: 9,
    smallBlind: 10,
    bigBlind: 20,
    buttonMarkerSeat: 0,
    sbSeat: 1,
    bbSeat: 2,
    players,
    communityCards: ['Ah', 'Kd', '7c', '2s', '9h'],
    pots: [],
    betting: { currentBetToMatch: 0, lastFullRaiseSize: 20, lastAggressorId: null },
    currentActorSeat: null,
    actions: [],
  };
  const result = {
    potTotal: 1020,
    payouts: [{ playerId: 'hero', playerName: 'hero', amount: 1020, handRankName: '两对', bestCards: ['As', 'Ah', 'Kd', 'Kd', '9h'] }],
  };

  const allIn = summarizeFinishedHand(base, result, 'hero');
  assert.equal(allIn.hero?.outcome, 'won');
  assert.equal(allIn.hero?.net, 520);
  assert.equal(allIn.hero?.foldedStreet, null);
  assert.deepEqual(allIn.board, base.communityCards);

  const foldOut = summarizeFinishedHand(
    { ...base, handNumber: 6, communityCards: [] },
    { potTotal: 30, payouts: [{ playerId: 'hero', playerName: 'hero', amount: 30, handRankName: '', bestCards: [] }] },
    'hero',
  );
  assert.equal(foldOut.hero?.uncontested, true);
  assert.equal(foldOut.board.length, 0);

  const history = recordHandSummary(recordHandSummary([], allIn), foldOut);
  assert.deepEqual(history.map((entry) => entry.handNumber), [5, 6]);
});
