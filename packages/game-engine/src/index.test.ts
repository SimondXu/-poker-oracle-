import assert from 'node:assert/strict';
import test from 'node:test';

import { createDeck } from './index.ts';

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
