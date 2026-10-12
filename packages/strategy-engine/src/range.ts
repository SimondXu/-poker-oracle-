import { evaluateBestSevenCards } from '@aipoker/game-engine';
import type { BotDecisionContext, BotOpponentAction, BotOpponentView, BotPlayerStats, Card } from '@aipoker/shared';

import type { BotRng, RankVector } from './types.ts';
import { compareRankVectors, detectStraightState, FULL_DECK, remainingDeck, sampleWithoutReplacement } from './cards.ts';
import { OVERSIZED_RAISE_SIZE_OF_POT } from './context.ts';
import { canonicalizeHoleCards, evaluatePreflopPercentile } from './preflop-hands.ts';
import { getPreflopMix } from './preflop-mixes.ts';

type Combo = readonly [Card, Card];

/** Weights over all 1326 starting hands, aligned with ALL_COMBOS. */
export type WeightedRange = Float64Array;

export const ALL_COMBOS: readonly Combo[] = FULL_DECK.flatMap((first, index) =>
  FULL_DECK.slice(index + 1).map((second) => [first, second] as const)
);

// Nobody plays the TAG baseline exactly, so every hand keeps a little weight.
const RANGE_NOISE = 0.01;
// Share of a bettor's range, from the top, that bets for value at each size (fraction of pot).
const VALUE_SHARE_BY_SIZE: ReadonlyArray<readonly [number, number]> = [[1, 0.3], [0.6, 0.4], [0, 0.55]];
const DRAW_WEIGHT_WHEN_BETTING = 0.6;
// Even a player who almost never bluffs keeps a sliver of air in their betting range.
const MIN_AIR_WEIGHT_WHEN_BETTING = 0.02;
const RANGE_CACHE_LIMIT = 512;

const STREET_BOARD_SIZE = { flop: 3, turn: 4, river: 5 } as const;

const rangeCache = new Map<string, WeightedRange>();

// Beta priors for the opponent model: a dozen hands of a TAG-like player.
const PRIOR_WEIGHT = 12;
const PRIOR_PREFLOP_RAISE_RATE = 0.2;
const PRIOR_OVERSIZED_RAISE_RATE = 0.02;
const PRIOR_POSTFLOP_AGGRESSION = 0.3;
const PRIOR_VPIP = 0.25;
const PRIOR_FOLD_TO_BET = 0.4;
// A caller keeps at least this much of their range from the top; the rest would have folded.
const MIN_CALLING_SHARE = 0.7;

interface Tendencies {
  vpip: number;
  preflopRaiseRate: number;
  oversizedRaiseRate: number;
  postflopAggression: number;
  foldToBet: number;
}

function smoothedRate(count: number, opportunities: number, prior: number): number {
  return (count + prior * PRIOR_WEIGHT) / (opportunities + PRIOR_WEIGHT);
}

/** Posterior mean rates from the player's history, rounded so near-identical histories share a cached range. */
function estimateTendencies(stats: BotPlayerStats | undefined): Tendencies {
  const round = (value: number) => Math.round(value * 50) / 50;
  return {
    vpip: round(smoothedRate(stats?.preflopVoluntary ?? 0, stats?.hands ?? 0, PRIOR_VPIP)),
    foldToBet: round(smoothedRate(stats?.postflopFoldsToBets ?? 0, stats?.postflopFacingBets ?? 0, PRIOR_FOLD_TO_BET)),
    preflopRaiseRate: round(smoothedRate(stats?.preflopRaises ?? 0, stats?.hands ?? 0, PRIOR_PREFLOP_RAISE_RATE)),
    oversizedRaiseRate: round(smoothedRate(stats?.preflopOversizedRaises ?? 0, stats?.hands ?? 0, PRIOR_OVERSIZED_RAISE_RATE)),
    postflopAggression: round(smoothedRate(stats?.postflopAggressive ?? 0, stats?.postflopActions ?? 0, PRIOR_POSTFLOP_AGGRESSION)),
  };
}

/** A player shown to be more aggressive than the prior raises at least the top `rate` of their hands. */
function widenedShare(rate: number, prior: number): number {
  return rate > prior ? rate : 0;
}

/**
 * The mixes don't say how big a raise is, so a raise well over a standard size (about 1-2x the
 * pot) is read as coming from only the strongest hands: the top 25% / sqrt(size / 2) of starting
 * hands, about the top 4% for a 100bb shove.
 */
function oversizedRaiseCutoff(sizeOfPot: number): number {
  return sizeOfPot <= OVERSIZED_RAISE_SIZE_OF_POT ? 1 : 0.25 / Math.sqrt(sizeOfPot / OVERSIZED_RAISE_SIZE_OF_POT);
}

function preflopWeights(
  view: BotOpponentView,
  action: BotOpponentAction,
  context: BotDecisionContext,
  tendencies: Tendencies,
): Map<string, number> {
  const oversized = action.sizeOfPot > OVERSIZED_RAISE_SIZE_OF_POT;
  const observedShare = oversized
    ? widenedShare(tendencies.oversizedRaiseRate, PRIOR_OVERSIZED_RAISE_RATE)
    : widenedShare(tendencies.preflopRaiseRate, PRIOR_PREFLOP_RAISE_RATE);
  const byKey = new Map<string, number>();
  for (const combo of ALL_COMBOS) {
    const key = canonicalizeHoleCards(combo);
    if (byKey.has(key)) {
      continue;
    }
    const mix = getPreflopMix('tag', context.effectiveStackBb, action.facing, view.position, combo, context.activePlayerCount);
    const aggressive = mix.raise + mix.jam;
    // Checking the big blind option is what a hand that didn't want to raise does.
    const percentile = evaluatePreflopPercentile(combo);
    const raiseWeight = percentile <= observedShare
      ? 1
      : percentile <= oversizedRaiseCutoff(action.sizeOfPot) ? aggressive : 0;
    const callWeight = percentile <= widenedShare(tendencies.vpip, PRIOR_VPIP) ? 1 : mix.call;
    const weight = action.type === 'call' ? callWeight : action.type === 'check' ? 1 - aggressive : raiseWeight;
    byKey.set(key, weight);
  }
  return byKey;
}

function isStrongDraw(combo: Combo, board: readonly Card[]): boolean {
  if (board.length >= 5) {
    return false;
  }
  const cards = [...combo, ...board];
  const flushDraw = combo.some((card) => cards.filter((other) => other[1] === card[1]).length === 4);
  return flushDraw || detectStraightState(cards, combo).oesd;
}

/**
 * Share of a betting range that is bluffs (draws and air) at a given size, the s/(1+2s) a caller
 * must face to be indifferent: 1/4 at half pot, 1/3 at pot.
 */
function balancedBluffShare(sizeOfPot: number): number {
  const size = Math.max(0, sizeOfPot);
  return size / (1 + 2 * size);
}

/** Re-weights a range for one postflop action, by where each hand sits in the range on that board. */
function narrowForPostflopAction(
  range: WeightedRange,
  action: BotOpponentAction,
  board: readonly Card[],
  tendencies: Tendencies,
): void {
  const boardSet = new Set(board);
  const ranked: Array<{ index: number; rank: RankVector }> = [];
  let total = 0;
  ALL_COMBOS.forEach((combo, index) => {
    if ((range[index] ?? 0) > 0 && !boardSet.has(combo[0]) && !boardSet.has(combo[1])) {
      ranked.push({ index, rank: evaluateBestSevenCards([...combo, ...board]).rank });
      total += range[index] ?? 0;
    }
  });
  ranked.sort((left, right) => compareRankVectors(right.rank, left.rank));

  const isAggressive = action.type === 'raise_to' || action.type === 'all_in';
  // A player who bets more often than most keeps more of their range when they bet.
  const valueShare = Math.max(
    VALUE_SHARE_BY_SIZE.find(([size]) => action.sizeOfPot >= size)?.[1] ?? 0.55,
    widenedShare(tendencies.postflopAggression, PRIOR_POSTFLOP_AGGRESSION),
  );
  const air: number[] = [];
  let valueWeight = 0;
  let drawWeight = 0;
  let airWeight = 0;
  let above = 0;
  for (const { index } of ranked) {
    const weight = range[index] ?? 0;
    const shareAbove = total > 0 ? above / total : 0;
    above += weight;
    const combo = ALL_COMBOS[index]!;
    if (isAggressive) {
      if (shareAbove < valueShare) {
        valueWeight += weight;
      } else if (isStrongDraw(combo, board)) {
        range[index] = weight * DRAW_WEIGHT_WHEN_BETTING;
        drawWeight += range[index]!;
      } else {
        air.push(index);
        airWeight += weight;
      }
    } else if (action.type === 'call') {
      // The very top would usually have raised; the bottom would usually have folded, unless they rarely fold.
      const callingShare = Math.max(MIN_CALLING_SHARE, 1 - tendencies.foldToBet);
      range[index] = weight * (shareAbove < 0.1 ? 0.5 : shareAbove < callingShare || isStrongDraw(combo, board) ? 1 : 0.15);
    } else {
      range[index] = weight * (shareAbove < 0.15 ? 0.5 : 1);
    }
  }

  if (isAggressive && airWeight > 0) {
    // Scale the air so draws plus air make up the balanced bluff share of what was bet.
    const bluffShare = balancedBluffShare(action.sizeOfPot);
    const airTarget = (bluffShare * valueWeight) / (1 - bluffShare) - drawWeight;
    const airMultiplier = Math.min(1, Math.max(MIN_AIR_WEIGHT_WHEN_BETTING, airTarget / airWeight));
    for (const index of air) {
      range[index] = (range[index] ?? 0) * airMultiplier;
    }
  }
}

/** The hands this opponent is likely to hold, given everything they did this hand. */
export function buildOpponentRange(view: BotOpponentView, context: BotDecisionContext): WeightedRange {
  const tendencies = estimateTendencies(view.stats);
  const cacheKey = JSON.stringify([
    tendencies,
    view.position,
    view.actions,
    context.communityCards,
    Math.round(context.effectiveStackBb),
    context.activePlayerCount,
  ]);
  const cached = rangeCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const range = new Float64Array(ALL_COMBOS.length).fill(1);
  for (const action of view.actions) {
    if (action.phase === 'preflop') {
      const weights = preflopWeights(view, action, context, tendencies);
      ALL_COMBOS.forEach((combo, index) => {
        range[index] = (range[index] ?? 0) * (RANGE_NOISE + (1 - RANGE_NOISE) * (weights.get(canonicalizeHoleCards(combo)) ?? 0));
      });
    } else {
      narrowForPostflopAction(range, action, context.communityCards.slice(0, STREET_BOARD_SIZE[action.phase]), tendencies);
    }
  }

  if (rangeCache.size >= RANGE_CACHE_LIMIT) {
    rangeCache.delete(rangeCache.keys().next().value!);
  }
  rangeCache.set(cacheKey, range);
  return range;
}

function sampleCombo(range: WeightedRange, used: ReadonlySet<Card>, rng: BotRng): Combo | null {
  let total = 0;
  for (let index = 0; index < ALL_COMBOS.length; index += 1) {
    const [first, second] = ALL_COMBOS[index]!;
    if (!used.has(first) && !used.has(second)) {
      total += range[index] ?? 0;
    }
  }
  if (total <= 0) {
    return null;
  }

  let target = rng() * total;
  for (let index = 0; index < ALL_COMBOS.length; index += 1) {
    const combo = ALL_COMBOS[index]!;
    if (used.has(combo[0]) || used.has(combo[1])) {
      continue;
    }
    target -= range[index] ?? 0;
    if (target <= 0) {
      return combo;
    }
  }
  return null;
}

function heroShare(heroRank: RankVector, opponentRanks: readonly RankVector[]): number {
  let ties = 1;
  for (const opponentRank of opponentRanks) {
    const comparison = compareRankVectors(heroRank, opponentRank);
    if (comparison < 0) {
      return 0;
    }
    if (comparison === 0) {
      ties += 1;
    }
  }
  return 1 / ties;
}

/** Hero's showdown equity against each opponent's range, by sampling hands from the ranges and running out the board. */
export function simulateRangeEquity(
  context: BotDecisionContext,
  ranges: readonly WeightedRange[],
  rng: BotRng,
  iterations: number,
): number {
  const dead = [...context.holeCards, ...context.communityCards];
  const runoutSize = 5 - context.communityCards.length;
  let equity = 0;
  let completed = 0;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const used = new Set<Card>(dead);
    const opponentHands: Combo[] = [];
    for (const range of ranges) {
      const combo = sampleCombo(range, used, rng);
      if (!combo) {
        break;
      }
      opponentHands.push(combo);
      used.add(combo[0]);
      used.add(combo[1]);
    }
    if (opponentHands.length < ranges.length) {
      continue;
    }

    const board = [...context.communityCards, ...sampleWithoutReplacement(remainingDeck([...used]), runoutSize, rng)];
    const heroRank = evaluateBestSevenCards([...context.holeCards, ...board]).rank;
    equity += heroShare(heroRank, opponentHands.map((hand) => evaluateBestSevenCards([...hand, ...board]).rank));
    completed += 1;
  }

  return completed > 0 ? equity / completed : 0;
}

/** Exact heads-up river equity against a range: every remaining hand, weighted. */
export function enumerateRiverRangeEquity(context: BotDecisionContext, range: WeightedRange): number | null {
  if (context.communityCards.length !== 5) {
    return null;
  }

  const used = new Set<Card>([...context.holeCards, ...context.communityCards]);
  const heroRank = evaluateBestSevenCards([...context.holeCards, ...context.communityCards]).rank;
  let equity = 0;
  let total = 0;
  ALL_COMBOS.forEach((combo, index) => {
    const weight = range[index] ?? 0;
    if (weight <= 0 || used.has(combo[0]) || used.has(combo[1])) {
      return;
    }
    equity += weight * heroShare(heroRank, [evaluateBestSevenCards([...combo, ...context.communityCards]).rank]);
    total += weight;
  });
  return total > 0 ? equity / total : null;
}

/** How often the stickiest live opponent folds to a bet, from their history; null without one. */
export function lowestFoldToBetRate(context: BotDecisionContext): number | null {
  const rates = (context.opponents ?? []).filter((opponent) => opponent.stats).map((opponent) => estimateTendencies(opponent.stats).foldToBet);
  return rates.length > 0 ? Math.min(...rates) : null;
}
