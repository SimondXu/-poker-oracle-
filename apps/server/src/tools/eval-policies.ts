import { chooseBotAction } from '@aipoker/strategy-engine';
import type { BotAction, BotDecisionContext } from '@aipoker/shared';

export type Policy = (context: BotDecisionContext, rng: () => number) => BotAction;

export const POLICY_NAMES = ['fish', 'tag', 'lag', 'station', 'maniac-shove', 'overbettor'] as const;
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

export const POLICIES: Record<PolicyName, Policy> = {
  fish: (context, rng) => chooseBotAction(context, 'fish', rng),
  tag: (context, rng) => chooseBotAction(context, 'tag', rng),
  lag: (context, rng) => chooseBotAction(context, 'lag', rng),
  station,
  'maniac-shove': maniacShove,
  overbettor,
};

export function parsePolicyName(value: string | undefined): PolicyName {
  if (value && (POLICY_NAMES as readonly string[]).includes(value)) {
    return value as PolicyName;
  }
  throw new Error(`Unknown policy "${value ?? ''}"; expected one of ${POLICY_NAMES.join(', ')}`);
}
