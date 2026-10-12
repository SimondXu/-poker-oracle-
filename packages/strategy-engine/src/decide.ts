import type {
  BotAction,
  BotDecisionContext,
  BotPersonality,
  CoachReason,
} from '@aipoker/shared';
import type { ActionIntent, BotActionWithoutThinking, BotRng, ChooseBotActionOptions, HandClass, Mix, PersonalityProfile, PostflopAnalysis, PreflopPosition, PreflopScenario } from './types.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { clamp01 } from './cards.ts';
import { canonicalizeHoleCards, classifyHand, getPreflopTablePosition, normalizePreflopScenario } from './preflop-hands.ts';
import { getPreflopMix, nudgeMix, scaleMixDelta } from './preflop-mixes.ts';
import { calcThinkingDelay, computePotOdds, STICKY_FOLD_TO_BET_RATE, finalizeIntent, getPostflopRaiseTo, getPreflopRaiseTo, isLikelyInPosition, resolvePassiveAction, sampleIntent, selectPostflopSizeFraction } from './actions.ts';
import { analyzePostflop } from './postflop-analysis.ts';
import { buildOpponentRange, lowestFoldToBetRate, readOwnRange, simulateRangeEquity, stickiestOpponent } from './range.ts';

const MAX_SPR_FOR_VALUE_JAM = 3;
// A hand in the value part of its range still needs to be ahead of what calls to bet for value.
const MIN_VALUE_BET_EQUITY = 0.5;
// Only near-locks slowplay, and only heads-up.
const SLOWPLAY_MIN_EQUITY = 0.8;
// How often a strong draw bets when it has the initiative, before the personality's bluff scale.
const DRAW_BET_FREQUENCY = 0.6;
// A value hand facing a bet raises this often and calls the rest, so calls aren't all weak.
const VALUE_RAISE_FREQUENCY = 0.7;
// Equity margin over which a call goes from about 27% to 73% likely.
const CALL_MIX_WIDTH = 0.025;
// These decisions can be for the whole stack, so they get more samples than a postflop street.
const PREFLOP_PRICE_ITERATIONS = 400;

/**
 * Every random choice a decision makes. A bot samples it with its rng; the coach enumerates it,
 * so the coach's frequencies come from the same decision code the bots play.
 */
export interface Chooser {
  /** True with probability p (a bot draws rng() < p, even when p is 0 or 1, to keep its draw order). */
  chance(p: number): boolean;
  /** One intent from a preflop mix, drawn as sampleIntent draws it. */
  pick(mix: Mix): ActionIntent;
  /** A fact the decision used on the current path; the coach shows it as a reason, a bot ignores it. */
  note(reason: CoachReason): void;
}

/** The equity estimates a decision may need, computed lazily and at most once. */
export interface Equities {
  postflop(): PostflopAnalysis;
  /** Preflop equity against the ranges of the players who put chips in voluntarily; null when there are none. */
  preflopVsCallers(): number | null;
}

export function once<T>(compute: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = compute();
      done = true;
    }
    return value;
  };
}

export function samplingChooser(rng: BotRng): Chooser {
  return {
    chance: (p) => rng() < p,
    pick: (mix) => sampleIntent(mix, rng),
    note: () => {},
  };
}

/** The bots' equities: their own rng and default iterations, drawn where the decision first needs them. */
export function sampledEquities(context: BotDecisionContext, rng: BotRng): Equities {
  return {
    postflop: once(() => analyzePostflop(context, rng)),
    preflopVsCallers: once(() => preflopEquityVsCallers(context, rng)),
  };
}

function shouldJamPostflop(
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
  chooser: Chooser,
  equities: Equities,
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
  chooser.note({
    code: 'preflop_chart',
    params: { handClass, scenario: context.bettingState, position: context.position, effStackBb: context.effectiveStackBb },
  });
  const intent = chooser.pick(mixValue);
  // The mixes don't know the size of the bet, so any call (including a raise that can only call) checks the price.
  const callsOnly = intent === 'call' || (intent !== 'fold' && !context.canRaise);
  if (callsOnly && context.callAmount > 0) {
    const price = preflopPrice(context, personality, equities);
    if (price && price.equity < price.required) {
      chooser.note({ code: 'price_short', params: price });
      return resolvePassiveAction(context);
    }
    if (price) {
      chooser.note({ code: 'price_ok', params: price });
    }
  }
  // Calling for all the chips is pure equity against the price, with no later streets to play badly.
  const callIsAllIn = context.canCall && (!context.canRaise || context.callAmount >= context.myStack);
  if (intent === 'fold' && callIsAllIn) {
    const price = preflopPrice(context, personality, equities);
    if (price && price.equity >= price.required) {
      chooser.note({ code: 'price_ok', params: price });
      return { type: 'call', amount: context.callAmount };
    }
  }
  const targetTo = getPreflopRaiseTo(context);
  return finalizeIntent(context, intent, targetTo);
}

/**
 * Equity against the ranges of the players who put chips in voluntarily, and the equity the call
 * needs; null when nobody's actions are known.
 */
function preflopPrice(context: BotDecisionContext, personality: BotPersonality, equities: Equities): { equity: number; required: number } | null {
  const equity = equities.preflopVsCallers();
  return equity === null ? null : { equity, required: clamp01(computePotOdds(context) + PERSONALITY_PROFILES[personality].callBuffer) };
}

/** The players who put chips in voluntarily: preflop equity is measured against their ranges only. */
export function contestingOpponents(context: BotDecisionContext): NonNullable<BotDecisionContext['opponents']> {
  return context.opponents?.filter((opponent) => opponent.actions.some((action) => action.type !== 'check')) ?? [];
}

export function preflopEquityVsCallers(context: BotDecisionContext, rng: BotRng, iterations = PREFLOP_PRICE_ITERATIONS): number | null {
  const contesting = contestingOpponents(context);
  if (contesting.length === 0) {
    return null;
  }
  return simulateRangeEquity(
    context,
    contesting.map((opponent) => buildOpponentRange(opponent, context)),
    rng,
    iterations,
  );
}

function decidePostflop(
  context: BotDecisionContext,
  personality: BotPersonality,
  chooser: Chooser,
  equities: Equities,
): BotActionWithoutThinking {
  const profile = PERSONALITY_PROFILES[personality];
  const analysis = equities.postflop();

  if (shouldJamPostflop(context, analysis, profile)) {
    const trigger = context.effectiveStackBb <= 12 ? 'short_stack' : context.spr <= 1 ? 'low_spr' : 'near_lock';
    chooser.note({ code: 'jam', params: { trigger, effStackBb: context.effectiveStackBb, spr: context.spr } });
    return finalizeIntent(context, 'jam', context.maxRaiseTo);
  }

  return context.bettingState === 'unopened' && context.canRaise
    ? decideUnopenedPostflop(context, analysis, profile, chooser)
    : decideFacingBetPostflop(context, analysis, profile, personality, chooser);
}

/** Bet the value part of the range, some draws, and enough air to keep the bets balanced; check the rest. */
function decideUnopenedPostflop(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile,
  chooser: Chooser,
): BotActionWithoutThinking {
  const bet = () => finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
  // A pure bluff into someone who never folds just burns chips.
  const sticky = stickiestOpponent(context);
  const opponentFolds = (sticky?.foldToBet ?? 1) >= STICKY_FOLD_TO_BET_RATE;
  if (sticky && !opponentFolds) {
    chooser.note({ code: 'sticky_opponent', params: { playerId: sticky.id, foldToBet: sticky.foldToBet, facingBets: sticky.facingBets } });
  }
  const hasInitiative = context.isPreflopAggressor || context.isLastStreetAggressor;
  const checkedToInPosition = context.streetActionCount > 0 && isLikelyInPosition(context);
  const drawBetFrequency = Math.min(1, DRAW_BET_FREQUENCY * profile.bluffScale);
  const read = readOwnRange(context, selectPostflopSizeFraction(context, analysis, profile), drawBetFrequency);

  if (!read) {
    // No record of our own line: fall back to betting by equity alone.
    const cbetFrequency = analysis.features.boardConnected || analysis.features.boardMonotone || analysis.features.boardPaired
      ? profile.cbetFreqWet
      : profile.cbetFreqDry;
    if (analysis.equity >= profile.valueBetMinEquity
      || (analysis.madeHandRank >= 2 && context.phase === 'river' && analysis.equity >= profile.riverThinValueMinEquity)) {
      chooser.note({ code: 'value', params: { equity: analysis.equity } });
      return bet();
    }
    if (hasInitiative && analysis.equity >= profile.semiBluffMinEquity) {
      return bet();
    }
    if (hasInitiative && opponentFolds) {
      chooser.note({ code: 'cbet', params: { frequency: clamp01(cbetFrequency) } });
      if (chooser.chance(cbetFrequency)) {
        return bet();
      }
    }
    return resolvePassiveAction(context);
  }

  // Against a player who calls everything, every hand that is ahead bets: there is no one to bluff
  // and no point checking a strong hand to someone who won't bet it for us.
  const isValue = opponentFolds
    ? read.shareAbove < read.valueShare && analysis.equity >= MIN_VALUE_BET_EQUITY
    : analysis.equity >= MIN_VALUE_BET_EQUITY;
  if (isValue) {
    chooser.note({ code: 'value', params: { equity: analysis.equity } });
    if (opponentFolds && analysis.equity >= SLOWPLAY_MIN_EQUITY && context.opponentCount === 1 && chooser.chance(profile.slowplayFreq)) {
      chooser.note({ code: 'slowplay', params: { equity: analysis.equity } });
      return resolvePassiveAction(context);
    }
    return bet();
  }
  if (!hasInitiative && !checkedToInPosition) {
    chooser.note({ code: 'no_initiative', params: {} });
    return resolvePassiveAction(context);
  }
  if (!hasInitiative) {
    chooser.note({ code: 'checked_to_in_position', params: {} });
  }
  if (read.isDraw) {
    chooser.note({ code: 'draw', params: { draw: analysis.features.flushDraw ? 'flush' : 'oesd' } });
    return chooser.chance(drawBetFrequency) ? bet() : resolvePassiveAction(context);
  }
  if (opponentFolds) {
    const airBetFrequency = read.airBetFrequency * profile.bluffScale;
    chooser.note({ code: 'bluff_share', params: { frequency: clamp01(airBetFrequency) } });
    if (chooser.chance(airBetFrequency)) {
      return bet();
    }
  }
  return resolvePassiveAction(context);
}

function decideFacingBetPostflop(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  profile: PersonalityProfile,
  personality: BotPersonality,
  chooser: Chooser,
): BotActionWithoutThinking {
  const raise = () => finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
  if (context.canRaise && analysis.equity >= profile.valueBetMinEquity) {
    chooser.note({ code: 'value', params: { equity: analysis.equity } });
    if (chooser.chance(VALUE_RAISE_FREQUENCY)) {
      return raise();
    }
  }
  const { flushDraw, oesd, pairPlusDraw } = analysis.features;
  const draw = flushDraw ? 'flush' : oesd ? 'oesd' : pairPlusDraw ? 'pair_plus_draw' : null;
  if (context.canRaise && draw && analysis.equity >= profile.semiBluffMinEquity) {
    chooser.note({ code: 'draw', params: { draw } });
    if (chooser.chance(profile.barrelFreq)) {
      return raise();
    }
  }

  if (shouldFloatSmallBet(context, analysis, personality)) {
    return { type: 'call', amount: context.callAmount };
  }

  // Near the price the call is mixed rather than a hard cut-off, so the line can't be read off one number.
  const requiredCallEquity = clamp01(computePotOdds(context) + profile.callBuffer);
  const callProbability = 1 / (1 + Math.exp(-(analysis.equity - requiredCallEquity) / CALL_MIX_WIDTH));
  if (context.canCall) {
    const price = { equity: analysis.equity, required: requiredCallEquity };
    chooser.note({ code: analysis.equity >= requiredCallEquity ? 'price_ok' : 'price_short', params: price });
    if (chooser.chance(callProbability)) {
      return { type: 'call', amount: context.callAmount };
    }
  }

  return resolvePassiveAction(context);
}

/** A player who doesn't adapt still sees what happened this hand, but not anyone's history. */
function withoutOpponentHistory(context: BotDecisionContext): BotDecisionContext {
  return context.opponents
    ? { ...context, opponents: context.opponents.map(({ stats: _stats, ...opponent }) => opponent) }
    : context;
}

/** One decision of a personality that sees `context` as given (see `chooseBotAction` for opponent history). */
export function decide(
  context: BotDecisionContext,
  personality: BotPersonality,
  chooser: Chooser,
  equities: Equities,
  options: ChooseBotActionOptions = {},
): BotActionWithoutThinking {
  return context.phase === 'preflop'
    ? decidePreflop(context, personality, chooser, equities, options)
    : decidePostflop(context, personality, chooser, equities);
}

export function chooseBotAction(
  context: BotDecisionContext,
  personality: BotPersonality = 'fish',
  rng: BotRng = Math.random,
  options: ChooseBotActionOptions = {},
): BotAction {
  const thinkingDelayMs = calcThinkingDelay(rng, personality);
  const seen = PERSONALITY_PROFILES[personality].adaptsToOpponents ? context : withoutOpponentHistory(context);
  const decided = decide(seen, personality, samplingChooser(rng), sampledEquities(seen, rng), options);

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
