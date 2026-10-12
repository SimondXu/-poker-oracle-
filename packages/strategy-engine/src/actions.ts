import type {
  BotDecisionContext,
  BotPersonality,
  BotPosition,
} from '@aipoker/shared';
import type { ActionIntent, BotActionWithoutThinking, BotRng, Mix, PersonalityProfile, PostflopAnalysis } from './types.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { clamp01 } from './cards.ts';
import { getPreflopTablePosition, getStackBucket, normalizePreflopScenario } from './preflop-hands.ts';
import { lowestFoldToBetRate } from './range.ts';

/** Below this fold-to-bet rate an opponent is treated as a calling station: no bluffs, bigger value bets. */
export const STICKY_FOLD_TO_BET_RATE = 0.2;

export function calcThinkingDelay(rng: BotRng, personality: BotPersonality): number {
  const [minimum, maximum] = PERSONALITY_PROFILES[personality].thinkingRange;
  return Math.floor(minimum + rng() * (maximum - minimum));
}

export function sampleIntent(mixValue: Mix, rng: BotRng): ActionIntent {
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

export function resolvePassiveAction(context: BotDecisionContext): BotActionWithoutThinking {
  if (context.canCheck) {
    return { type: 'check' };
  }
  if (context.canFold) {
    return { type: 'fold' };
  }
  if (context.canCall) {
    return { type: 'call', amount: context.callAmount };
  }
  if (context.canAllIn) {
    return { type: 'all_in' };
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

export function finalizeIntent(
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

// Order of action after the flop; heads-up the button is last too.
const POSTFLOP_ACTION_ORDER: readonly BotPosition[] = ['sb', 'bb', 'utg', 'hj', 'co', 'btn'];

/** In position means acting after every opponent still in the hand on the later streets. */
export function isLikelyInPosition(context: BotDecisionContext): boolean {
  if (!context.opponents || context.opponents.length === 0) {
    return context.position === 'btn' || context.position === 'co' || context.position === 'hj';
  }
  const heroOrder = POSTFLOP_ACTION_ORDER.indexOf(context.position);
  return context.opponents.every((opponent) => POSTFLOP_ACTION_ORDER.indexOf(opponent.position) < heroOrder);
}

export function getPreflopRaiseTo(context: BotDecisionContext): number {
  const bigBlind = estimateBigBlind(context);
  const stackBucket = getStackBucket(context.effectiveStackBb);
  const preflopPosition = getPreflopTablePosition(context.position, context.activePlayerCount);
  const scenario = normalizePreflopScenario(context.bettingState);
  if (stackBucket === '<=12bb') {
    return context.maxRaiseTo;
  }

  if (scenario === 'unopened') {
    const openSizeBb = preflopPosition === 'sb' ? 3.0 : (preflopPosition === 'co' || preflopPosition === 'btn' ? 2.2 : 2.5);
    return Math.round(openSizeBb * bigBlind);
  }

  if (scenario === 'facing_limpers') {
    const isoSizeBb = preflopPosition === 'sb' ? 5.0 : (preflopPosition === 'co' || preflopPosition === 'btn' ? 4.5 : 4.0);
    return Math.round(isoSizeBb * bigBlind);
  }

  if (scenario === 'facing_3bet_plus') {
    const multiplier = isLikelyInPosition(context) ? 2.2 : 2.5;
    return Math.round(context.minRaiseTo * multiplier);
  }

  const multiplier = isLikelyInPosition(context) ? 2.0 : 2.5;
  return Math.round(context.minRaiseTo * multiplier);
}

export function getPotOdds(callAmount: number, potTotal: number): number {
  if (callAmount <= 0) {
    return 0;
  }

  return callAmount / Math.max(1, potTotal + callAmount);
}

export function computePotOdds(context: BotDecisionContext): number {
  if (!context.canCall || context.callAmount <= 0) {
    return 0;
  }
  return getPotOdds(context.callAmount, context.potTotal);
}

export function selectPostflopSizeFraction(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile
): number {
  // Someone who almost never folds pays a big bet as readily as a small one.
  const sticky = (lowestFoldToBetRate(context) ?? 1) < STICKY_FOLD_TO_BET_RATE && analysis.equity >= profile.valueBetMinEquity;
  if (context.spr <= 1 || sticky) {
    return 1.0;
  }
  // Otherwise the size depends only on the spot, never on the hand, so it gives nothing away.
  if (context.callAmount > 0) {
    return 0.75;
  }
  if (context.phase === 'river') {
    return 0.75;
  }
  const boardWet = analysis.features.boardConnected || analysis.features.boardMonotone || analysis.features.boardPaired;
  return boardWet || context.opponentCount > 1 ? 0.66 : 0.33;
}

export function getPostflopRaiseTo(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile
): number {
  const sizeFraction = selectPostflopSizeFraction(context, analysis, profile);
  // raise_to is a total street amount: chips already committed + the call + a pot-fraction raise after calling.
  const targetTo =
    context.myStreetCommitted + context.callAmount + Math.round((context.potTotal + context.callAmount) * sizeFraction);
  return Math.max(context.minRaiseTo, Math.min(context.maxRaiseTo, targetTo));
}
