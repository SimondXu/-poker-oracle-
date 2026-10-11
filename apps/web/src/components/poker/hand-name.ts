/**
 * English hand names for the table ("Two Pair, Kings and Sevens"), PokerNow
 * style. Plain .ts so the pure view model and node tests can import it.
 */
import { evaluateBestSevenCards, type Card } from '@aipoker/game-engine';

const RANK_SINGULAR: Readonly<Record<number, string>> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

const RANK_PLURAL: Readonly<Record<number, string>> = {
  2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights',
  9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces',
};

function one(value: number | undefined): string {
  return RANK_SINGULAR[value ?? 0] ?? '?';
}

function many(value: number | undefined): string {
  return RANK_PLURAL[value ?? 0] ?? '?';
}

/**
 * Name for a game-engine rank vector `[category, ...tiebreakers]`
 * (0 high card … 8 straight flush, values 2..14).
 */
export function describeRankVector(rank: readonly (number | undefined)[]): string {
  const [category, a, b] = rank;
  switch (category) {
    case 8:
      return a === 14 ? 'Royal Flush' : `Straight Flush, ${one(a)} High`;
    case 7:
      return `Four of a Kind, ${many(a)}`;
    case 6:
      return `Full House, ${many(a)} full of ${many(b)}`;
    case 5:
      return `Flush, ${one(a)} High`;
    case 4:
      return `Straight, ${one(a)} High`;
    case 3:
      return `Three of a Kind, ${many(a)}`;
    case 2:
      return `Two Pair, ${many(a)} and ${many(b)}`;
    case 1:
      return `Pair of ${many(a)}`;
    default:
      return `${one(a)} High`;
  }
}

/** Best-hand name from hole + board cards, or null with fewer than 5 cards. */
export function describeBestHand(holeCards: readonly string[], boardCards: readonly string[]): string | null {
  const cards = [...holeCards, ...boardCards];
  if (cards.length < 5) {
    return null;
  }
  return describeRankVector(evaluateBestSevenCards(cards as Card[]).rank);
}
