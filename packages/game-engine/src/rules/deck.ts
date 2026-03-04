import type { Card, Rng } from '../state/types.ts';

const SUITS = ['h', 'd', 'c', 's'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export function createDeck(rng: Rng): Card[] {
  const deck: Card[] = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }

  // Fisher-Yates with explicit RNG injection keeps the engine deterministic.
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const current = deck[i] as Card;
    deck[i] = deck[j] as Card;
    deck[j] = current;
  }

  return deck;
}
