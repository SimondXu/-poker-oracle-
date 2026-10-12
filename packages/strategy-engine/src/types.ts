import type {
  BotPersonality,
  HandClass,
} from '@aipoker/shared';

export type BotRng = () => number;

export type StackBucket = '<=12bb' | '13-25bb' | '26-60bb' | '>60bb';

export type PreflopScenario = 'unopened' | 'facing_limpers' | 'facing_open' | 'facing_3bet_plus';

export type ActionIntent = 'fold' | 'call' | 'raise' | 'jam';

export type { HandClass };

export type HandDetail =
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

export type PreflopPosition = 'utg' | 'hj' | 'co' | 'btn' | 'sb' | 'bb';

export type RankVector = ReadonlyArray<number | undefined>;

export type BotActionWithoutThinking =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call'; amount: number }
  | { type: 'raise_to'; amount: number }
  | { type: 'all_in' };

export interface PersonalityProfile {
  valueBetMinEquity: number;
  semiBluffMinEquity: number;
  callBuffer: number;
  cbetFreqDry: number;
  cbetFreqWet: number;
  barrelFreq: number;
  riverThinValueMinEquity: number;
  thinkingRange: [number, number];
  // Whether this player reads opponents' history (stations, maniacs) or plays the same against everyone.
  adaptsToOpponents: boolean;
  // Multiplier on the balanced bluffing frequency: below 1 under-bluffs, above 1 over-bluffs.
  bluffScale: number;
  // How often a very strong hand checks instead of betting when it could bet.
  slowplayFreq: number;
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

export interface PostflopFeatures {
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
  // 'range' when equity was computed against each opponent's likely hands, 'random' against any two cards.
  equityVs: 'range' | 'random';
}

export interface AnalyzePostflopOptions {
  flopIterations?: number;
  turnIterations?: number;
  riverIterations?: number;
  preferExactRiverHeadsUp?: boolean;
  forceSimulation?: boolean;
}

export type TrainingSuggestion = 'fold' | 'check' | 'call' | 'raise';

export interface TrainingStrength {
  kind: 'top_percent' | 'equity';
  value: number;
}

/**
 * The size of a suggested bet or raise. `to` is the street total, like `raise_to`.
 * `value` is in big blinds before the flop, and afterwards the chips added beyond a call
 * as a share of the pot after calling.
 */
export interface TrainingSizing {
  kind: 'bet' | 'raise' | 'all_in';
  to: number;
  unit: 'bb' | 'pot';
  value: number;
}

export interface TrainingAnalysis {
  strength: TrainingStrength;
  /** Postflop: what the equity was computed against. */
  equityVs?: PostflopAnalysis['equityVs'];
  /** Postflop: effective stack over the pot as the street began. */
  spr?: number;
  potOdds?: number;
  winRequirement?: number;
  suggestion?: TrainingSuggestion;
  sizing?: TrainingSizing;
  suggestionReason?: string;
}

export interface AnalyzeTrainingSpotOptions {
  personality?: BotPersonality;
  includeRecommendation?: boolean;
  seed?: string;
}

export type MixByHandClass = Record<HandClass, Mix>;

export type MixByStackBucket = Record<StackBucket, MixByHandClass>;

export type ScenarioMixes = Record<BotPersonality, MixByStackBucket>;
