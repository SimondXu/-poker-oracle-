import type {
  BotAction,
  BotDecisionContext,
  BotPersonality,
} from '@aipoker/shared';
import type { BotActionWithoutThinking, BotRng, ChooseBotActionOptions, HandClass, Mix, PersonalityProfile, PostflopAnalysis, PreflopPosition, PreflopScenario } from './types.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { clamp01 } from './cards.ts';
import { canonicalizeHoleCards, classifyHand, getPreflopTablePosition, normalizePreflopScenario } from './preflop-hands.ts';
import { getPreflopMix, nudgeMix, scaleMixDelta } from './preflop-mixes.ts';
import { calcThinkingDelay, computePotOdds, STICKY_FOLD_TO_BET_RATE, finalizeIntent, getPostflopRaiseTo, getPreflopRaiseTo, isLikelyInPosition, resolvePassiveAction, sampleIntent } from './actions.ts';
import { analyzePostflop } from './postflop-analysis.ts';
import { buildOpponentRange, lowestFoldToBetRate, simulateRangeEquity } from './range.ts';

const MAX_SPR_FOR_VALUE_JAM = 3;
// These decisions can be for the whole stack, so they get more samples than a postflop street.
const PREFLOP_PRICE_ITERATIONS = 400;

export function shouldJamPostflop(
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
  // Deeper than this, a near-lock bets a pot-sized amount instead of shoving many pots in,
  // unless the opponent almost never folds to a bet; then the shove is the most they will pay.
  const sticky = (lowestFoldToBetRate(context) ?? 1) < STICKY_FOLD_TO_BET_RATE;
  return (sticky || context.spr <= MAX_SPR_FOR_VALUE_JAM) && analysis.equity >= 0.9;
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
    || !isLikelyInPosition(context)
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
  // The mixes don't know the size of the bet, so any call (including a raise that can only call) checks the price.
  const callsOnly = intent === 'call' || (intent !== 'fold' && !context.canRaise);
  if (callsOnly && context.callAmount > 0 && preflopCallHasPrice(context, personality, rng) === false) {
    return resolvePassiveAction(context);
  }
  // Calling for all the chips is pure equity against the price, with no later streets to play badly.
  const callIsAllIn = context.canCall && (!context.canRaise || context.callAmount >= context.myStack);
  if (intent === 'fold' && callIsAllIn && preflopCallHasPrice(context, personality, rng) === true) {
    return { type: 'call', amount: context.callAmount };
  }
  const targetTo = getPreflopRaiseTo(context);
  return finalizeIntent(context, intent, targetTo);
}

/**
 * Whether equity against the ranges of the players who put chips in voluntarily covers what the call
 * costs; null when nobody's actions are known.
 */
function preflopCallHasPrice(context: BotDecisionContext, personality: BotPersonality, rng: BotRng): boolean | null {
  const contesting = context.opponents?.filter((opponent) => opponent.actions.some((action) => action.type !== 'check'));
  if (!contesting || contesting.length === 0) {
    return null;
  }
  const equity = simulateRangeEquity(
    context,
    contesting.map((opponent) => buildOpponentRange(opponent, context)),
    rng,
    PREFLOP_PRICE_ITERATIONS,
  );
  return equity >= clamp01(computePotOdds(context) + PERSONALITY_PROFILES[personality].callBuffer);
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
    // A pure bluff c-bet into someone who never folds just burns chips.
    const opponentFolds = (lowestFoldToBetRate(context) ?? 1) >= STICKY_FOLD_TO_BET_RATE;
    if (
      (context.isPreflopAggressor || context.isLastStreetAggressor)
      && (analysis.equity >= profile.semiBluffMinEquity || (opponentFolds && rng() < cbetFrequency))
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

/** A player who doesn't adapt still sees what happened this hand, but not anyone's history. */
function withoutOpponentHistory(context: BotDecisionContext): BotDecisionContext {
  return context.opponents
    ? { ...context, opponents: context.opponents.map(({ stats: _stats, ...opponent }) => opponent) }
    : context;
}

export function chooseBotAction(
  context: BotDecisionContext,
  personality: BotPersonality = 'fish',
  rng: BotRng = Math.random,
  options: ChooseBotActionOptions = {},
): BotAction {
  const thinkingDelayMs = calcThinkingDelay(rng, personality);
  const seen = PERSONALITY_PROFILES[personality].adaptsToOpponents ? context : withoutOpponentHistory(context);
  const decided = seen.phase === 'preflop'
    ? decidePreflop(seen, personality, rng, options)
    : decidePostflop(seen, personality, rng);

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
