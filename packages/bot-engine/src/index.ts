import { evaluateBestSevenCards } from '@aipoker/game-engine';
import type {
  BotAction,
  BotBettingState,
  BotDecisionContext,
  BotPersonality,
  BotPosition,
  Card,
  Rank,
} from '@aipoker/shared';

export type BotRng = () => number;
export type StackBucket = '<=12bb' | '13-25bb' | '26-60bb' | '>60bb';
export type PreflopScenario = 'unopened' | 'facing_open' | 'facing_3bet_plus';

type ActionIntent = 'fold' | 'call' | 'raise' | 'jam';
type HandClass = 'premium' | 'strong' | 'playable' | 'speculative' | 'marginal' | 'trash';
type HandDetail =
  | 'premium_pair'
  | 'small_pair'
  | 'suited_ace'
  | 'weak_offsuit_ace'
  | 'suited_broadway'
  | 'offsuit_broadway'
  | 'suited_king'
  | 'suited_connector'
  | 'suited_gapper'
  | 'suited_junk'
  | 'other';
type PreflopPosition = 'utg' | 'hj' | 'co' | 'btn' | 'sb' | 'bb';
type RankVector = ReadonlyArray<number | undefined>;
type BotActionWithoutThinking =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number }
  | { type: 'raise_to'; amount: number }
  | { type: 'all_in' };

interface PersonalityProfile {
  valueBetMinEquity: number;
  semiBluffMinEquity: number;
  callBuffer: number;
  cbetFreqDry: number;
  cbetFreqWet: number;
  barrelFreq: number;
  riverThinValueMinEquity: number;
  thinkingRange: [number, number];
}

export interface Mix {
  fold: number;
  call: number;
  raise: number;
  jam: number;
}

export interface ChooseBotActionOptions {
  preflopConsecutiveFolds?: number;
  isFirstPreflopDecision?: boolean;
}

interface PostflopFeatures {
  flushDraw: boolean;
  backdoorFlushDraw: boolean;
  oesd: boolean;
  gutshot: boolean;
  backdoorStraightDraw: boolean;
  twoOvercards: boolean;
  pairPlusDraw: boolean;
  boardPaired: boolean;
  boardMonotone: boolean;
  boardConnected: boolean;
}

export interface PostflopAnalysis {
  equity: number;
  madeHandRank: number;
  madeHandStrength: number;
  features: PostflopFeatures;
}

const PERSONALITY_PROFILES: Record<BotPersonality, PersonalityProfile> = {
  fish: {
    valueBetMinEquity: 0.72,
    semiBluffMinEquity: 0.58,
    callBuffer: -0.08,
    cbetFreqDry: 0.12,
    cbetFreqWet: 0.06,
    barrelFreq: 0.08,
    riverThinValueMinEquity: 0.78,
    thinkingRange: [900, 1700],
  },
  tag: {
    valueBetMinEquity: 0.62,
    semiBluffMinEquity: 0.54,
    callBuffer: 0.01,
    cbetFreqDry: 0.30,
    cbetFreqWet: 0.18,
    barrelFreq: 0.20,
    riverThinValueMinEquity: 0.68,
    thinkingRange: [1100, 2100],
  },
  lag: {
    valueBetMinEquity: 0.56,
    semiBluffMinEquity: 0.52,
    callBuffer: 0.0,
    cbetFreqDry: 0.56,
    cbetFreqWet: 0.34,
    barrelFreq: 0.31,
    riverThinValueMinEquity: 0.60,
    thinkingRange: [950, 1800],
  },
};

const RANKS_DESC: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
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

const MADE_HAND_STRENGTH: Record<number, number> = {
  0: 0.16,
  1: 0.38,
  2: 0.62,
  3: 0.75,
  4: 0.84,
  5: 0.88,
  6: 0.95,
  7: 0.985,
  8: 0.995,
};

const EARLY_MIXES = {
  unopened: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.15, 0.85),
        strong: mix(0.05, 0.1, 0.45, 0.4),
        playable: mix(0.30, 0.35, 0.35, 0.0),
        speculative: mix(0.55, 0.35, 0.10, 0.0),
        marginal: mix(0.78, 0.20, 0.02, 0.0),
        trash: mix(0.95, 0.05, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.25, 0.75),
        strong: mix(0.03, 0.12, 0.65, 0.2),
        playable: mix(0.22, 0.30, 0.48, 0.0),
        speculative: mix(0.58, 0.28, 0.14, 0.0),
        marginal: mix(0.82, 0.15, 0.03, 0.0),
        trash: mix(0.96, 0.04, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.8, 0.2),
        strong: mix(0.05, 0.15, 0.8, 0.0),
        playable: mix(0.24, 0.32, 0.44, 0.0),
        speculative: mix(0.66, 0.22, 0.12, 0.0),
        marginal: mix(0.86, 0.12, 0.02, 0.0),
        trash: mix(0.98, 0.02, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.9, 0.1),
        strong: mix(0.06, 0.18, 0.76, 0.0),
        playable: mix(0.28, 0.34, 0.38, 0.0),
        speculative: mix(0.72, 0.20, 0.08, 0.0),
        marginal: mix(0.9, 0.09, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.05, 0.95),
        strong: mix(0.04, 0.06, 0.3, 0.6),
        playable: mix(0.42, 0.18, 0.25, 0.15),
        speculative: mix(0.75, 0.2, 0.05, 0.0),
        marginal: mix(0.92, 0.08, 0.0, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.15, 0.85),
        strong: mix(0.02, 0.08, 0.68, 0.22),
        playable: mix(0.32, 0.18, 0.5, 0.0),
        speculative: mix(0.74, 0.16, 0.1, 0.0),
        marginal: mix(0.92, 0.07, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.88, 0.12),
        strong: mix(0.04, 0.10, 0.86, 0.0),
        playable: mix(0.38, 0.18, 0.44, 0.0),
        speculative: mix(0.8, 0.12, 0.08, 0.0),
        marginal: mix(0.94, 0.05, 0.01, 0.0),
        trash: mix(0.995, 0.005, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.92, 0.08),
        strong: mix(0.06, 0.12, 0.82, 0.0),
        playable: mix(0.44, 0.18, 0.38, 0.0),
        speculative: mix(0.84, 0.1, 0.06, 0.0),
        marginal: mix(0.96, 0.04, 0.0, 0.0),
        trash: mix(0.998, 0.002, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.1, 0.9),
        strong: mix(0.02, 0.08, 0.35, 0.55),
        playable: mix(0.18, 0.24, 0.34, 0.24),
        speculative: mix(0.46, 0.30, 0.18, 0.06),
        marginal: mix(0.68, 0.24, 0.08, 0.0),
        trash: mix(0.9, 0.1, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0, 0, 0.2, 0.8),
        strong: mix(0.02, 0.08, 0.72, 0.18),
        playable: mix(0.12, 0.24, 0.64, 0.0),
        speculative: mix(0.34, 0.3, 0.36, 0.0),
        marginal: mix(0.6, 0.28, 0.12, 0.0),
        trash: mix(0.82, 0.14, 0.04, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0, 0, 0.88, 0.12),
        strong: mix(0.02, 0.08, 0.9, 0.0),
        playable: mix(0.08, 0.20, 0.72, 0.0),
        speculative: mix(0.22, 0.28, 0.50, 0.0),
        marginal: mix(0.5, 0.28, 0.22, 0.0),
        trash: mix(0.76, 0.16, 0.08, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0, 0, 0.9, 0.1),
        strong: mix(0.03, 0.09, 0.88, 0.0),
        playable: mix(0.1, 0.22, 0.68, 0.0),
        speculative: mix(0.18, 0.30, 0.52, 0.0),
        marginal: mix(0.42, 0.30, 0.28, 0.0),
        trash: mix(0.68, 0.20, 0.12, 0.0),
      }),
    },
  },
  facing_open: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0, 0, 0.2, 0.8),
        strong: mix(0.08, 0.14, 0.28, 0.5),
        playable: mix(0.35, 0.45, 0.1, 0.1),
        speculative: mix(0.6, 0.35, 0.05, 0.0),
        marginal: mix(0.85, 0.15, 0.0, 0.0),
        trash: mix(0.96, 0.04, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.3, 0.7),
        strong: mix(0.08, 0.2, 0.52, 0.2),
        playable: mix(0.34, 0.5, 0.16, 0.0),
        speculative: mix(0.66, 0.28, 0.06, 0.0),
        marginal: mix(0.88, 0.1, 0.02, 0.0),
        trash: mix(0.97, 0.03, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.08, 0.26, 0.66, 0.0),
        playable: mix(0.4, 0.46, 0.14, 0.0),
        speculative: mix(0.74, 0.2, 0.06, 0.0),
        marginal: mix(0.9, 0.08, 0.02, 0.0),
        trash: mix(0.98, 0.02, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.1, 0.28, 0.62, 0.0),
        playable: mix(0.46, 0.44, 0.1, 0.0),
        speculative: mix(0.8, 0.16, 0.04, 0.0),
        marginal: mix(0.93, 0.06, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.05, 0.95),
        strong: mix(0.12, 0.08, 0.18, 0.62),
        playable: mix(0.58, 0.22, 0.12, 0.08),
        speculative: mix(0.88, 0.12, 0.0, 0.0),
        marginal: mix(0.97, 0.03, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.24, 0.76),
        strong: mix(0.14, 0.16, 0.54, 0.16),
        playable: mix(0.58, 0.26, 0.16, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.98, 0.02, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.14, 0.22, 0.64, 0.0),
        playable: mix(0.66, 0.22, 0.12, 0.0),
        speculative: mix(0.94, 0.05, 0.01, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.92, 0.08),
        strong: mix(0.16, 0.24, 0.6, 0.0),
        playable: mix(0.72, 0.18, 0.1, 0.0),
        speculative: mix(0.96, 0.04, 0.0, 0.0),
        marginal: mix(0.995, 0.005, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.08, 0.92),
        strong: mix(0.08, 0.12, 0.24, 0.56),
        playable: mix(0.32, 0.34, 0.18, 0.16),
        speculative: mix(0.56, 0.34, 0.1, 0.0),
        marginal: mix(0.78, 0.2, 0.02, 0.0),
        trash: mix(0.94, 0.06, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.24, 0.76),
        strong: mix(0.04, 0.14, 0.66, 0.16),
        playable: mix(0.22, 0.34, 0.44, 0.0),
        speculative: mix(0.46, 0.34, 0.2, 0.0),
        marginal: mix(0.72, 0.2, 0.08, 0.0),
        trash: mix(0.9, 0.08, 0.02, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.06, 0.16, 0.78, 0.0),
        playable: mix(0.2, 0.32, 0.48, 0.0),
        speculative: mix(0.36, 0.34, 0.3, 0.0),
        marginal: mix(0.62, 0.22, 0.16, 0.0),
        trash: mix(0.84, 0.1, 0.06, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.06, 0.18, 0.76, 0.0),
        playable: mix(0.24, 0.34, 0.42, 0.0),
        speculative: mix(0.32, 0.36, 0.32, 0.0),
        marginal: mix(0.52, 0.24, 0.24, 0.0),
        trash: mix(0.76, 0.14, 0.1, 0.0),
      }),
    },
  },
  facing_3bet_plus: {
    fish: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.14, 0.12, 0.0, 0.74),
        playable: mix(0.72, 0.18, 0.0, 0.1),
        speculative: mix(0.94, 0.06, 0.0, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.18, 0.82),
        strong: mix(0.18, 0.26, 0.16, 0.4),
        playable: mix(0.76, 0.18, 0.06, 0.0),
        speculative: mix(0.95, 0.05, 0.0, 0.0),
        marginal: mix(0.99, 0.01, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.78, 0.22),
        strong: mix(0.22, 0.44, 0.34, 0.0),
        playable: mix(0.82, 0.16, 0.02, 0.0),
        speculative: mix(0.97, 0.03, 0.0, 0.0),
        marginal: mix(0.995, 0.005, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.28, 0.48, 0.24, 0.0),
        playable: mix(0.88, 0.1, 0.02, 0.0),
        speculative: mix(0.98, 0.02, 0.0, 0.0),
        marginal: mix(0.998, 0.002, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    tag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.24, 0.06, 0.0, 0.7),
        playable: mix(0.88, 0.08, 0.0, 0.04),
        speculative: mix(0.99, 0.01, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.14, 0.86),
        strong: mix(0.28, 0.18, 0.24, 0.3),
        playable: mix(0.92, 0.06, 0.02, 0.0),
        speculative: mix(0.99, 0.01, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.88, 0.12),
        strong: mix(0.38, 0.4, 0.22, 0.0),
        playable: mix(0.96, 0.04, 0.0, 0.0),
        speculative: mix(1.0, 0.0, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.9, 0.1),
        strong: mix(0.42, 0.4, 0.18, 0.0),
        playable: mix(0.98, 0.02, 0.0, 0.0),
        speculative: mix(1.0, 0.0, 0.0, 0.0),
        marginal: mix(1.0, 0.0, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
    },
    lag: {
      '<=12bb': byClass({
        premium: mix(0.0, 0.0, 0.0, 1.0),
        strong: mix(0.12, 0.06, 0.0, 0.82),
        playable: mix(0.6, 0.2, 0.0, 0.2),
        speculative: mix(0.92, 0.08, 0.0, 0.0),
        marginal: mix(0.98, 0.02, 0.0, 0.0),
        trash: mix(1.0, 0.0, 0.0, 0.0),
      }),
      '13-25bb': byClass({
        premium: mix(0.0, 0.0, 0.12, 0.88),
        strong: mix(0.12, 0.14, 0.44, 0.3),
        playable: mix(0.62, 0.22, 0.16, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.97, 0.03, 0.0, 0.0),
        trash: mix(0.995, 0.005, 0.0, 0.0),
      }),
      '26-60bb': byClass({
        premium: mix(0.0, 0.0, 0.82, 0.18),
        strong: mix(0.18, 0.3, 0.52, 0.0),
        playable: mix(0.72, 0.18, 0.1, 0.0),
        speculative: mix(0.9, 0.08, 0.02, 0.0),
        marginal: mix(0.96, 0.03, 0.01, 0.0),
        trash: mix(0.99, 0.01, 0.0, 0.0),
      }),
      '>60bb': byClass({
        premium: mix(0.0, 0.0, 0.84, 0.16),
        strong: mix(0.2, 0.32, 0.48, 0.0),
        playable: mix(0.74, 0.18, 0.08, 0.0),
        speculative: mix(0.86, 0.1, 0.04, 0.0),
        marginal: mix(0.94, 0.04, 0.02, 0.0),
        trash: mix(0.985, 0.01, 0.005, 0.0),
      }),
    },
  },
} satisfies Record<
  PreflopScenario,
  Record<BotPersonality, Record<StackBucket, Record<HandClass, Mix>>>
>;

function byClass(input: Record<HandClass, Mix>): Record<HandClass, Mix> {
  return input;
}

function mix(fold: number, call: number, raise: number, jam: number): Mix {
  const total = fold + call + raise + jam;
  const rounded = Math.round(total * 1_000_000);
  if (rounded !== 1_000_000) {
    throw new Error(`Invalid mix total ${total}`);
  }
  return { fold, call, raise, jam };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rankValue(cardOrRank: Card | Rank): number {
  const rank = cardOrRank[0] as Rank;
  return RANK_VALUE[rank];
}

function compareRankVectors(left: RankVector, right: RankVector): number {
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

function getPreflopTablePosition(position: BotPosition, activePlayerCount: number): PreflopPosition {
  if (activePlayerCount === 2 && position === 'btn') {
    return 'sb';
  }
  return position;
}

function normalizePreflopScenario(state: BotBettingState): PreflopScenario {
  if (state === 'facing_3bet_plus') {
    return 'facing_3bet_plus';
  }
  if (state === 'facing_open' || state === 'facing_raise') {
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

function classifyHand(key: string): HandClass {
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

function getHandDetail(key: string): HandDetail {
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

export function getPreflopMix(
  personality: BotPersonality,
  effectiveStackBb: number,
  bettingState: BotBettingState,
  position: BotPosition,
  holeCards: readonly Card[],
  activePlayerCount = 6,
): Mix {
  const stackBucket = getStackBucket(effectiveStackBb);
  const scenario = normalizePreflopScenario(bettingState);
  const preflopPosition = getPreflopTablePosition(position, activePlayerCount);
  const canonicalKey = canonicalizeHoleCards(holeCards);
  const handClass = classifyHand(canonicalKey);
  const baseMix = PRELOP_MIXES[scenario][personality][stackBucket][preflopPosition][handClass];
  const detailAdjusted = adjustPreflopMixForHandDetail(baseMix, {
    detail: getHandDetail(canonicalKey),
    personality,
    scenario,
    position: preflopPosition,
  });
  return rebalancePreflopMixForPersonality(detailAdjusted, {
    personality,
    scenario,
    position: preflopPosition,
    handClass,
    stackBucket,
  });
}

const PRELOP_MIXES = buildPreflopMixes();

function buildPreflopMixes(): Record<
  PreflopScenario,
  Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>
> {
  const result = {
    unopened: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
    facing_open: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
    facing_3bet_plus: {} as Record<BotPersonality, Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>>,
  };

  const scenarios: PreflopScenario[] = ['unopened', 'facing_open', 'facing_3bet_plus'];
  const personalities: BotPersonality[] = ['fish', 'tag', 'lag'];
  const stackBuckets: StackBucket[] = ['<=12bb', '13-25bb', '26-60bb', '>60bb'];

  for (const scenario of scenarios) {
    for (const personality of personalities) {
      result[scenario][personality] = {} as Record<StackBucket, Record<PreflopPosition, Record<HandClass, Mix>>>;
      for (const stackBucket of stackBuckets) {
        const baseMixes = EARLY_MIXES[scenario][personality][stackBucket];
        result[scenario][personality][stackBucket] = {
          utg: baseMixes,
          hj: tweakForPosition(baseMixes, scenario, 'hj'),
          co: tweakForPosition(baseMixes, scenario, 'co'),
          btn: tweakForPosition(baseMixes, scenario, 'btn'),
          sb: tweakForPosition(baseMixes, scenario, 'sb'),
          bb: tweakForPosition(baseMixes, scenario, 'bb'),
        };
      }
    }
  }

  return result;
}

function tweakForPosition(
  base: Record<HandClass, Mix>,
  scenario: PreflopScenario,
  position: PreflopPosition
): Record<HandClass, Mix> {
  const adjusted: Record<HandClass, Mix> = {
    premium: base.premium,
    strong: base.strong,
    playable: base.playable,
    speculative: base.speculative,
    marginal: base.marginal,
    trash: base.trash,
  };

  if (position === 'hj') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.04, call: 0.01, raise: 0.03 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.06, call: 0.02, raise: 0.04 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.08, call: 0.04, raise: 0.04 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.02, call: 0.01, raise: 0.01 });
  }

  if (position === 'co') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.10, call: 0.03, raise: 0.07 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.14, call: 0.05, raise: 0.09 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.18, call: 0.08, raise: 0.10 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.10, call: 0.06, raise: 0.04 });
  }

  if (position === 'btn') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.14, call: 0.04, raise: 0.10 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.18, call: 0.06, raise: 0.12 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.22, call: 0.10, raise: 0.12 });
    adjusted.trash = nudgeMix(base.trash, { fold: -0.12, call: 0.07, raise: 0.05 });
  }

  if (position === 'sb') {
    if (scenario === 'unopened') {
      adjusted.playable = nudgeMix(base.playable, { fold: -0.05, call: -0.1, raise: 0.15 });
      adjusted.speculative = nudgeMix(base.speculative, { fold: -0.08, call: -0.06, raise: 0.14 });
      adjusted.marginal = nudgeMix(base.marginal, { fold: -0.1, call: -0.02, raise: 0.12 });
    } else {
      adjusted.playable = nudgeMix(base.playable, { fold: -0.04, call: 0.0, raise: 0.04 });
      adjusted.speculative = nudgeMix(base.speculative, { fold: -0.02, call: 0.02, raise: 0.0 });
    }
  }

  if (position === 'bb') {
    adjusted.playable = nudgeMix(base.playable, { fold: -0.08, call: 0.08, raise: 0.0 });
    adjusted.speculative = nudgeMix(base.speculative, { fold: -0.12, call: 0.12, raise: 0.0 });
    adjusted.marginal = nudgeMix(base.marginal, { fold: -0.06, call: 0.06, raise: 0.0 });
  }

  return adjusted;
}

function nudgeMix(
  value: Mix,
  delta: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>>
): Mix {
  const next = {
    fold: value.fold + (delta.fold ?? 0),
    call: value.call + (delta.call ?? 0),
    raise: value.raise + (delta.raise ?? 0),
    jam: value.jam + (delta.jam ?? 0),
  };
  const normalized = normalizeMix(next);
  return mix(normalized.fold, normalized.call, normalized.raise, normalized.jam);
}

function normalizeMix(value: Mix): Mix {
  const clamped = {
    fold: Math.max(0, value.fold),
    call: Math.max(0, value.call),
    raise: Math.max(0, value.raise),
    jam: Math.max(0, value.jam),
  };
  const total = clamped.fold + clamped.call + clamped.raise + clamped.jam;
  if (total === 0) {
    return { fold: 1, call: 0, raise: 0, jam: 0 };
  }
  return {
    fold: clamped.fold / total,
    call: clamped.call / total,
    raise: clamped.raise / total,
    jam: clamped.jam / total,
  };
}

function scaleMixDelta(
  delta: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>>,
  factor: number
): Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>> {
  const scaled: Partial<Record<'fold' | 'call' | 'raise' | 'jam', number>> = {};
  if (delta.fold !== undefined) {
    scaled.fold = delta.fold * factor;
  }
  if (delta.call !== undefined) {
    scaled.call = delta.call * factor;
  }
  if (delta.raise !== undefined) {
    scaled.raise = delta.raise * factor;
  }
  if (delta.jam !== undefined) {
    scaled.jam = delta.jam * factor;
  }
  return scaled;
}

function adjustPreflopMixForHandDetail(
  base: Mix,
  input: {
    detail: HandDetail;
    personality: BotPersonality;
    scenario: PreflopScenario;
    position: PreflopPosition;
  }
): Mix {
  let adjusted = base;
  const lateOpenPosition = input.position === 'co' || input.position === 'btn';

  if (input.scenario === 'unopened' && lateOpenPosition) {
    if (input.detail === 'weak_offsuit_ace') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.24, call: 0.03, raise: 0.21 }
          : input.personality === 'fish'
            ? { fold: -0.10, call: 0.06, raise: 0.04 }
            : { fold: -0.18, call: 0.05, raise: 0.13 },
      );
    }

    if (
      input.detail === 'suited_king'
      || input.detail === 'suited_connector'
      || input.detail === 'suited_gapper'
      || input.detail === 'small_pair'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.10, call: 0.03, raise: 0.07 }
          : input.personality === 'fish'
            ? { fold: -0.08, call: 0.06, raise: 0.02 }
            : { fold: -0.05, call: 0.02, raise: 0.03 },
      );
    }
  }

  if (input.scenario === 'unopened' && input.position === 'sb') {
    if (input.detail === 'weak_offsuit_ace' || input.detail === 'suited_king' || input.detail === 'suited_junk') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? input.detail === 'weak_offsuit_ace'
            ? { fold: -0.18, call: -0.02, raise: 0.20 }
            : { fold: -0.10, call: -0.02, raise: 0.12 }
          : { fold: -0.06, call: 0.0, raise: 0.06 },
      );
    }
  }

  if (input.scenario === 'facing_open' && input.position === 'bb') {
    if (input.detail === 'suited_king') {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'tag'
          ? { fold: -0.20, call: 0.17, raise: 0.03 }
          : input.personality === 'lag'
            ? { fold: -0.18, call: 0.10, raise: 0.08 }
            : { fold: -0.20, call: 0.18, raise: 0.02 },
      );
    }

    if (
      input.detail === 'suited_ace'
      || input.detail === 'small_pair'
      || input.detail === 'offsuit_broadway'
    ) {
      adjusted = nudgeMix(
        adjusted,
        input.personality === 'lag'
          ? { fold: -0.10, call: 0.06, raise: 0.04 }
          : { fold: -0.08, call: 0.07, raise: 0.01 },
      );
    }
  }

  if (
    input.scenario === 'facing_open'
    && (input.position === 'co' || input.position === 'btn')
    && input.personality === 'lag'
    && (
      input.detail === 'suited_connector'
      || input.detail === 'suited_gapper'
      || input.detail === 'suited_broadway'
    )
  ) {
    adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.03, raise: 0.05 });
  }

  return adjusted;
}

function rebalancePreflopMixForPersonality(
  base: Mix,
  input: {
    personality: BotPersonality;
    scenario: PreflopScenario;
    position: PreflopPosition;
    handClass: HandClass;
    stackBucket: StackBucket;
  }
): Mix {
  let adjusted = base;
  const latePosition = input.position === 'co' || input.position === 'btn' || input.position === 'sb';
  const blindPosition = input.position === 'sb' || input.position === 'bb';

  if (input.personality === 'fish') {
    if (input.scenario === 'unopened') {
      if (latePosition) {
        if (input.handClass === 'playable' || input.handClass === 'speculative') {
          adjusted = nudgeMix(adjusted, { fold: -0.22, call: 0.08, raise: 0.14 });
        }
        if (input.handClass === 'marginal') {
          adjusted = nudgeMix(adjusted, { fold: -0.30, call: 0.16, raise: 0.14 });
        }
        if (input.handClass === 'trash') {
          adjusted = nudgeMix(adjusted, { fold: -0.20, call: 0.13, raise: 0.07 });
        }
      } else if (input.handClass === 'speculative' || input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.09, raise: -0.01 });
      }

      if (input.position === 'sb' && (input.handClass === 'speculative' || input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.02, raise: 0.06 });
      }
    }

    if (input.scenario === 'facing_open') {
      if (input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { call: 0.24, raise: -0.18, jam: -0.06 });
      }
      if (input.handClass === 'playable' || input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.24, call: 0.30, raise: -0.02, jam: -0.04 });
      }
      if (input.handClass === 'marginal' && (latePosition || blindPosition)) {
        adjusted = nudgeMix(adjusted, { fold: -0.28, call: 0.30, raise: -0.02 });
      }
      if (input.position === 'bb' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.08 });
      }
      if (input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.12 });
      }
    }

    if (input.scenario === 'facing_3bet_plus') {
      if (input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { call: 0.08, raise: -0.03, jam: -0.05 });
      }
      if (latePosition && input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.05, call: 0.07, raise: -0.02 });
      }
    }
  }

  if (input.personality === 'tag') {
    if (input.scenario === 'unopened') {
      if (latePosition && input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.14, call: 0.01, raise: 0.13 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.30, call: 0.04, raise: 0.26 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.38, call: 0.08, raise: 0.30 });
      }
      if (input.position === 'btn' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: -0.02, raise: 0.12 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.01, raise: 0.11 });
      }
      if (input.position === 'sb' && (input.handClass === 'playable' || input.handClass === 'speculative')) {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: -0.02, raise: 0.14 });
      }
      if (input.position === 'sb' && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.20, call: -0.02, raise: 0.22 });
      }
      if (blindPosition && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.02, raise: 0.04 });
      }
    }

    if (input.scenario === 'facing_open' && (input.position === 'bb' || input.position === 'btn' || input.position === 'co')) {
      if (input.handClass === 'playable' || input.handClass === 'strong') {
        adjusted = nudgeMix(adjusted, { fold: -0.12, call: 0.06, raise: 0.06 });
      }
      if (input.handClass === 'speculative' && input.position === 'bb') {
        adjusted = nudgeMix(adjusted, { fold: -0.34, call: 0.18, raise: 0.16 });
      }
      if (input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.18, call: 0.10, raise: 0.08 });
      }
      if ((input.position === 'co' || input.position === 'btn') && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.05, raise: 0.01 });
      }
      if (input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.06 });
      }
    }
  }

  if (input.personality === 'lag') {
    const deepStack = input.stackBucket === '>60bb';
    const mediumDeepStack = input.stackBucket === '26-60bb';

    if (input.scenario === 'unopened' && latePosition) {
      if (deepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.02, raise: 0.08 });
      }
      if (mediumDeepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.06, call: 0.02, raise: 0.04 });
      }
      if ((deepStack || mediumDeepStack) && input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.18, call: 0.0, raise: 0.18 });
      }
      if (deepStack && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.20, raise: -0.10 });
      }
      if (mediumDeepStack && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.14, raise: -0.06 });
      }
      if (input.position === 'sb' && (deepStack || mediumDeepStack) && (input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { fold: -0.08, raise: 0.08 });
      }
      if (input.position === 'btn' && (input.handClass === 'marginal' || input.handClass === 'trash')) {
        adjusted = nudgeMix(adjusted, { call: -0.04, raise: 0.04 });
      }
    }

    if (input.scenario === 'facing_open' && (input.position === 'co' || input.position === 'btn' || input.position === 'bb')) {
      if (input.handClass === 'playable') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.04, raise: 0.04 });
      }
      if (input.handClass === 'marginal') {
        adjusted = nudgeMix(adjusted, { fold: -0.10, call: 0.05, raise: 0.05 });
      }
      if (deepStack && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: -0.02, call: 0.01, raise: 0.01 });
      }
      if (deepStack && input.position === 'bb' && input.handClass === 'trash') {
        adjusted = nudgeMix(adjusted, { fold: 0.06, call: -0.02, raise: -0.04 });
      }
      if ((deepStack || mediumDeepStack) && input.handClass === 'speculative') {
        adjusted = nudgeMix(adjusted, { fold: -0.08, call: 0.05, raise: 0.03 });
      }
    }
  }

  return adjusted;
}

function calcThinkingDelay(rng: BotRng, personality: BotPersonality): number {
  const [minimum, maximum] = PERSONALITY_PROFILES[personality].thinkingRange;
  return Math.floor(minimum + rng() * (maximum - minimum));
}

function sampleIntent(mixValue: Mix, rng: BotRng): ActionIntent {
  const roll = rng();
  if (roll < mixValue.fold) {
    return 'fold';
  }
  if (roll < mixValue.fold + mixValue.call) {
    return 'call';
  }
  if (roll < mixValue.fold + mixValue.call + mixValue.raise) {
    return 'raise';
  }
  return 'jam';
}

function estimateBigBlind(context: BotDecisionContext): number {
  if (context.effectiveStackBb > 0) {
    return Math.max(1, Math.round(context.effectiveStack / context.effectiveStackBb));
  }
  if (context.phase === 'preflop' && context.minRaiseTo > 0) {
    return Math.max(1, Math.round(context.minRaiseTo / 2));
  }
  return Math.max(1, Math.round(context.potTotal / 2 || 1));
}

function resolvePassiveAction(context: BotDecisionContext): BotActionWithoutThinking {
  if (context.canCheck) {
    return { type: 'check' };
  }
  if (context.canFold) {
    return { type: 'fold' };
  }
  return { type: 'check' };
}

function finalizeAggressiveAction(
  context: BotDecisionContext,
  targetTo: number
): BotActionWithoutThinking {
  if (context.canRaise) {
    const amount = Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, targetTo));
    if (context.canAllIn && amount >= context.maxRaiseTo) {
      return { type: 'all_in' };
    }
    return { type: 'raise_to', amount };
  }

  if (context.canCall) {
    return { type: 'call', amount: context.callAmount };
  }

  return resolvePassiveAction(context);
}

function finalizeIntent(
  context: BotDecisionContext,
  intent: ActionIntent,
  targetTo: number
): BotActionWithoutThinking {
  if (intent === 'jam') {
    if (context.canAllIn) {
      return { type: 'all_in' };
    }
    if (context.canRaise) {
      return finalizeAggressiveAction(context, context.maxRaiseTo);
    }
    if (context.canCall) {
      return { type: 'call', amount: context.callAmount };
    }
    return resolvePassiveAction(context);
  }

  if (intent === 'raise') {
    return finalizeAggressiveAction(context, targetTo);
  }

  if (intent === 'call') {
    if (context.canCall) {
      return { type: 'call', amount: context.callAmount };
    }
    return resolvePassiveAction(context);
  }

  return resolvePassiveAction(context);
}

function isLikelyInPosition(position: BotPosition): boolean {
  return position === 'btn' || position === 'co' || position === 'hj';
}

function getPreflopRaiseTo(context: BotDecisionContext): number {
  const bigBlind = estimateBigBlind(context);
  const stackBucket = getStackBucket(context.effectiveStackBb);
  const preflopPosition = getPreflopTablePosition(context.position, context.activePlayerCount);
  if (stackBucket === '<=12bb') {
    return context.maxRaiseTo;
  }

  if (normalizePreflopScenario(context.bettingState) === 'unopened') {
    const openSizeBb = preflopPosition === 'sb' ? 3.0 : (preflopPosition === 'co' || preflopPosition === 'btn' ? 2.2 : 2.5);
    return Math.round(openSizeBb * bigBlind);
  }

  if (normalizePreflopScenario(context.bettingState) === 'facing_3bet_plus') {
    const multiplier = isLikelyInPosition(context.position) ? 2.2 : 2.5;
    return Math.round(context.minRaiseTo * multiplier);
  }

  const multiplier = isLikelyInPosition(context.position) ? 2.0 : 2.5;
  return Math.round(context.minRaiseTo * multiplier);
}

function computePotOdds(context: BotDecisionContext): number {
  if (!context.canCall || context.callAmount <= 0) {
    return 0;
  }
  return context.callAmount / Math.max(1, context.potTotal + context.callAmount);
}

function remainingDeck(usedCards: readonly Card[]): Card[] {
  const used = new Set(usedCards);
  return FULL_DECK.filter((card) => !used.has(card));
}

function sampleWithoutReplacement(deck: Card[], count: number, rng: BotRng): Card[] {
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

function detectStraightState(cards: readonly Card[]): { hasStraight: boolean; oesd: boolean; gutshot: boolean } {
  const rankSet = new Set<number>(cards.map((card) => rankValue(card)));
  if (rankSet.has(14)) {
    rankSet.add(1);
  }

  let hasStraight = false;
  let oesd = false;
  let gutshot = false;
  for (let start = 1; start <= 10; start += 1) {
    const window = [start, start + 1, start + 2, start + 3, start + 4];
    const present = window.filter((value) => rankSet.has(value));
    if (present.length === 5) {
      hasStraight = true;
      continue;
    }
    if (present.length !== 4) {
      continue;
    }
    const missing = window.find((value) => !rankSet.has(value));
    if (missing === start || missing === start + 4) {
      oesd = true;
    } else {
      gutshot = true;
    }
  }

  if (hasStraight) {
    return { hasStraight: true, oesd: false, gutshot: false };
  }

  return { hasStraight, oesd, gutshot };
}

function hasBackdoorStraightPotential(cards: readonly Card[]): boolean {
  const rankSet = new Set<number>(cards.map((card) => rankValue(card)));
  if (rankSet.has(14)) {
    rankSet.add(1);
  }

  for (let start = 1; start <= 11; start += 1) {
    let present = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      if (rankSet.has(start + offset)) {
        present += 1;
      }
    }
    if (present >= 3) {
      return true;
    }
  }

  return false;
}

function buildPostflopFeatures(context: BotDecisionContext, madeHandRank: number): PostflopFeatures {
  const allCards = [...context.holeCards, ...context.communityCards];
  const suitCounts = new Map<string, number>();
  for (const card of allCards) {
    const suit = card[1];
    if (!suit) {
      continue;
    }
    suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
  }

  const boardRankCounts = new Map<number, number>();
  const boardSuitCounts = new Map<string, number>();
  for (const card of context.communityCards) {
    const rank = rankValue(card);
    boardRankCounts.set(rank, (boardRankCounts.get(rank) ?? 0) + 1);
    const suit = card[1];
    if (!suit) {
      continue;
    }
    boardSuitCounts.set(suit, (boardSuitCounts.get(suit) ?? 0) + 1);
  }

  const straightState = detectStraightState(allCards);
  const flushDraw = madeHandRank < 5 && [...suitCounts.values()].some((count) => count === 4);
  const backdoorFlushDraw =
    madeHandRank < 5
    && !flushDraw
    && context.communityCards.length === 3
    && [...suitCounts.values()].some((count) => count === 3);
  const boardValues = [...boardRankCounts.keys()].sort((left, right) => left - right);
  const boardSpan = boardValues.length > 0 ? (boardValues.at(-1)! - boardValues[0]!) : 0;
  const boardConnected = context.communityCards.length >= 3 && (boardSpan <= 4 || detectStraightState(context.communityCards).oesd);
  const boardHigh = boardValues.at(-1) ?? 0;
  const holeValues = context.holeCards.map((card) => rankValue(card));
  const twoOvercards = madeHandRank === 0 && holeValues.filter((value) => value > boardHigh).length === 2;
  const backdoorStraightDraw =
    context.communityCards.length === 3
    && !straightState.hasStraight
    && !straightState.oesd
    && !straightState.gutshot
    && hasBackdoorStraightPotential(allCards);

  return {
    flushDraw,
    backdoorFlushDraw,
    oesd: straightState.oesd,
    gutshot: straightState.gutshot,
    backdoorStraightDraw,
    twoOvercards,
    pairPlusDraw: madeHandRank >= 1 && (flushDraw || straightState.oesd || straightState.gutshot),
    boardPaired: [...boardRankCounts.values()].some((count) => count >= 2),
    boardMonotone: context.communityCards.length >= 3 && [...boardSuitCounts.values()].some((count) => count === context.communityCards.length),
    boardConnected,
  };
}

function simulateShowdownEquity(
  context: BotDecisionContext,
  rng: BotRng,
  iterations: number
): number {
  const deadCards = [...context.holeCards, ...context.communityCards];
  const baseDeck = remainingDeck(deadCards);
  const cardsNeeded = (5 - context.communityCards.length) + context.opponentCount * 2;
  if (baseDeck.length < cardsNeeded || iterations <= 0) {
    return 0;
  }

  let equity = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = sampleWithoutReplacement(baseDeck, cardsNeeded, rng);
    let cursor = 0;
    const opponents: Card[][] = [];
    for (let opponent = 0; opponent < context.opponentCount; opponent += 1) {
      const holeCards = sampled.slice(cursor, cursor + 2);
      cursor += 2;
      if (holeCards.length < 2) {
        return equity / Math.max(1, iteration + 1);
      }
      opponents.push(holeCards);
    }

    const runout = sampled.slice(cursor, cursor + (5 - context.communityCards.length));
    const board = [...context.communityCards, ...runout];
    const heroRank = evaluateBestSevenCards([...context.holeCards, ...board]).rank;
    const opponentRanks = opponents.map((holeCards) => evaluateBestSevenCards([...holeCards, ...board]).rank);
    let bestRank = heroRank;
    let winnerCount = 1;
    let heroBest = true;

    for (const opponentRank of opponentRanks) {
      const comparison = compareRankVectors(opponentRank, bestRank);
      if (comparison > 0) {
        bestRank = opponentRank;
        winnerCount = 1;
        heroBest = false;
      } else if (comparison === 0) {
        winnerCount += 1;
      }
    }

    if (heroBest && compareRankVectors(heroRank, bestRank) === 0) {
      equity += 1 / winnerCount;
    }
  }

  return equity / iterations;
}

export function analyzePostflop(context: BotDecisionContext, rng: BotRng): PostflopAnalysis {
  const evaluated = evaluateBestSevenCards([...context.holeCards, ...context.communityCards]);
  const madeHandRank = evaluated.rank[0] ?? 0;
  const features = buildPostflopFeatures(context, madeHandRank);
  const shouldSimulate =
    (context.phase === 'flop' || context.phase === 'turn')
    && context.opponentCount > 0
    && (context.canCall || context.canRaise);
  const iterations = context.phase === 'flop' ? 128 : context.phase === 'turn' ? 96 : 0;
  const simulatedEquity = shouldSimulate ? simulateShowdownEquity(context, rng, iterations) : 0;
  const baseStrength = MADE_HAND_STRENGTH[madeHandRank] ?? 0.2;
  const drawBonus = (features.flushDraw ? 0.07 : 0) + (features.oesd ? 0.06 : 0) + (features.gutshot ? 0.03 : 0);
  const heuristicEquity = clamp01(baseStrength + drawBonus - (context.opponentCount - 1) * 0.05);
  const equity = shouldSimulate ? simulatedEquity : heuristicEquity;

  return {
    equity: clamp01(equity),
    madeHandRank,
    madeHandStrength: baseStrength,
    features,
  };
}

function selectPostflopSizeFraction(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile
): number {
  const boardWet = analysis.features.boardConnected || analysis.features.boardMonotone || analysis.features.boardPaired;
  if (context.spr <= 1 || analysis.equity >= 0.85) {
    return 1.0;
  }
  if (boardWet || context.opponentCount > 1 || analysis.features.flushDraw || analysis.features.oesd) {
    return 0.66;
  }
  if (context.isPreflopAggressor && analysis.equity >= profile.semiBluffMinEquity) {
    return 0.33;
  }
  return 0.33;
}

function getPostflopRaiseTo(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile
): number {
  const sizeFraction = selectPostflopSizeFraction(context, analysis, profile);
  const targetTo = context.callAmount + Math.round(context.potTotal * sizeFraction);
  return Math.max(context.minRaiseTo, targetTo);
}

function shouldJamPostflop(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile
): boolean {
  if (!context.canAllIn) {
    return false;
  }
  if (context.effectiveStackBb <= 12 || context.spr <= 1) {
    return analysis.equity >= profile.semiBluffMinEquity;
  }
  return analysis.equity >= 0.9;
}

function isSmallPostflopBet(context: BotDecisionContext): boolean {
  if (!context.canCall || context.callAmount <= 0) {
    return false;
  }

  return context.callAmount <= Math.max(1, Math.round(context.potTotal * 0.4));
}

function shouldFloatSmallBet(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  personality: BotPersonality
): boolean {
  if (
    personality !== 'lag'
    || context.phase !== 'flop'
    || context.opponentCount !== 1
    || !context.canCall
    || !isLikelyInPosition(context.position)
    || !isSmallPostflopBet(context)
  ) {
    return false;
  }

  const floatSignals = [
    analysis.features.twoOvercards,
    analysis.features.backdoorFlushDraw,
    analysis.features.backdoorStraightDraw,
  ].filter(Boolean).length;

  return floatSignals >= 2;
}

function applyPreflopAntiStreakAdjustment(
  base: Mix,
  input: {
    personality: BotPersonality;
    scenario: PreflopScenario;
    position: PreflopPosition;
    handClass: HandClass;
    preflopConsecutiveFolds: number;
  }
): Mix {
  if (input.preflopConsecutiveFolds < 2) {
    return base;
  }

  const eligibleHandClass = input.handClass === 'playable' || input.handClass === 'speculative' || input.handClass === 'marginal';
  if (!eligibleHandClass) {
    return base;
  }

  const factor = input.preflopConsecutiveFolds >= 4 ? 1.35 : input.preflopConsecutiveFolds >= 3 ? 1 : 0.7;

  if (input.scenario === 'unopened' && (input.position === 'co' || input.position === 'btn' || input.position === 'sb')) {
    const delta = input.personality === 'fish'
      ? { fold: -0.12, call: 0.10, raise: 0.02 }
      : input.personality === 'lag'
        ? { fold: -0.10, call: 0.04, raise: 0.06 }
        : { fold: -0.14, call: 0.06, raise: 0.08 };
    return nudgeMix(base, scaleMixDelta(delta, factor));
  }

  if (input.scenario === 'facing_open' && (input.position === 'bb' || input.position === 'co' || input.position === 'btn')) {
    const delta = input.personality === 'fish'
      ? { fold: -0.14, call: 0.12, raise: 0.02 }
      : input.personality === 'lag'
        ? { fold: -0.12, call: 0.06, raise: 0.06 }
        : { fold: -0.16, call: 0.10, raise: 0.06 };
    return nudgeMix(base, scaleMixDelta(delta, factor));
  }

  return base;
}

function decidePreflop(
  context: BotDecisionContext,
  personality: BotPersonality,
  rng: BotRng,
  options: ChooseBotActionOptions,
): BotActionWithoutThinking {
  const scenario = normalizePreflopScenario(context.bettingState);
  const position = getPreflopTablePosition(context.position, context.activePlayerCount);
  const handClass = classifyHand(canonicalizeHoleCards(context.holeCards));
  let mixValue = getPreflopMix(
    personality,
    context.effectiveStackBb,
    context.bettingState,
    context.position,
    context.holeCards,
    context.activePlayerCount,
  );
  if (options.isFirstPreflopDecision) {
    mixValue = applyPreflopAntiStreakAdjustment(mixValue, {
      personality,
      scenario,
      position,
      handClass,
      preflopConsecutiveFolds: options.preflopConsecutiveFolds ?? 0,
    });
  }
  const intent = sampleIntent(mixValue, rng);
  const targetTo = getPreflopRaiseTo(context);
  return finalizeIntent(context, intent, targetTo);
}

function decidePostflop(
  context: BotDecisionContext,
  personality: BotPersonality,
  rng: BotRng
): BotActionWithoutThinking {
  const profile = PERSONALITY_PROFILES[personality];
  const analysis = analyzePostflop(context, rng);
  const potOdds = computePotOdds(context);
  const requiredCallEquity = clamp01(potOdds + profile.callBuffer);
  const boardWet = analysis.features.boardConnected || analysis.features.boardMonotone || analysis.features.boardPaired;

  if (shouldJamPostflop(context, analysis, profile)) {
    return finalizeIntent(context, 'jam', context.maxRaiseTo);
  }

  if (context.bettingState === 'unopened' && context.canRaise) {
    if (
      analysis.equity >= profile.valueBetMinEquity
      || (analysis.madeHandRank >= 2 && context.phase === 'river' && analysis.equity >= profile.riverThinValueMinEquity)
    ) {
      return finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
    }

    const cbetFrequency = boardWet ? profile.cbetFreqWet : profile.cbetFreqDry;
    if (
      (context.isPreflopAggressor || context.isLastStreetAggressor)
      && (analysis.equity >= profile.semiBluffMinEquity || rng() < cbetFrequency)
    ) {
      return finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
    }

    return resolvePassiveAction(context);
  }

  if (
    context.canRaise
    && (
      analysis.equity >= profile.valueBetMinEquity
      || (
        (analysis.features.flushDraw || analysis.features.oesd || analysis.features.pairPlusDraw)
        && analysis.equity >= profile.semiBluffMinEquity
        && rng() < profile.barrelFreq
      )
    )
  ) {
    return finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
  }

  if (shouldFloatSmallBet(context, analysis, personality)) {
    return { type: 'call', amount: context.callAmount };
  }

  if (context.canCall && analysis.equity >= requiredCallEquity) {
    return { type: 'call', amount: context.callAmount };
  }

  return resolvePassiveAction(context);
}

export function chooseBotAction(
  context: BotDecisionContext,
  personality: BotPersonality = 'fish',
  rng: BotRng = Math.random,
  options: ChooseBotActionOptions = {},
): BotAction {
  const thinkingDelayMs = calcThinkingDelay(rng, personality);
  const decided = context.phase === 'preflop'
    ? decidePreflop(context, personality, rng, options)
    : decidePostflop(context, personality, rng);

  switch (decided.type) {
    case 'call':
      return { type: 'call', amount: decided.amount, thinkingDelayMs };
    case 'raise_to':
      return { type: 'raise_to', amount: decided.amount, thinkingDelayMs };
    case 'all_in':
      return { type: 'all_in', thinkingDelayMs };
    case 'fold':
      return { type: 'fold', thinkingDelayMs };
    default:
      return { type: 'check', thinkingDelayMs };
  }
}
