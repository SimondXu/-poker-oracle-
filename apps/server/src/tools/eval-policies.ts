import { chooseBotAction, describeHand } from '@aipoker/strategy-engine';
import type { BotAction, BotDecisionContext, Card } from '@aipoker/shared';

export type Policy = (context: BotDecisionContext, rng: () => number) => BotAction;

export const POLICY_NAMES = ['fish', 'tag', 'lag', 'tag-random', 'station', 'maniac-shove', 'overbettor', 'size-reader', 'folder', 'calldown'] as const;
export type PolicyName = (typeof POLICY_NAMES)[number];

const OVERBET_POT_FRACTION = 1.5;

function passive(context: BotDecisionContext): BotAction {
  if (context.canCheck) {
    return { type: 'check', thinkingDelayMs: 0 };
  }
  if (context.canCall) {
    return { type: 'call', amount: context.callAmount, thinkingDelayMs: 0 };
  }
  return { type: 'fold', thinkingDelayMs: 0 };
}

// Never folds when it can check or call, never raises.
const station: Policy = passive;

const maniacShove: Policy = (context) =>
  context.canAllIn ? { type: 'all_in', thinkingDelayMs: 0 } : passive(context);

// Bets or raises ~1.5x the pot after calling, with any hand, whenever the engine allows a raise.
const overbettor: Policy = (context) => {
  if (!context.canRaise) {
    return passive(context);
  }

  const target = Math.round(context.currentBetToMatch + OVERBET_POT_FRACTION * (context.potTotal + context.callAmount));
  const raiseTo = Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, target));
  if (raiseTo >= context.maxRaiseTo && context.canAllIn) {
    return { type: 'all_in', thinkingDelayMs: 0 };
  }
  return { type: 'raise_to', amount: raiseTo, thinkingDelayMs: 0 };
};

// Plays TAG, but reads bet sizes as strength: folds to near-pot bets, raises bets of a third of the pot or less.
const sizeReader: Policy = (context, rng) => {
  if (context.phase !== 'preflop' && context.callAmount > 0) {
    const betFraction = context.callAmount / Math.max(1, context.potTotal - context.callAmount);
    if (betFraction >= 0.9) {
      return passive({ ...context, canCall: false });
    }
    if (betFraction <= 0.4 && context.canRaise) {
      const raiseTo = Math.min(context.maxRaiseTo, Math.max(context.minRaiseTo, context.currentBetToMatch + context.potTotal + context.callAmount));
      return { type: 'raise_to', amount: raiseTo, thinkingDelayMs: 0 };
    }
  }
  return chooseBotAction(context, 'tag', rng);
};

const RANK_VALUE: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11, T: 10 };
const rankValue = (card: Card) => RANK_VALUE[card[0]!] ?? Number(card[0]);

/** The pair is top pair or an overpair: a pocket pair above the board, or a hole card matching the board's highest rank. */
function pairIsTopOrOver(context: BotDecisionContext): boolean {
  const [first, second] = context.holeCards.map(rankValue) as [number, number];
  const boardHigh = Math.max(...context.communityCards.map(rankValue));
  return first === second ? first > boardHigh : first === boardHigh || second === boardHigh;
}

/**
 * The hand's class as the probes read it, from `describeHand` and not from equity. made: a pair or
 * better using a hole card (the board playing does not count). topPairPlus: top pair, an overpair, or
 * two pair and better. strongDraw: a flush draw or open-ended straight draw before the river; anyDraw
 * adds the gutshot.
 */
function handClass(context: BotDecisionContext): { made: boolean; topPairPlus: boolean; strongDraw: boolean; anyDraw: boolean } {
  const { madeHandRank, features } = describeHand(context);
  const river = context.phase === 'river';
  return {
    made: madeHandRank >= 1,
    topPairPlus: madeHandRank >= 2 || (madeHandRank === 1 && pairIsTopOrOver(context)),
    strongDraw: !river && (features.flushDraw || features.oesd),
    anyDraw: !river && (features.flushDraw || features.oesd || features.gutshot),
  };
}

const facingBetAfterFlop = (context: BotDecisionContext) => context.phase !== 'preflop' && context.callAmount > 0;

// Plays TAG, but after the flop folds to any bet unless it holds top pair or better (pair kind top/overpair,
// or two pair+ using a hole card) or, before the river, a flush draw or an open-ended straight draw; never raises a bet.
const folder: Policy = (context, rng) => {
  if (!facingBetAfterFlop(context)) {
    return chooseBotAction(context, 'tag', rng);
  }
  const hand = handClass(context);
  return passive(hand.topPairPlus || hand.strongDraw ? context : { ...context, canCall: false });
};

// Plays TAG preflop; after the flop never folds a pair (a hole card pairs the board) or any draw (flush, open-ended
// or gutshot), folds only with neither; never bets or raises, so it checks when it can.
const calldown: Policy = (context, rng) => {
  if (context.phase === 'preflop') {
    return chooseBotAction(context, 'tag', rng);
  }
  if (!facingBetAfterFlop(context)) {
    return passive(context);
  }
  const hand = handClass(context);
  return passive(hand.made || hand.anyDraw ? context : { ...context, canCall: false });
};

export const POLICIES: Record<PolicyName, Policy> = {
  fish: (context, rng) => chooseBotAction(context, 'fish', rng),
  tag: (context, rng) => chooseBotAction(context, 'tag', rng),
  lag: (context, rng) => chooseBotAction(context, 'lag', rng),
  // TAG with equity against random hands, as before range equity: the A/B baseline.
  'tag-random': (context, rng) => {
    const { opponents, ...withoutOpponents } = context;
    void opponents;
    return chooseBotAction(withoutOpponents, 'tag', rng);
  },
  station,
  'maniac-shove': maniacShove,
  overbettor,
  'size-reader': sizeReader,
  folder,
  calldown,
};

export function parsePolicyName(value: string | undefined): PolicyName {
  if (value && (POLICY_NAMES as readonly string[]).includes(value)) {
    return value as PolicyName;
  }
  throw new Error(`Unknown policy "${value ?? ''}"; expected one of ${POLICY_NAMES.join(', ')}`);
}
