import assert from 'node:assert/strict';
import test from 'node:test';

import { applyAction, createDeck, getValidActions, initializeHand } from './index.ts';

function sequenceRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

test('createDeck returns deterministic shuffled 52-card deck with injected rng', () => {
  const deckA = createDeck(sequenceRng(123));
  const deckB = createDeck(sequenceRng(123));
  const deckC = createDeck(sequenceRng(456));

  assert.equal(deckA.length, 52);
  assert.equal(new Set(deckA).size, 52);
  assert.deepEqual(deckA, deckB);
  assert.notDeepEqual(deckA, deckC);
});

test('createDeck never reads Math.random', () => {
  const originalRandom = Math.random;
  Math.random = () => {
    throw new Error('Math.random must not be called in game-engine');
  };

  try {
    assert.doesNotThrow(() => {
      createDeck(() => 0.5);
    });
  } finally {
    Math.random = originalRandom;
  }
});

test('initializeHand sets blinds and first actor for ring game', () => {
  const result = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(7)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.sbSeat, 1);
  assert.equal(result.value.bbSeat, 2);
  assert.equal(result.value.currentActorSeat, 3);
  assert.equal(result.value.betting.currentBetToMatch, 20);
  assert.equal(result.value.betting.lastFullRaiseSize, 20);
  assert.equal(result.value.betting.lastAggressorId, 'p2');

  const seat1 = result.value.players.find((player) => player.seatIndex === 1);
  const seat2 = result.value.players.find((player) => player.seatIndex === 2);
  const seat3 = result.value.players.find((player) => player.seatIndex === 3);
  assert.equal(seat1?.stack, 990);
  assert.equal(seat1?.streetCommitted, 10);
  assert.equal(seat2?.stack, 980);
  assert.equal(seat2?.streetCommitted, 20);
  assert.equal(seat3?.stack, 1000);
  assert.equal(seat3?.streetCommitted, 0);
});

test('initializeHand uses heads-up blind positions (button posts small blind)', () => {
  const result = initializeHand({
    players: [
      { id: 'pA', seatIndex: 2, stack: 500 },
      { id: 'pB', seatIndex: 5, stack: 500 }
    ],
    buttonMarkerSeat: 2,
    smallBlind: 5,
    bigBlind: 10,
    rng: sequenceRng(11)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.sbSeat, 2);
  assert.equal(result.value.bbSeat, 5);
  assert.equal(result.value.currentActorSeat, 2);
});

test('initializeHand returns error when active players are fewer than two', () => {
  const result = initializeHand({
    players: [{ id: 'solo', seatIndex: 4, stack: 100 }],
    buttonMarkerSeat: 4,
    smallBlind: 5,
    bigBlind: 10,
    rng: sequenceRng(1)
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'not_enough_players'
  });
});

test('getValidActions returns call and raise options for first preflop actor', () => {
  const result = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(99)
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const valid = getValidActions(result.value, 'p3');

  assert.deepEqual(valid, {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 20,
    canRaise: true,
    minRaiseTo: 40,
    maxRaiseTo: 1000,
    canAllIn: true
  });
});

test('applyAction raise_to resets pending actors to everyone except raiser', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 1000 },
      { id: 'p2', seatIndex: 2, stack: 1000 },
      { id: 'p3', seatIndex: 3, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 10,
    bigBlind: 20,
    rng: sequenceRng(100)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const next = applyAction(initialized.value, {
    playerId: 'p3',
    type: 'raise_to',
    amount: 60
  });

  assert.equal(next.ok, true);
  if (!next.ok) return;

  assert.equal(next.value.currentActorSeat, 0);
  assert.deepEqual(next.value.pendingActorIds.sort(), ['p0', 'p1', 'p2']);
  assert.equal(next.value.betting.currentBetToMatch, 60);
  assert.equal(next.value.betting.lastFullRaiseSize, 40);
});

test('short all-in does not re-open betting for a player who already acted', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 1000 },
      { id: 'p1', seatIndex: 1, stack: 250 },
      { id: 'p2', seatIndex: 2, stack: 1000 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(101)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const a = applyAction(initialized.value, {
    playerId: 'p0',
    type: 'raise_to',
    amount: 200
  });
  assert.equal(a.ok, true);
  if (!a.ok) return;

  const b = applyAction(a.value, {
    playerId: 'p1',
    type: 'all_in'
  });
  assert.equal(b.ok, true);
  if (!b.ok) return;

  const c = applyAction(b.value, {
    playerId: 'p2',
    type: 'call'
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const validForP0 = getValidActions(c.value, 'p0');
  assert.equal(validForP0.canRaise, false);
  assert.equal(validForP0.canCall, true);
  assert.equal(validForP0.callAmount, 50);
});

test('multiple short all-ins can cumulatively re-open betting', () => {
  const initialized = initializeHand({
    players: [
      { id: 'p0', seatIndex: 0, stack: 250 },
      { id: 'p1', seatIndex: 1, stack: 300 },
      { id: 'p2', seatIndex: 2, stack: 1200 },
      { id: 'p3', seatIndex: 3, stack: 1200 }
    ],
    buttonMarkerSeat: 0,
    smallBlind: 50,
    bigBlind: 100,
    rng: sequenceRng(102)
  });

  assert.equal(initialized.ok, true);
  if (!initialized.ok) return;

  const a = applyAction(initialized.value, {
    playerId: 'p3',
    type: 'raise_to',
    amount: 200
  });
  assert.equal(a.ok, true);
  if (!a.ok) return;

  const b = applyAction(a.value, {
    playerId: 'p0',
    type: 'all_in'
  });
  assert.equal(b.ok, true);
  if (!b.ok) return;

  const c = applyAction(b.value, {
    playerId: 'p1',
    type: 'all_in'
  });
  assert.equal(c.ok, true);
  if (!c.ok) return;

  const d = applyAction(c.value, {
    playerId: 'p2',
    type: 'call'
  });
  assert.equal(d.ok, true);
  if (!d.ok) return;

  const validForP3 = getValidActions(d.value, 'p3');
  assert.equal(validForP3.canRaise, true);
  assert.equal(validForP3.callAmount, 100);
  assert.equal(validForP3.minRaiseTo, 400);
});
