const SUITS = ['h', 'd', 'c', 's'] as const;
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type Card = `${Rank}${Suit}`;
export type Rng = () => number;

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
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}
