import type {
  BotDecisionContext,
  BotPersonality,
  BotPosition,
} from '@aipoker/shared';
import type { ActionIntent, BotActionWithoutThinking, BotRng, Mix, PersonalityProfile, PostflopAnalysis } from './types.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { clamp01 } from './cards.ts';
import { getPreflopTablePosition, getStackBucket, normalizePreflopScenario } from './preflop-hands.ts';

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

export function isLikelyInPosition(position: BotPosition): boolean {
  return position === 'btn' || position === 'co' || position === 'hj';
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
    const multiplier = isLikelyInPosition(context.position) ? 2.2 : 2.5;
    return Math.round(context.minRaiseTo * multiplier);
  }

  const multiplier = isLikelyInPosition(context.position) ? 2.0 : 2.5;
  return Math.round(context.minRaiseTo * multiplier);
}

export function getPotOdds(callAmount: number, potTotal: number): number {
  if (callAmount <= 0) {
    return 0;
  }

  return callAmount / Math.max(1, potTotal + callAmount);
}

export function getRequiredEquity(potOdds: number, callBuffer = 0): number {
  return clamp01(potOdds + callBuffer);
}

export function computePotOdds(context: BotDecisionContext): number {
  if (!context.canCall || context.callAmount <= 0) {
    return 0;
  }
  return getPotOdds(context.callAmount, context.potTotal);
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
