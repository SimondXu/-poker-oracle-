import type {
  BotBettingState,
  BotPosition,
  Card,
  Rank,
} from '@aipoker/shared';
import type { HandClass, HandDetail, PreflopPosition, PreflopScenario, StackBucket } from './types.ts';
import { RANKS_DESC, rankValue } from './cards.ts';

const CHEN_BASE_SCORES: Record<Rank, number> = {
  A: 10,
  K: 8,
  Q: 7,
  J: 6,
  T: 5,
  '9': 4.5,
  '8': 4,
  '7': 3.5,
  '6': 3,
  '5': 2.5,
  '4': 2,
  '3': 1.5,
  '2': 1,
};

const PRE_FLOP_PERCENTILES = buildPreflopPercentiles();

function generateCanonicalStartingHands(): string[] {
  const hands: string[] = [];

  for (let highIndex = 0; highIndex < RANKS_DESC.length; highIndex += 1) {
    const highRank = RANKS_DESC[highIndex];
    if (!highRank) {
      continue;
    }

    hands.push(`${highRank}${highRank}`);

    for (let lowIndex = highIndex + 1; lowIndex < RANKS_DESC.length; lowIndex += 1) {
      const lowRank = RANKS_DESC[lowIndex];
      if (!lowRank) {
        continue;
      }

      hands.push(`${highRank}${lowRank}s`);
      hands.push(`${highRank}${lowRank}o`);
    }
  }

  return hands;
}

function scorePreflopKey(key: string): number {
  const highRank = key[0] as Rank;
  const lowRank = key[1] as Rank;
  const highValue = rankValue(highRank);
  const lowValue = rankValue(lowRank);
  const isPair = key.length === 2;
  const suited = key.endsWith('s');

  if (isPair) {
    return Math.max(5, CHEN_BASE_SCORES[highRank] * 2);
  }

  let score = CHEN_BASE_SCORES[highRank];
  if (suited) {
    score += 2;
  }

  const gap = Math.max(0, highValue - lowValue - 1);
  if (gap === 0) {
    score += 1;
  } else if (gap === 1) {
    score -= 1;
  } else if (gap === 2) {
    score -= 2;
  } else if (gap === 3) {
    score -= 4;
  } else {
    score -= 5;
  }

  if (gap <= 1 && highValue < 12) {
    score += 1;
  }

  if (highRank === 'A' && suited && lowValue >= 4) {
    score += 0.5;
  }

  if (!suited && highValue >= 11 && lowValue >= 10) {
    score += 0.5;
  }

  return score;
}

function buildPreflopPercentiles(): Map<string, number> {
  const rankedHands = generateCanonicalStartingHands()
    .map((key) => ({
      key,
      score: scorePreflopKey(key),
      pair: key.length === 2,
      suited: key.endsWith('s'),
      highValue: rankValue(key[0] as Rank),
      lowValue: rankValue(key[1] as Rank),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (right.pair !== left.pair) {
        return Number(right.pair) - Number(left.pair);
      }
      if (right.highValue !== left.highValue) {
        return right.highValue - left.highValue;
      }
      if (right.lowValue !== left.lowValue) {
        return right.lowValue - left.lowValue;
      }
      if (right.suited !== left.suited) {
        return Number(right.suited) - Number(left.suited);
      }
      return left.key.localeCompare(right.key);
    });

  const total = rankedHands.length;
  const percentiles = new Map<string, number>();
  rankedHands.forEach((entry, index) => {
    percentiles.set(entry.key, (index + 1) / total);
  });

  return percentiles;
}

export function evaluatePreflopPercentile(holeCards: readonly Card[]): number {
  const key = canonicalizeHoleCards(holeCards);
  return PRE_FLOP_PERCENTILES.get(key) ?? 1;
}

export function getPreflopTablePosition(position: BotPosition, activePlayerCount: number): PreflopPosition {
  if (activePlayerCount === 2 && position === 'btn') {
    return 'sb';
  }
  return position;
}

export function normalizePreflopScenario(state: BotBettingState): PreflopScenario {
  if (state === 'facing_raise' || state === 'facing_3bet_plus') {
    return 'facing_3bet_plus';
  }
  if (state === 'facing_limpers') {
    return 'facing_limpers';
  }
  if (state === 'facing_open') {
    return 'facing_open';
  }
  return 'unopened';
}

export function canonicalizeHoleCards(holeCards: readonly Card[]): string {
  if (holeCards.length < 2) {
    return '72o';
  }

  const [left, right] = holeCards;
  if (!left || !right) {
    return '72o';
  }

  const leftRank = left[0] as Rank;
  const rightRank = right[0] as Rank;
  if (leftRank === rightRank) {
    return `${leftRank}${rightRank}`;
  }

  const leftValue = rankValue(leftRank);
  const rightValue = rankValue(rightRank);
  const highRank = leftValue > rightValue ? leftRank : rightRank;
  const lowRank = leftValue > rightValue ? rightRank : leftRank;
  const suited = left[1] === right[1];
  return `${highRank}${lowRank}${suited ? 's' : 'o'}`;
}

function handHasRanks(key: string, ranks: string[]): boolean {
  return ranks.every((rank) => key.includes(rank));
}

const HAND_CLASS_ORDER: readonly HandClass[] = ['trash', 'marginal', 'speculative', 'playable', 'strong', 'premium'];

/**
 * The mixes are six-max ranges. Heads-up both players play far wider (a button opens most hands,
 * the big blind defends most), so each hand is played like a hand two classes stronger.
 */
const HEADS_UP_CLASS_STEPS = 2;

export function widenHandClassForHeadsUp(handClass: HandClass): HandClass {
  const index = HAND_CLASS_ORDER.indexOf(handClass);
  return HAND_CLASS_ORDER[Math.min(index + HEADS_UP_CLASS_STEPS, HAND_CLASS_ORDER.length - 1)] ?? handClass;
}

export function classifyHand(key: string): HandClass {
  if (key.length === 2) {
    const pairValue = rankValue(key[0] as Rank);
    if (pairValue >= 11) return 'premium';
    if (pairValue >= 9) return 'strong';
    if (pairValue >= 7) return 'playable';
    return 'speculative';
  }

  const suited = key.endsWith('s');
  const highRank = key[0] as Rank;
  const lowRank = key[1] as Rank;
  const highValue = rankValue(highRank);
  const lowValue = rankValue(lowRank);

  if (
    key === 'AKs'
    || key === 'AKo'
    || key === 'AQs'
    || key === 'AQo'
  ) {
    return 'premium';
  }

  if (
    key === 'AJs'
    || key === 'KQs'
    || key === 'KQo'
    || key === 'ATs'
    || key === 'AJo'
  ) {
    return 'strong';
  }

  if (
    suited
    && (handHasRanks(key, ['Q', 'J']) || handHasRanks(key, ['J', 'T']) || handHasRanks(key, ['T', '9']) || handHasRanks(key, ['9', '8']))
  ) {
    return 'playable';
  }

  if (suited && highRank === 'A') {
    return lowValue >= 9 ? 'strong' : 'speculative';
  }

  if (suited && highValue >= 12 && lowValue >= 9) {
    return 'playable';
  }

  if (
    suited
    && highValue - lowValue <= 2
    && highValue >= 6
  ) {
    return 'speculative';
  }

  if (!suited && highValue >= 12 && lowValue >= 10) {
    return 'playable';
  }

  if (!suited && highRank === 'A' && lowValue >= 8) {
    return 'marginal';
  }

  if (suited && highValue >= 10) {
    return 'marginal';
  }

  if (!suited && highValue >= 11 && lowValue >= 8) {
    return 'marginal';
  }

  return 'trash';
}

export function getHandDetail(key: string): HandDetail {
  if (key.length === 2) {
    return rankValue(key[0] as Rank) >= 10 ? 'premium_pair' : 'small_pair';
  }

  const suited = key.endsWith('s');
  const highRank = key[0] as Rank;
  const lowRank = key[1] as Rank;
  const highValue = rankValue(highRank);
  const lowValue = rankValue(lowRank);
  const gap = highValue - lowValue;
  const bothBroadway = highValue >= 10 && lowValue >= 10;

  if (highRank === 'A' && suited) {
    return 'suited_ace';
  }

  if (highRank === 'A' && !suited && lowValue <= 9) {
    return 'weak_offsuit_ace';
  }

  if (suited && bothBroadway) {
    return 'suited_broadway';
  }

  if (!suited && bothBroadway) {
    return 'offsuit_broadway';
  }

  if (suited && highRank === 'K' && lowValue >= 5) {
    return 'suited_king';
  }

  if (suited && gap === 1 && highValue >= 5) {
    return 'suited_connector';
  }

  if (suited && gap === 2 && highValue >= 6) {
    return 'suited_gapper';
  }

  if (suited) {
    return 'suited_junk';
  }

  return 'other';
}

export function getStackBucket(effectiveStackBb: number): StackBucket {
  if (effectiveStackBb <= 12) {
    return '<=12bb';
  }
  if (effectiveStackBb <= 25) {
    return '13-25bb';
  }
  if (effectiveStackBb <= 60) {
    return '26-60bb';
  }
  return '>60bb';
}
