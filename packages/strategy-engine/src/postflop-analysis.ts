import { evaluateBestSevenCards } from '@aipoker/game-engine';
import type {
  BotDecisionContext,
  Card,
} from '@aipoker/shared';
import type { AnalyzePostflopOptions, BotRng, PostflopAnalysis, PostflopFeatures, RankVector } from './types.ts';
import { clamp01, compareRankVectors, detectStraightState, rankValue, remainingDeck, sampleWithoutReplacement } from './cards.ts';
import { buildOpponentRange, enumerateRiverRangeEquity, simulateRangeEquity } from './range.ts';

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

function hasBackdoorStraightPotential(holeCards: readonly Card[], communityCards: readonly Card[]): boolean {
  const toRankSet = (cards: readonly Card[]) => {
    const rankSet = new Set<number>(cards.map((card) => rankValue(card)));
    if (rankSet.has(14)) {
      rankSet.add(1);
    }
    return rankSet;
  };
  const allRanks = toRankSet([...holeCards, ...communityCards]);
  const boardRanks = toRankSet(communityCards);

  for (let start = 1; start <= 11; start += 1) {
    let present = 0;
    let presentOnBoard = 0;
    for (let offset = 0; offset < 4; offset += 1) {
      present += allRanks.has(start + offset) ? 1 : 0;
      presentOnBoard += boardRanks.has(start + offset) ? 1 : 0;
    }
    // A hole card has to add a rank to the window, or the "draw" is the board's.
    if (present >= 3 && present > presentOnBoard) {
      return true;
    }
  }

  return false;
}

function countRanks(cards: readonly Card[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const rank = rankValue(card);
    counts.set(rank, (counts.get(rank) ?? 0) + 1);
  }
  return counts;
}

// Made-hand category the hero actually owns: 0 when the best hand is just the board playing.
function getEffectiveMadeHandRank(context: Pick<BotDecisionContext, 'communityCards'>, heroRank: RankVector): number {
  const heroCategory = heroRank[0] ?? 0;
  const board = context.communityCards;
  if (heroCategory === 0 || board.length < 3) {
    return heroCategory;
  }

  const boardRankCounts = countRanks(board);
  const groupSizes = [...boardRankCounts.values()].sort((left, right) => right - left);
  const boardRank = board.length >= 5 ? evaluateBestSevenCards([...board]).rank : undefined;
  let boardCategory = boardRank?.[0] ?? 0;
  if (!boardRank) {
    boardCategory =
      groupSizes[0] === 4 ? 7 : groupSizes[0] === 3 ? 3 : groupSizes[0] === 2 ? (groupSizes[1] === 2 ? 2 : 1) : 0;
  }
  if (heroCategory !== boardCategory) {
    return heroCategory;
  }

  // Same category as the board: pair, trips and quads can only differ by kicker, so the board is playing.
  if (heroCategory === 2) {
    const boardPairs = [...boardRankCounts.entries()]
      .filter(([, count]) => count >= 2)
      .map(([rank]) => rank)
      .sort((left, right) => right - left);
    return heroRank[1] !== boardPairs[0] || heroRank[2] !== boardPairs[1] ? heroCategory : 0;
  }
  if (boardRank && [4, 5, 6, 8].includes(heroCategory) && compareRankVectors(heroRank, boardRank) !== 0) {
    return heroCategory;
  }
  return 0;
}

function buildPostflopFeatures(context: Pick<BotDecisionContext, 'holeCards' | 'communityCards'>, madeHandRank: number): PostflopFeatures {
  const allCards = [...context.holeCards, ...context.communityCards];
  const isRiver = context.communityCards.length >= 5;
  const suitCounts = new Map<string, number>();
  for (const card of allCards) {
    const suit = card[1];
    if (!suit) {
      continue;
    }
    suitCounts.set(suit, (suitCounts.get(suit) ?? 0) + 1);
  }
  const holeSuits = new Set<string>(context.holeCards.map((card) => card[1] ?? ''));

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

  const straightState = isRiver
    ? { hasStraight: detectStraightState(allCards).hasStraight, oesd: false, gutshot: false }
    : detectStraightState(allCards, context.holeCards);
  const flushDraw =
    !isRiver
    && madeHandRank < 5
    && [...suitCounts.entries()].some(([suit, count]) => count === 4 && holeSuits.has(suit));
  const backdoorFlushDraw =
    madeHandRank < 5
    && !flushDraw
    && context.communityCards.length === 3
    && [...suitCounts.entries()].some(([suit, count]) => count === 3 && holeSuits.has(suit));
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
    && hasBackdoorStraightPotential(context.holeCards, context.communityCards);

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

export interface HandDescription {
  rank: RankVector;
  /** The made-hand category the hero owns: 0 when the board plays. */
  madeHandRank: number;
  features: PostflopFeatures;
}

/** The hero's made hand, draws and board features after the flop, as analyzePostflop reads them, without any equity. */
export function describeHand(context: Pick<BotDecisionContext, 'holeCards' | 'communityCards'>): HandDescription {
  const rank = evaluateBestSevenCards([...context.holeCards, ...context.communityCards]).rank;
  const madeHandRank = getEffectiveMadeHandRank(context, rank);
  return { rank, madeHandRank, features: buildPostflopFeatures(context, madeHandRank) };
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

// Returns null when the exact heads-up river enumeration does not apply.
function enumerateRiverHeadsUpEquity(context: BotDecisionContext): number | null {
  const deadCards = [...context.holeCards, ...context.communityCards];
  const deck = remainingDeck(deadCards);
  if (context.communityCards.length !== 5 || context.opponentCount !== 1 || deck.length < 2) {
    return null;
  }

  const heroRank = evaluateBestSevenCards([...context.holeCards, ...context.communityCards]).rank;
  let equity = 0;
  let combinations = 0;

  for (let firstIndex = 0; firstIndex < deck.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < deck.length; secondIndex += 1) {
      const firstCard = deck[firstIndex];
      const secondCard = deck[secondIndex];
      if (!firstCard || !secondCard) {
        continue;
      }

      const opponentRank = evaluateBestSevenCards([firstCard, secondCard, ...context.communityCards]).rank;
      const comparison = compareRankVectors(heroRank, opponentRank);
      if (comparison > 0) {
        equity += 1;
      } else if (comparison === 0) {
        equity += 0.5;
      }
      combinations += 1;
    }
  }

  return combinations > 0 ? equity / combinations : null;
}

export function analyzePostflop(
  context: BotDecisionContext,
  rng: BotRng,
  options: AnalyzePostflopOptions = {},
): PostflopAnalysis {
  const evaluated = evaluateBestSevenCards([...context.holeCards, ...context.communityCards]);
  const madeHandRank = getEffectiveMadeHandRank(context, evaluated.rank);
  const features = buildPostflopFeatures(context, madeHandRank);
  const flopIterations = options.flopIterations ?? 128;
  const turnIterations = options.turnIterations ?? 96;
  const riverIterations = options.riverIterations ?? 96;
  const preferExactRiverHeadsUp = options.preferExactRiverHeadsUp ?? true;
  const canSimulateRiver = options.forceSimulation || preferExactRiverHeadsUp || riverIterations > 0;
  const shouldSimulate =
    (context.phase === 'flop' || context.phase === 'turn' || (context.phase === 'river' && canSimulateRiver))
    && context.opponentCount > 0
    && (options.forceSimulation || context.canCall || context.canRaise);
  const iterations =
    context.phase === 'flop'
      ? flopIterations
      : context.phase === 'turn'
        ? turnIterations
        : riverIterations;
  // Without a record of what the opponents did, fall back to equity against random hands.
  const ranges = context.opponents && context.opponents.length === context.opponentCount
    ? context.opponents.map((view) => buildOpponentRange(view, context))
    : null;
  const exactRiverEquity =
    shouldSimulate && preferExactRiverHeadsUp && context.phase === 'river'
      ? ranges
        ? ranges.length === 1 ? enumerateRiverRangeEquity(context, ranges[0]!) : null
        : enumerateRiverHeadsUpEquity(context)
      : null;
  const simulatedEquity =
    exactRiverEquity !== null
      ? exactRiverEquity
      : shouldSimulate
        ? ranges ? simulateRangeEquity(context, ranges, rng, iterations) : simulateShowdownEquity(context, rng, iterations)
        : 0;
  const baseStrength = MADE_HAND_STRENGTH[madeHandRank] ?? 0.2;
  const drawBonus =
    context.phase === 'river'
      ? 0
      : (features.flushDraw ? 0.07 : 0) + (features.oesd ? 0.06 : 0) + (features.gutshot ? 0.03 : 0);
  const heuristicEquity = clamp01(baseStrength + drawBonus - (context.opponentCount - 1) * 0.05);
  const equity = shouldSimulate ? simulatedEquity : heuristicEquity;

  return {
    equity: clamp01(equity),
    madeHandRank,
    madeHandStrength: baseStrength,
    features,
    equityVs: ranges && shouldSimulate ? 'range' : 'random',
  };
}
