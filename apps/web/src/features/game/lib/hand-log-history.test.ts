import assert from 'node:assert/strict';
import test from 'node:test';

import { recordHandSummary, selectPastHands, type HandLogSummary } from './hand-log-history.ts';

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
