import { chooseBotAction } from '@aipoker/strategy-engine';
import type { BotAction, BotDecisionContext } from '@aipoker/shared';

export type Policy = (context: BotDecisionContext, rng: () => number) => BotAction;

export const POLICY_NAMES = ['fish', 'tag', 'lag', 'tag-random', 'station', 'maniac-shove', 'overbettor', 'size-reader'] as const;
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
};

export function parsePolicyName(value: string | undefined): PolicyName {
  if (value && (POLICY_NAMES as readonly string[]).includes(value)) {
    return value as PolicyName;
  }
  throw new Error(`Unknown policy "${value ?? ''}"; expected one of ${POLICY_NAMES.join(', ')}`);
}
