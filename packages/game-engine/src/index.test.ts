import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeck, initializeHand } from './index.ts';

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
