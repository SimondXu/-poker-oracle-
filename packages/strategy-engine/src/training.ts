import type {
  BotBettingState,
  BotDecisionContext,
  BotPersonality,
  BotPosition,
} from '@aipoker/shared';
import type { ActionIntent, AnalyzeTrainingSpotOptions, BotActionWithoutThinking, Mix, PersonalityProfile, PostflopAnalysis, TrainingAnalysis, TrainingSizing, TrainingStrength, TrainingSuggestion } from './types.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { createStableAnalysisRng } from './cards.ts';
import { evaluatePreflopPercentile } from './preflop-hands.ts';
import { getPreflopMix } from './preflop-mixes.ts';
import { computePotOdds, finalizeIntent, getPostflopRaiseTo, getPreflopRaiseTo, getRequiredEquity, resolvePassiveAction } from './actions.ts';
import { analyzePostflop } from './postflop-analysis.ts';
import { shouldJamPostflop } from './decide.ts';

const POSITION_LABELS: Record<BotPosition, string> = {
  utg: 'UTG',
  hj: 'HJ',
  co: 'CO',
  btn: 'BTN',
  sb: 'SB',
  bb: 'BB',
};

function describeScenario(state: BotBettingState): string {
  switch (state) {
    case 'facing_limpers':
      return 'facing limpers';
    case 'facing_open':
      return 'facing open';
    case 'facing_raise':
    case 'facing_3bet_plus':
      return 'facing 3-bet+';
    default:
      return 'unopened';
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function mapActionToSuggestion(action: BotActionWithoutThinking): TrainingSuggestion {
  switch (action.type) {
    case 'raise_to':
    case 'all_in':
      return 'raise';
    case 'call':
      return 'call';
    case 'fold':
      return 'fold';
    default:
      return 'check';
  }
}

function describeSizing(context: BotDecisionContext, action: BotActionWithoutThinking): TrainingSizing | undefined {
  if (action.type !== 'raise_to' && action.type !== 'all_in') {
    return undefined;
  }
  const to = action.type === 'raise_to' ? action.amount : context.maxRaiseTo;
  const kind = action.type === 'all_in' ? 'all_in' : context.currentBetToMatch === 0 ? 'bet' : 'raise';
  if (context.phase === 'preflop') {
    return { kind, to, unit: 'bb', value: to / context.bigBlind };
  }
  const added = to - context.myStreetCommitted - context.callAmount;
  return { kind, to, unit: 'pot', value: added / (context.potTotal + context.callAmount) };
}

function chooseDeterministicPreflopIntent(mixValue: Mix): ActionIntent {
  const rankedIntents: Array<{ intent: ActionIntent; weight: number; priority: number }> = [
    { intent: 'raise', weight: mixValue.raise + mixValue.jam, priority: 2 },
    { intent: 'call', weight: mixValue.call, priority: 1 },
    { intent: 'fold', weight: mixValue.fold, priority: 0 },
  ];

  rankedIntents.sort((left, right) => {
    if (right.weight !== left.weight) {
      return right.weight - left.weight;
    }
    return right.priority - left.priority;
  });

  return rankedIntents[0]?.intent ?? 'fold';
}

function hasDeterministicSemiBluff(context: BotDecisionContext, analysis: PostflopAnalysis, profile: PersonalityProfile): boolean {
  if (analysis.equity < profile.semiBluffMinEquity) {
    return false;
  }

  return (
    analysis.features.flushDraw
    || analysis.features.oesd
    || analysis.features.pairPlusDraw
    || (
      context.phase === 'flop'
      && analysis.features.twoOvercards
      && (analysis.features.backdoorFlushDraw || analysis.features.backdoorStraightDraw)
    )
  );
}

function decideDeterministicPostflop(
  context: BotDecisionContext,
  personality: BotPersonality,
  analysis: PostflopAnalysis,
): BotActionWithoutThinking {
  const profile = PERSONALITY_PROFILES[personality];
  const potOdds = computePotOdds(context);
  const requiredCallEquity = getRequiredEquity(potOdds, profile.callBuffer);
  const hasSemiBluff = hasDeterministicSemiBluff(context, analysis, profile);

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

    if ((context.isPreflopAggressor || context.isLastStreetAggressor) && hasSemiBluff) {
      return finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
    }

    return resolvePassiveAction(context);
  }

  if (context.canRaise && (analysis.equity >= profile.valueBetMinEquity || hasSemiBluff)) {
    return finalizeIntent(context, 'raise', getPostflopRaiseTo(context, analysis, profile));
  }

  if (context.canCall && analysis.equity >= requiredCallEquity) {
    return { type: 'call', amount: context.callAmount };
  }

  return resolvePassiveAction(context);
}

function buildPreflopReason(
  context: BotDecisionContext,
  suggestion: TrainingSuggestion,
  strength: TrainingStrength,
): string {
  const base = `TAG 基线下，这手牌约 Top ${formatPercent(strength.value)}，位于 ${POSITION_LABELS[context.position]} 的 ${describeScenario(context.bettingState)} 场景。`;
  switch (suggestion) {
    case 'raise':
      return `${base} 当前最优训练动作是主动加注。`;
    case 'call':
      return `${base} 继续跟注能保留足够强度。`;
    case 'check':
      return `${base} 当前没有继续投入成本，过牌更稳妥。`;
    default:
      return `${base} 这手牌不够支撑继续投入，弃牌更稳。`;
  }
}

function buildPostflopReason(
  context: BotDecisionContext,
  analysis: PostflopAnalysis,
  suggestion: TrainingSuggestion,
  requiredCallEquity: number | undefined,
): string {
  const equityText = `当前权益约 ${formatPercent(analysis.equity)}`;
  const thresholdText =
    requiredCallEquity !== undefined ? `，跟注所需约 ${formatPercent(requiredCallEquity)}` : '';

  switch (suggestion) {
    case 'raise':
      return `${equityText}，TAG 基线将这类强成手或强听牌作为主动加注候选。`;
    case 'call':
      return `${equityText}${thresholdText}，已经覆盖继续投入的门槛。`;
    case 'check':
      return `${equityText}，当前没有投入压力，TAG 基线更偏向过牌控池。`;
    default:
      return `${equityText}${thresholdText}，不足以支撑继续投入。`;
  }
}

function buildTrainingSeed(context: BotDecisionContext): string {
  return [
    context.phase,
    context.position,
    context.bettingState,
    context.holeCards.join(','),
    context.communityCards.join(','),
    context.activePlayerCount,
    context.opponentCount,
    context.callAmount,
    context.potTotal,
    context.effectiveStackBb,
  ].join('|');
}

export function analyzeTrainingSpot(
  context: BotDecisionContext,
  options: AnalyzeTrainingSpotOptions = {},
): TrainingAnalysis {
  const personality = options.personality ?? 'tag';
  const includeRecommendation = options.includeRecommendation ?? true;

  if (context.phase === 'preflop') {
    const strength: TrainingStrength = {
      kind: 'top_percent',
      value: evaluatePreflopPercentile(context.holeCards),
    };

    if (!includeRecommendation) {
      return { strength };
    }

    const mixValue = getPreflopMix(
      personality,
      context.effectiveStackBb,
      context.bettingState,
      context.position,
      context.holeCards,
      context.activePlayerCount,
    );
    const intent = chooseDeterministicPreflopIntent(mixValue);
    const action = finalizeIntent(context, intent, getPreflopRaiseTo(context));
    const suggestion = mapActionToSuggestion(action);
    const sizing = describeSizing(context, action);

    return {
      strength,
      suggestion,
      ...(sizing ? { sizing } : {}),
      suggestionReason: buildPreflopReason(context, suggestion, strength),
    };
  }

  const analysis = analyzePostflop(
    context,
    createStableAnalysisRng(options.seed ?? buildTrainingSeed(context)),
    {
      forceSimulation: true,
      flopIterations: 192,
      turnIterations: 128,
      riverIterations: 128,
      preferExactRiverHeadsUp: true,
    },
  );
  const strength: TrainingStrength = {
    kind: 'equity',
    value: analysis.equity,
  };
  const numbers = { strength, equityVs: analysis.equityVs, spr: context.spr };

  if (!includeRecommendation) {
    return numbers;
  }

  const suggestionAction = decideDeterministicPostflop(context, personality, analysis);
  const suggestion = mapActionToSuggestion(suggestionAction);
  const sizing = describeSizing(context, suggestionAction);
  const potOdds = context.canCall ? computePotOdds(context) : undefined;
  const winRequirement =
    context.canCall && potOdds !== undefined
      ? getRequiredEquity(potOdds, PERSONALITY_PROFILES[personality].callBuffer)
      : undefined;

  return {
    ...numbers,
    ...(potOdds && potOdds > 0 ? { potOdds } : {}),
    ...(winRequirement !== undefined && potOdds && potOdds > 0 ? { winRequirement } : {}),
    suggestion,
    ...(sizing ? { sizing } : {}),
    suggestionReason: buildPostflopReason(context, analysis, suggestion, winRequirement),
  };
}
