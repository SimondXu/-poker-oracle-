import {
  COACH_POLICY_VERSION,
  classifyAction,
  type BotDecisionContext,
  type BotPlayerStats,
  type CoachAdvice,
  type CoachOption,
  type CoachReason,
} from '@aipoker/shared';
import { computePotOdds } from './actions.ts';
import { clamp01, createStableAnalysisRng } from './cards.ts';
import { buildDecisionContext, type DecisionHand, type DecisionValidActions } from './context.ts';
import { once, preflopEquityVsCallers, type Equities } from './decide.ts';
import { enumerateDecision, type DecisionOutcome } from './enumerate.ts';
import { PERSONALITY_PROFILES } from './personality.ts';
import { analyzePostflop } from './postflop-analysis.ts';
import { evaluatePreflopPercentile } from './preflop-hands.ts';

/** Per street; mean standard error about 0.0115 (see Docs/game-design/coach-advice.md, step 1e). */
const COACH_ITERATIONS = 512;
// The call mix is a logistic, so far from the price the other side keeps a vanishing share.
const MIN_OPTION_FREQUENCY = 0.005;
const UNSTABLE_FREQUENCY_SHIFT = 0.25;
const MAX_REASONS = 3;
const REASON_PRIORITY: ReadonlyArray<CoachReason['code']> = [
  'jam',
  'price_short',
  'price_ok',
  'value',
  'slowplay',
  'draw',
  'sticky_opponent',
  'bluff_share',
  'cbet',
  'no_initiative',
  'preflop_chart',
];

export interface CoachJoinKeys {
  handId: string;
  actionIndex: number;
  stateVersion: number;
}

/**
 * The hero's advice, from the hero's own view of the hand. `view` must hold no one else's hole
 * cards; pass what the hero was sent. `seed` keeps the same spot's advice the same on every rebuild.
 */
export function buildCoachAdvice(input: {
  view: DecisionHand;
  heroId: string;
  valid: DecisionValidActions;
  stats?: ReadonlyMap<string, BotPlayerStats>;
  seed: string;
  keys: CoachJoinKeys;
}): CoachAdvice | null {
  const context = buildDecisionContext(input.view, input.heroId, input.valid, input.stats);
  if (!context) {
    return null;
  }
  const rng = createStableAnalysisRng(input.seed);
  return adviseFromEquities(context, {
    postflop: once(() => analyzePostflop(context, rng, {
      forceSimulation: true,
      flopIterations: COACH_ITERATIONS,
      turnIterations: COACH_ITERATIONS,
      riverIterations: COACH_ITERATIONS,
      preferExactRiverHeadsUp: true,
    })),
    preflopVsCallers: once(() => preflopEquityVsCallers(context, rng, COACH_ITERATIONS)),
  }, input.keys);
}

/** The advice for a context and its (memoised) equity estimates; split out so tests can fix the estimates. */
export function adviseFromEquities(context: BotDecisionContext, equities: Equities, keys: CoachJoinKeys): CoachAdvice {
  let preflopEquityUsed = false;
  const tracked: Equities = {
    postflop: equities.postflop,
    preflopVsCallers: () => {
      preflopEquityUsed = true;
      return equities.preflopVsCallers();
    },
  };
  const options = toOptions(context, enumerateDecision(context, 'tag', tracked));

  const isPreflop = context.phase === 'preflop';
  const analysis = isPreflop ? null : equities.postflop();
  const preflopEquity = isPreflop && preflopEquityUsed ? equities.preflopVsCallers() : null;
  const equity = analysis?.equity ?? preflopEquity ?? undefined;
  // A heads-up river is enumerated exactly; otherwise this bounds the error of a mean of draws in [0, 1].
  const exact = context.phase === 'river' && context.opponentCount === 1;
  const estimate = equity === undefined
    ? null
    : { equity, equityStdErr: exact ? 0 : Math.sqrt((equity * (1 - equity)) / COACH_ITERATIONS), equityVs: analysis?.equityVs ?? 'range' };

  const shifted = (shift: number) => toOptions(context, enumerateDecision(context, 'tag', {
    postflop: () => {
      const base = equities.postflop();
      return { ...base, equity: clamp01(base.equity + shift) };
    },
    preflopVsCallers: () => {
      const base = equities.preflopVsCallers();
      return base === null ? null : clamp01(base + shift);
    },
  }));
  const sigma = estimate?.equityStdErr ?? 0;
  const stable = sigma === 0 || [shifted(-2 * sigma), shifted(2 * sigma)].every((other) => sameAdvice(options, other));

  const potOdds = context.canCall && context.callAmount > 0 ? computePotOdds(context) : undefined;
  const common = options
    .map((option) => new Set(option.reasons.map((reason) => JSON.stringify(reason))))
    .reduce((shared, next) => new Set([...shared].filter((key) => next.has(key))));

  return {
    policyVersion: COACH_POLICY_VERSION,
    personality: 'tag',
    handId: keys.handId,
    street: context.phase,
    actionIndex: keys.actionIndex,
    stateVersion: keys.stateVersion,
    spot: {
      holeCards: [...context.holeCards],
      board: [...context.communityCards],
      pot: context.potTotal,
      toCall: context.callAmount,
      heroStack: context.myStack,
      bigBlind: context.bigBlind,
    },
    options: options.map((option) => ({ ...option, reasons: rank(option.reasons.filter((reason) => !common.has(JSON.stringify(reason)))) })),
    stable,
    ...estimate,
    ...(isPreflop ? { handPercentile: evaluatePreflopPercentile(context.holeCards) } : {}),
    ...(potOdds !== undefined ? { potOdds, requiredEquity: clamp01(potOdds + PERSONALITY_PROFILES.tag.callBuffer) } : {}),
    ...(isPreflop ? {} : { spr: context.spr }),
    effStackBb: context.effectiveStackBb,
    position: context.position,
    scenario: context.bettingState,
    opponents: context.opponentCount,
    reasons: rank([...common].map((key) => JSON.parse(key) as CoachReason)),
  };
}

/** Actions as the hero sees them, merged (an all-in that only calls is a call), without vanishing tails. */
function toOptions(context: BotDecisionContext, outcomes: DecisionOutcome[]): CoachOption[] {
  const byKey = new Map<string, CoachOption>();
  for (const { action, probability, reasons } of outcomes) {
    const kind = classifyAction(action, context);
    const to = action.type === 'raise_to' ? action.amount : kind === 'all_in' ? context.myStreetCommitted + context.myStack : undefined;
    const key = `${kind}:${to ?? ''}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.frequency += probability;
      const seen = new Set(existing.reasons.map((reason) => JSON.stringify(reason)));
      existing.reasons.push(...reasons.filter((reason) => !seen.has(JSON.stringify(reason))));
      continue;
    }
    byKey.set(key, {
      kind,
      ...(to !== undefined ? { to } : {}),
      ...((kind === 'bet' || kind === 'raise') && to !== undefined ? { size: sizeOf(context, to) } : {}),
      frequency: probability,
      reasons: [...reasons],
    });
  }
  const kept = [...byKey.values()].filter((option) => option.frequency >= MIN_OPTION_FREQUENCY);
  const total = kept.reduce((sum, option) => sum + option.frequency, 0);
  return kept
    .map((option) => ({ ...option, frequency: option.frequency / total }))
    .sort((left, right) => right.frequency - left.frequency);
}

function sizeOf(context: BotDecisionContext, to: number): NonNullable<CoachOption['size']> {
  if (context.phase === 'preflop') {
    return { unit: 'bb', value: to / context.bigBlind };
  }
  const added = to - context.myStreetCommitted - context.callAmount;
  return { unit: 'pot', value: added / (context.potTotal + context.callAmount) };
}

function optionKey(option: CoachOption): string {
  return `${option.kind}:${option.to ?? ''}`;
}

/** Same top option, and no option's frequency moves more than the unstable shift. */
function sameAdvice(left: CoachOption[], right: CoachOption[]): boolean {
  if (optionKey(left[0]!) !== optionKey(right[0]!)) {
    return false;
  }
  const frequencies = (options: CoachOption[]) => new Map(options.map((option) => [optionKey(option), option.frequency]));
  const a = frequencies(left);
  const b = frequencies(right);
  return [...new Set([...a.keys(), ...b.keys()])].every((key) => Math.abs((a.get(key) ?? 0) - (b.get(key) ?? 0)) <= UNSTABLE_FREQUENCY_SHIFT);
}

function rank(reasons: CoachReason[]): CoachReason[] {
  return [...reasons]
    .sort((left, right) => REASON_PRIORITY.indexOf(left.code) - REASON_PRIORITY.indexOf(right.code))
    .slice(0, MAX_REASONS);
}
