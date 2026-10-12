import type {
  Card,
  Rank,
} from '@aipoker/shared';
import type { BotRng, RankVector } from './types.ts';

export const RANKS_DESC: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const SUITS = ['h', 'd', 'c', 's'] as const;

const RANK_VALUE: Record<Rank, number> = {
  A: 14,
  K: 13,
  Q: 12,
  J: 11,
  T: 10,
  '9': 9,
  '8': 8,
  '7': 7,
  '6': 6,
  '5': 5,
  '4': 4,
  '3': 3,
  '2': 2,
};

const FULL_DECK: Card[] = RANKS_DESC.flatMap((rank) => SUITS.map((suit) => `${rank}${suit}` as Card));

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function rankValue(cardOrRank: Card | Rank): number {
  const rank = cardOrRank[0] as Rank;
  return RANK_VALUE[rank];
}

export function compareRankVectors(left: RankVector, right: RankVector): number {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createStableAnalysisRng(seed: string): BotRng {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function remainingDeck(usedCards: readonly Card[]): Card[] {
  const used = new Set(usedCards);
  return FULL_DECK.filter((card) => !used.has(card));
}

export function sampleWithoutReplacement(deck: Card[], count: number, rng: BotRng): Card[] {
  const available = [...deck];
  const sample: Card[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const pickIndex = Math.floor(rng() * available.length);
    const [picked] = available.splice(pickIndex, 1);
    if (picked) {
      sample.push(picked);
    }
  }
  return sample;
}
