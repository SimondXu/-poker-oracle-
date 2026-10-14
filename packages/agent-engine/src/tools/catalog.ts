import { evaluateBestSevenCards } from '@aipoker/game-engine';
import type { BotDecisionContext, Card } from '@aipoker/shared';
import {
  ALL_COMBOS,
  adviseFromEquities,
  buildOpponentRange,
  canonicalizeHoleCards,
  classifyHand,
  compareRankVectors,
  computePotOdds,
  contestingOpponents,
  createStableAnalysisRng,
  describeHand,
  DRAW_BET_FREQUENCY,
  enumerateRiverRangeEquity,
  estimateTendencies,
  evaluatePreflopPercentile,
  getPreflopMix,
  isStrongDraw,
  PERSONALITY_PROFILES,
  preflopPlayShare,
  rankedOnBoard,
  readOwnRange,
  simulateRangeEquity,
} from '@aipoker/strategy-engine';
import { z } from 'zod';

import { HAND_CATEGORIES, type HandCategory } from '../memory.ts';
import { buildMenu, MENU_IDS, type MenuId } from '../menu.ts';
import { EQUITY_ITERATIONS, liveOpponent, liveOpponents, ToolArgumentError, toolSeed, type ToolContext } from './context.ts';

export const TOOL_NAMES = [
  'hand_strength',
  'board_texture',
  'price',
  'legal_options',
  'equity',
  'opponent_profile',
  'opponent_range',
  'preflop_chart',
  'own_range',
  'advisor',
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolArgs {
  seat: number | null;
  option: MenuId | null;
}

/** eager: the realtime brief runs it; deep: the model may ask for it in deep mode; consultant: arm A2 only. */
export type ToolMode = 'eager' | 'eager+deep' | 'deep' | 'consultant';

export interface ToolSpec<O> {
  name: ToolName;
  mode: ToolMode;
  args: 'none' | 'seat' | 'seat_or_all' | 'option';
  output: z.ZodType<O>;
  execute(ctx: ToolContext, args: ToolArgs): O;
}

const HAND_CLASSES = ['premium', 'strong', 'playable', 'speculative', 'marginal', 'trash'] as const;
const COACH_ACTION_KINDS = ['fold', 'check', 'call', 'bet', 'raise', 'all_in'] as const;

function standardError(equity: number, iterations: number): number {
  return Math.sqrt((equity * (1 - equity)) / iterations);
}

// ---- hand_strength

const PAIR_KINDS = ['overpair', 'top', 'second', 'lower', 'underpair'] as const;
type PairKind = (typeof PAIR_KINDS)[number];

const RANK_VALUE: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const rankValue = (card: Card) => RANK_VALUE[card[0]!] ?? Number(card[0]);

/** How the hole cards pair: a pocket pair over or under the board's top card, or which board rank they pair. */
function pairKind(holeCards: readonly Card[], board: readonly Card[]): PairKind | null {
  const [first, second] = holeCards.map(rankValue);
  const boardRanks = [...new Set(board.map(rankValue))].sort((left, right) => right - left);
  if (first === second) {
    return first! > boardRanks[0]! ? 'overpair' : 'underpair';
  }
  const paired = [first!, second!].filter((rank) => boardRanks.includes(rank));
  if (paired.length === 0) {
    return null;
  }
  const index = boardRanks.indexOf(Math.max(...paired));
  return index === 0 ? 'top' : index === 1 ? 'second' : 'lower';
}

const draws = z.object({
  flush: z.boolean(),
  oesd: z.boolean(),
  gutshot: z.boolean(),
  backdoorFlush: z.boolean(),
  backdoorStraight: z.boolean(),
  twoOvercards: z.boolean(),
});

const NO_DRAWS: z.infer<typeof draws> = { flush: false, oesd: false, gutshot: false, backdoorFlush: false, backdoorStraight: false, twoOvercards: false };

/** Clean outs as usually counted, labelled nominal: flush 9, open-ended 8, gutshot 4, two overcards 6. */
function nominalOuts(found: z.infer<typeof draws>, board: readonly Card[]): number {
  if (board.length >= 5) {
    return 0;
  }
  const straight = found.oesd ? 8 : found.gutshot ? 4 : 0;
  // One card of each straight rank also makes the flush.
  const flush = found.flush ? 9 - straight / 4 : 0;
  return Math.min(15, flush + straight + (found.twoOvercards ? 6 : 0));
}

const handStrength: ToolSpec<{
  handKey: string;
  preflop: { handClass: (typeof HAND_CLASSES)[number]; percentile: number };
  made: { category: HandCategory; pairKind: PairKind | null; boardPlays: boolean } | null;
  draws: z.infer<typeof draws>;
  nominalOuts: number | null;
}> = {
  name: 'hand_strength',
  mode: 'eager',
  args: 'none',
  output: z.object({
    handKey: z.string(),
    preflop: z.object({ handClass: z.enum(HAND_CLASSES), percentile: z.number() }),
    made: z.object({ category: z.enum(HAND_CATEGORIES), pairKind: z.enum(PAIR_KINDS).nullable(), boardPlays: z.boolean() }).nullable(),
    draws,
    nominalOuts: z.number().nullable(),
  }),
  execute({ context }) {
    const handKey = canonicalizeHoleCards(context.holeCards);
    const preflop = { handClass: classifyHand(handKey), percentile: evaluatePreflopPercentile(context.holeCards) };
    if (context.communityCards.length < 3) {
      return { handKey, preflop, made: null, draws: NO_DRAWS, nominalOuts: null };
    }
    const { rank, madeHandRank, features } = describeHand(context);
    const category = HAND_CATEGORIES[rank[0] ?? 0]!;
    const found = {
      flush: features.flushDraw,
      oesd: features.oesd,
      gutshot: features.gutshot,
      backdoorFlush: features.backdoorFlushDraw,
      backdoorStraight: features.backdoorStraightDraw,
      twoOvercards: features.twoOvercards,
    };
    return {
      handKey,
      preflop,
      made: {
        category,
        pairKind: category === 'pair' || category === 'two_pair' ? pairKind(context.holeCards, context.communityCards) : null,
        boardPlays: madeHandRank === 0 && category !== 'high_card',
      },
      draws: found,
      nominalOuts: nominalOuts(found, context.communityCards),
    };
  },
};

// ---- board_texture

const boardTexture: ToolSpec<{
  suits: 'rainbow' | 'two_tone' | 'monotone' | null;
  flushPossible: boolean | null;
  paired: boolean | null;
  connected: boolean | null;
  highRank: string | null;
}> = {
  name: 'board_texture',
  mode: 'eager',
  args: 'none',
  output: z.object({
    suits: z.enum(['rainbow', 'two_tone', 'monotone']).nullable(),
    flushPossible: z.boolean().nullable(),
    paired: z.boolean().nullable(),
    connected: z.boolean().nullable(),
    highRank: z.string().nullable(),
  }),
  execute({ context }) {
    const board = context.communityCards;
    if (board.length < 3) {
      return { suits: null, flushPossible: null, paired: null, connected: null, highRank: null };
    }
    const { features } = describeHand(context);
    const suitCounts = new Map<string, number>();
    for (const card of board) {
      suitCounts.set(card[1]!, (suitCounts.get(card[1]!) ?? 0) + 1);
    }
    const maxSuit = Math.max(...suitCounts.values());
    const high = [...board].sort((left, right) => rankValue(right) - rankValue(left))[0]!;
    return {
      suits: features.boardMonotone ? 'monotone' : maxSuit === 1 ? 'rainbow' : 'two_tone',
      flushPossible: maxSuit >= 3,
      paired: features.boardPaired,
      connected: features.boardConnected,
      highRank: high[0]!,
    };
  },
};

// ---- price

const price: ToolSpec<{
  pot: number;
  toCall: number;
  potOdds: number;
  sprAtStreetStart: number;
  effectiveStack: number;
  effectiveStackBb: number;
  bigBlind: number;
}> = {
  name: 'price',
  mode: 'eager',
  args: 'none',
  output: z.object({
    pot: z.number(),
    toCall: z.number(),
    potOdds: z.number(),
    sprAtStreetStart: z.number(),
    effectiveStack: z.number(),
    effectiveStackBb: z.number(),
    bigBlind: z.number(),
  }),
  execute({ context }) {
    return {
      pot: context.potTotal,
      toCall: context.canCall ? context.callAmount : 0,
      potOdds: computePotOdds(context),
      sprAtStreetStart: context.spr,
      effectiveStack: context.effectiveStack,
      effectiveStackBb: context.effectiveStackBb,
      bigBlind: context.bigBlind,
    };
  },
};

// ---- legal_options

const menuOption = z.object({
  id: z.enum(MENU_IDS),
  kind: z.enum(COACH_ACTION_KINDS),
  to: z.number().nullable(),
  toBb: z.number().nullable(),
  potShare: z.number().nullable(),
  bluffBreakEven: z.number().nullable(),
  sprAfter: z.number().nullable(),
});

const legalOptions: ToolSpec<Array<z.infer<typeof menuOption>>> = {
  name: 'legal_options',
  mode: 'eager',
  args: 'none',
  output: z.array(menuOption),
  execute: ({ context }) => buildMenu(context),
};

// ---- equity

interface EquityOutput {
  equity: number | null;
  stdErr: number | null;
  against: 'range' | 'random' | null;
  /** The seats it is measured against: before the flop, only those who put chips in voluntarily. */
  seats: number[];
  iterations: number;
  exact: boolean;
}

function equityAgainstAll(ctx: ToolContext): EquityOutput {
  const { context } = ctx;
  if (context.phase === 'preflop') {
    const equity = ctx.equities.preflopVsCallers();
    return equity === null
      ? { equity: null, stdErr: null, against: null, seats: [], iterations: 0, exact: false }
      : {
          equity,
          stdErr: standardError(equity, EQUITY_ITERATIONS),
          against: 'range',
          seats: contestingOpponents(context).map((opponent) => ctx.seatOf(opponent.id)).sort((left, right) => left - right),
          iterations: EQUITY_ITERATIONS,
          exact: false,
        };
  }
  const analysis = ctx.equities.postflop();
  // A heads-up river is enumerated exactly.
  const exact = context.phase === 'river' && context.opponentCount === 1;
  return {
    equity: analysis.equity,
    stdErr: exact ? 0 : standardError(analysis.equity, EQUITY_ITERATIONS),
    against: analysis.equityVs,
    seats: liveOpponents(ctx).map((opponent) => ctx.seatOf(opponent.id)),
    iterations: exact ? 0 : EQUITY_ITERATIONS,
    exact,
  };
}

function equityAgainstSeat(ctx: ToolContext, seat: number): EquityOutput {
  const { context } = ctx;
  const range = buildOpponentRange(liveOpponent(ctx, seat), context);
  const exactEquity = context.communityCards.length === 5 ? enumerateRiverRangeEquity(context, range) : null;
  const equity = exactEquity ?? simulateRangeEquity(
    context,
    [range],
    createStableAnalysisRng(toolSeed(ctx.seedBase, 'equity', seat)),
    EQUITY_ITERATIONS,
  );
  const exact = exactEquity !== null;
  return {
    equity,
    stdErr: exact ? 0 : standardError(equity, EQUITY_ITERATIONS),
    against: 'range',
    seats: [seat],
    iterations: exact ? 0 : EQUITY_ITERATIONS,
    exact,
  };
}

const equity: ToolSpec<EquityOutput> = {
  name: 'equity',
  mode: 'eager+deep',
  args: 'seat_or_all',
  output: z.object({
    equity: z.number().nullable(),
    stdErr: z.number().nullable(),
    against: z.enum(['range', 'random']).nullable(),
    seats: z.array(z.number().int()),
    iterations: z.number().int(),
    exact: z.boolean(),
  }),
  execute: (ctx, { seat }) => (seat === null ? equityAgainstAll(ctx) : equityAgainstSeat(ctx, seat)),
};

// ---- opponent_profile

const statRate = z.object({ rate: z.number().nullable(), n: z.number().int() });
type StatRate = z.infer<typeof statRate>;
const rate = (count: number, n: number): StatRate => ({ rate: n > 0 ? count / n : null, n });

const notableEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.enum(['showed_bluff', 'showed_value']), hand: z.number(), street: z.enum(['preflop', 'flop', 'turn', 'river']), betPotShare: z.number(), made: z.enum(HAND_CATEGORIES) }),
  z.object({ kind: z.literal('big_preflop_shove'), hand: z.number(), bb: z.number() }),
  z.object({ kind: z.enum(['check_raise', 'overbet']), hand: z.number(), street: z.enum(['preflop', 'flop', 'turn', 'river']) }),
  z.object({ kind: z.literal('called_down_light'), hand: z.number(), made: z.enum(HAND_CATEGORIES) }),
]);

const profileOutput = z.object({
  seat: z.number().int(),
  position: z.enum(['sb', 'bb', 'btn', 'co', 'hj', 'utg']),
  stack: z.number(),
  hands: z.number().int(),
  vpip: statRate,
  pfr: statRate,
  oversizedRaise: statRate,
  aggression: statRate,
  foldToBet: statRate,
  smoothed: z.object({ vpip: z.number(), pfr: z.number(), aggression: z.number(), foldToBet: z.number() }),
  notable: z.array(notableEvent),
});

const opponentProfile: ToolSpec<z.infer<typeof profileOutput>> = {
  name: 'opponent_profile',
  mode: 'eager+deep',
  args: 'seat',
  output: profileOutput,
  execute(ctx, { seat }) {
    const opponent = liveOpponent(ctx, seat);
    const stats = opponent.stats;
    const tendencies = estimateTendencies(stats);
    return {
      seat: seat!,
      position: opponent.position,
      stack: ctx.view.players.find((player) => player.id === opponent.id)!.stack,
      hands: stats?.hands ?? 0,
      vpip: rate(stats?.preflopVoluntary ?? 0, stats?.hands ?? 0),
      pfr: rate(stats?.preflopRaises ?? 0, stats?.hands ?? 0),
      oversizedRaise: rate(stats?.preflopOversizedRaises ?? 0, stats?.hands ?? 0),
      aggression: rate(stats?.postflopAggressive ?? 0, stats?.postflopActions ?? 0),
      foldToBet: rate(stats?.postflopFoldsToBets ?? 0, stats?.postflopFacingBets ?? 0),
      smoothed: {
        vpip: tendencies.vpip,
        pfr: tendencies.preflopRaiseRate,
        aggression: tendencies.postflopAggression,
        foldToBet: tendencies.foldToBet,
      },
      notable: ctx.memory.opponents.get(seat!)?.notable ?? [],
    };
  },
};

// ---- opponent_range

interface RangeOutput {
  seat: number;
  /** Share of all starting hands, by weight. */
  share: number;
  onBoard: { noPair: number; onePair: number; twoPairPlus: number; strongDraw: number } | null;
  /** Share of the range ahead of the hero's hand right now. */
  beatsYou: number | null;
}

/** Splits a range on the board by made hand, without the hands the hero's cards and the board block. */
function rangeOnBoard(context: BotDecisionContext, range: Float64Array): Pick<RangeOutput, 'onBoard' | 'beatsYou'> {
  const board = context.communityCards;
  const heroRank = evaluateBestSevenCards([...context.holeCards, ...board]).rank;
  const blocked = new Set<Card>(context.holeCards);
  const sums = { total: 0, noPair: 0, onePair: 0, twoPairPlus: 0, strongDraw: 0, beatsYou: 0 };
  for (const { index, rank } of rankedOnBoard(board)) {
    const weight = range[index] ?? 0;
    const combo = ALL_COMBOS[index]!;
    if (weight <= 0 || blocked.has(combo[0]) || blocked.has(combo[1])) {
      continue;
    }
    sums.total += weight;
    const category = rank[0] ?? 0;
    sums[category === 0 ? 'noPair' : category === 1 ? 'onePair' : 'twoPairPlus'] += weight;
    sums.strongDraw += isStrongDraw(combo, board) ? weight : 0;
    sums.beatsYou += compareRankVectors(rank, heroRank) > 0 ? weight : 0;
  }
  const share = (value: number) => (sums.total > 0 ? value / sums.total : 0);
  return {
    onBoard: { noPair: share(sums.noPair), onePair: share(sums.onePair), twoPairPlus: share(sums.twoPairPlus), strongDraw: share(sums.strongDraw) },
    beatsYou: share(sums.beatsYou),
  };
}

const opponentRange: ToolSpec<RangeOutput> = {
  name: 'opponent_range',
  mode: 'eager+deep',
  args: 'seat',
  output: z.object({
    seat: z.number().int(),
    share: z.number(),
    onBoard: z.object({ noPair: z.number(), onePair: z.number(), twoPairPlus: z.number(), strongDraw: z.number() }).nullable(),
    beatsYou: z.number().nullable(),
  }),
  execute(ctx, { seat }) {
    const { context } = ctx;
    const range = buildOpponentRange(liveOpponent(ctx, seat), context);
    const share = range.reduce((sum, weight) => sum + weight, 0) / ALL_COMBOS.length;
    return {
      seat: seat!,
      share,
      ...(context.communityCards.length >= 3 ? rangeOnBoard(context, range) : { onBoard: null, beatsYou: null }),
    };
  },
};

// ---- preflop_chart

const mix = z.object({ fold: z.number(), call: z.number(), raise: z.number(), jam: z.number() });

const preflopChart: ToolSpec<{
  handKey: string;
  handClass: (typeof HAND_CLASSES)[number];
  percentile: number;
  standardWidth: number;
  buttonWidth: number | null;
  tagMix: z.infer<typeof mix>;
}> = {
  name: 'preflop_chart',
  mode: 'eager+deep',
  args: 'none',
  output: z.object({
    handKey: z.string(),
    handClass: z.enum(HAND_CLASSES),
    percentile: z.number(),
    standardWidth: z.number(),
    buttonWidth: z.number().nullable(),
    tagMix: mix,
  }),
  execute({ context }) {
    if (context.phase !== 'preflop') {
      throw new ToolArgumentError('preflop_chart is for decisions before the flop');
    }
    const handKey = canonicalizeHoleCards(context.holeCards);
    return {
      handKey,
      handClass: classifyHand(handKey),
      percentile: evaluatePreflopPercentile(context.holeCards),
      standardWidth: preflopPlayShare(context, context.bettingState, context.position),
      buttonWidth: context.position === 'btn' ? null : preflopPlayShare(context, context.bettingState, 'btn'),
      tagMix: getPreflopMix('tag', context.effectiveStackBb, context.bettingState, context.position, context.holeCards, context.activePlayerCount),
    };
  },
};

// ---- own_range

const ownRange: ToolSpec<{ shareAbove: number; valueShare: number; isDraw: boolean; airBetFrequency: number }> = {
  name: 'own_range',
  mode: 'deep',
  args: 'option',
  output: z.object({ shareAbove: z.number(), valueShare: z.number(), isDraw: z.boolean(), airBetFrequency: z.number() }),
  execute({ context }, { option }) {
    const chosen = buildMenu(context).find((candidate) => candidate.id === option);
    if (!chosen || chosen.potShare === null) {
      throw new ToolArgumentError(`option ${option} is not a bet or raise on the menu`);
    }
    const drawBetFrequency = Math.min(1, DRAW_BET_FREQUENCY * PERSONALITY_PROFILES.tag.bluffScale);
    const read = readOwnRange(context, chosen.potShare, drawBetFrequency);
    if (!read) {
      throw new ToolArgumentError('own_range is for decisions after the flop');
    }
    return read;
  },
};

// ---- advisor

const advisor: ToolSpec<{
  options: Array<{ kind: (typeof COACH_ACTION_KINDS)[number]; to: number | null; frequency: number; reasons: string[] }>;
  stable: boolean;
  equity: number | null;
}> = {
  name: 'advisor',
  mode: 'consultant',
  args: 'none',
  output: z.object({
    options: z.array(z.object({ kind: z.enum(COACH_ACTION_KINDS), to: z.number().nullable(), frequency: z.number(), reasons: z.array(z.string()) })),
    stable: z.boolean(),
    equity: z.number().nullable(),
  }),
  execute(ctx) {
    const advice = adviseFromEquities(ctx.context, ctx.equities, { handId: '', actionIndex: 0, stateVersion: 0 });
    return {
      // Reason codes only: some reasons' parameters name a player.
      options: advice.options.map((option) => ({
        kind: option.kind,
        to: option.to ?? null,
        frequency: option.frequency,
        reasons: option.reasons.map((reason) => reason.code),
      })),
      stable: advice.stable,
      equity: advice.equity ?? null,
    };
  },
};

export const TOOLS = {
  hand_strength: handStrength,
  board_texture: boardTexture,
  price,
  legal_options: legalOptions,
  equity,
  opponent_profile: opponentProfile,
  opponent_range: opponentRange,
  preflop_chart: preflopChart,
  own_range: ownRange,
  advisor,
} satisfies { readonly [Name in ToolName]: ToolSpec<unknown> };
