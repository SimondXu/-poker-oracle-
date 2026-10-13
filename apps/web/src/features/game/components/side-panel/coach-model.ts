/**
 * Pure helpers for the Coach tab. Everything shown comes from the server's
 * advice (`CoachData.advice`) or from the hand state; nothing is estimated here.
 * `coach-model.test.ts` covers it.
 */
import {
  formatBotPositionLabel,
  type CoachAdvice,
  type CoachHeroAction,
  type CoachOption,
  type CoachReason,
  type CoachReviewDecision,
  type CoachSessionTally,
  type GameReviewEvent,
  type HandState,
} from '@aipoker/shared';
import type { TFunction } from '@/i18n';
import { formatChips } from '../../../../lib/utils.ts';
import type { CoachData } from '../../lib/coach-data';

export type { CoachData };

export interface CoachContext {
  /** Players still in the hand besides the hero. */
  opponents: number;
  /** Chips the hero must add to call; 0 when checking is free. */
  toCall: number;
  /** Chips in the middle including bets on the table. */
  pot: number;
}

const OUT_OF_HAND = new Set(['folded', 'out', 'sitting_out']);

/** `null` when the hero is not in the hand. */
export function deriveCoachContext(hand: HandState | null, heroId: string | null | undefined): CoachContext | null {
  if (!hand || !heroId) return null;
  const hero = hand.players.find((player) => player.id === heroId);
  if (!hero) return null;
  const opponents = hand.players.filter((player) => player.id !== heroId && !OUT_OF_HAND.has(player.status)).length;
  const toCall = Math.max(0, Math.min(hero.stack, hand.betting.currentBetToMatch - hero.streetCommitted));
  const settled = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const committed = hand.players.reduce((sum, player) => sum + player.handCommitted, 0);
  return { opponents, toCall, pot: Math.max(settled, committed) };
}

export function percent(value: number): number {
  return Math.round(value * 100);
}

/** "2.2" for a price of 31% (call 31 to win 69): the pot offers `(1 - p) / p` to 1. */
export function formatPotOddsRatio(potOdds: number): string | null {
  if (!(potOdds > 0 && potOdds < 1)) return null;
  const ratio = (1 - potOdds) / potOdds;
  return ratio >= 10 ? String(Math.round(ratio)) : (Math.round(ratio * 10) / 10).toFixed(1);
}

/** One option as an action: "Bet 40", "Raise to 220", "All-in 940", "Call", "Check", "Fold". */
export function optionText(option: CoachOption | CoachHeroAction, t: TFunction): string {
  switch (option.kind) {
    case 'bet':
    case 'raise':
    case 'all_in':
      return t(`panel.coach.do.${option.kind}`, { amount: formatChips(option.to ?? 0) });
    default:
      return t(`panel.coach.suggest.${option.kind}`);
  }
}

/** The size of a bet or raise: "33% pot" after the flop, "2.5 BB" before it. */
export function sizeText(option: CoachOption, t: TFunction): string | null {
  const size = option.size;
  if (!size) return null;
  return size.unit === 'pot'
    ? t('panel.coach.size.pot', { percent: percent(size.value) })
    : t('panel.coach.size.bb', { bb: formatSpr(size.value) });
}

/** One decimal below 10 ("2.4"), whole numbers above ("14"). Used for SPR and sizes in big blinds. */
export function formatSpr(value: number): string {
  return value >= 10 ? String(Math.round(value)) : (Math.round(value * 10) / 10).toFixed(1);
}

/** Frequencies to the nearest 5%: the estimate behind them is not finer than that. */
export function frequencyPercent(frequency: number): number {
  return Math.round((frequency * 100) / 5) * 5;
}

/** The share to the nearest 5%, with "<5%" and ">95%" for shares that would round to 0 or 100 beside others. */
export function frequencyLabel(frequency: number): string {
  if (frequency < 0.025) return '<5%';
  if (frequency > 0.975 && frequency < 1) return '>95%';
  return `${frequencyPercent(frequency)}%`;
}

/** A strong enough top option is the suggestion; otherwise the spot is a mix, or close when equity noise could flip it. */
export function coachVerdict(advice: CoachAdvice): 'commit' | 'mix' | 'close' {
  if (!advice.stable) return 'close';
  return (advice.options[0]?.frequency ?? 0) >= 0.65 ? 'commit' : 'mix';
}

/** Fraction of the strength bar: equity when there is one, else how far from the top of the starting hands. */
export function strengthFill(data: CoachData): number | null {
  const value = data.advice?.equity ?? (data.handPercentile !== undefined ? 1 - data.handPercentile : undefined);
  return value === undefined ? null : Math.min(1, Math.max(0, value));
}

/** Whether equity beats the equity the price demands; `null` when either side is unknown. */
export function clearsPrice(advice: CoachAdvice | undefined): boolean | null {
  if (advice?.equity === undefined || advice.requiredEquity === undefined) return null;
  return advice.equity >= advice.requiredEquity;
}

type ReasonOf<C extends CoachReason['code']> = Extract<CoachReason, { code: C }>;

/**
 * One sentence per reason code; a missing code fails typecheck. `nameOf` turns a player id into
 * the name shown at the table.
 */
const REASON_TEXT: { [C in CoachReason['code']]: (reason: ReasonOf<C>, t: TFunction, nameOf: (id: string) => string) => string } = {
  preflop_chart: ({ params }, t) =>
    t('panel.coach.why.preflop_chart', {
      handClass: t(`panel.coach.class.${params.handClass}`),
      scenario: t(`panel.coach.scenario.${params.scenario}`),
      position: formatBotPositionLabel(params.position),
      bb: Math.round(params.effStackBb),
    }),
  price_ok: ({ params }, t) => t('panel.coach.why.price_ok', { equity: percent(params.equity), need: percent(params.required) }),
  price_short: ({ params }, t) => t('panel.coach.why.price_short', { equity: percent(params.equity), need: percent(params.required) }),
  jam: ({ params }, t) =>
    t(`panel.coach.why.jam.${params.trigger}`, { bb: Math.round(params.effStackBb), spr: formatSpr(params.spr) }),
  value: ({ params }, t) => t('panel.coach.why.value', { equity: percent(params.equity) }),
  slowplay: (_reason, t) => t('panel.coach.why.slowplay'),
  draw: ({ params }, t) => t('panel.coach.why.draw', { draw: t(`panel.coach.draw.${params.draw}`) }),
  bluff_share: ({ params }, t) => t('panel.coach.why.bluff_share', { frequency: frequencyPercent(params.frequency) }),
  cbet: ({ params }, t) => t('panel.coach.why.cbet', { frequency: frequencyPercent(params.frequency) }),
  position_range: ({ params }, t) =>
    params.buttonShare === null
      ? t('panel.coach.why.position_range_btn', { share: percent(params.share), scenario: t(`panel.coach.scenario.${params.scenario}`) })
      : t('panel.coach.why.position_range', {
          position: formatBotPositionLabel(params.position),
          share: percent(params.share),
          scenario: t(`panel.coach.scenario.${params.scenario}`),
          button: percent(params.buttonShare),
        }),
  no_initiative: (_reason, t) => t('panel.coach.why.no_initiative'),
  checked_to_in_position: (_reason, t) => t('panel.coach.why.checked_to_in_position'),
  sticky_opponent: ({ params }, t, nameOf) =>
    t('panel.coach.why.sticky_opponent', { name: nameOf(params.playerId), percent: percent(params.foldToBet), count: params.facingBets }),
};

export function reasonText(reason: CoachReason, t: TFunction, nameOf: (id: string) => string): string {
  const render = REASON_TEXT[reason.code] as (reason: CoachReason, t: TFunction, nameOf: (id: string) => string) => string;
  return render(reason, t, nameOf);
}

export type CoachEmptyState = 'no_cards' | 'hand_over' | 'folded' | 'waiting';

/**
 * Why there is no analysis to show. The engine analyses only betting streets
 * with live hole cards, so "no data" means one of: the hand is over, the hero
 * folded, the hero holds no cards, or the table is between streets.
 */
export function coachEmptyState(hand: HandState | null, heroId: string | null | undefined): CoachEmptyState {
  const hero = hand && heroId ? hand.players.find((player) => player.id === heroId) : undefined;
  if (!hand || !hero || hero.status === 'out' || hero.status === 'sitting_out') return 'no_cards';
  if (hand.phase === 'hand_end') return 'hand_over';
  if (hero.status === 'folded') return 'folded';
  return hero.holeCards.length >= 2 ? 'waiting' : 'no_cards';
}

/**
 * The review the Coach tab shows, if any: this hand's once it is over, or the last hand's in the
 * next hand until the hero's first decision there, when the live coach takes over.
 */
export function reviewToShow(
  review: GameReviewEvent | null,
  hand: HandState | null,
  heroId: string | null | undefined,
  heroTurn: boolean,
): { review: GameReviewEvent; which: 'this' | 'last' } | null {
  if (!review || !hand || heroTurn) return null;
  if (review.handNumber === hand.handNumber) return hand.phase === 'hand_end' ? { review, which: 'this' } : null;
  const heroDecided = hand.actions.some((action) => action.playerId === heroId);
  return review.handNumber === hand.handNumber - 1 && !heroDecided ? { review, which: 'last' } : null;
}

export interface ReviewRowText {
  street: string;
  /** "You: Call 40" */
  hero: string;
  /** "TAG: Raise to 120 70% · Call 30%" */
  policy: string;
  verdict: string;
  /** Each option's own reasons under its name, then the reasons every option shares (label null). */
  reasons: Array<{ label: string | null; lines: string[] }>;
}

export function reviewRowText(decision: CoachReviewDecision, t: TFunction, nameOf: (id: string) => string): ReviewRowText {
  const { advice, heroAction } = decision;
  const action = heroAction.kind === 'call'
    ? t('panel.review.call', { amount: formatChips(advice.spot.toCall) })
    : optionText(heroAction, t);
  const lines = (reasons: CoachReason[]) => reasons.map((reason) => reasonText(reason, t, nameOf));
  return {
    street: t(`panel.log.street.${decision.street}`),
    hero: t(heroAction.source === 'timeout' ? 'panel.review.you_timeout' : 'panel.review.you', { action }),
    policy: t('panel.review.policy', {
      options: advice.options.map((option) => `${optionText(option, t)} ${frequencyLabel(option.frequency)}`).join(' · '),
    }),
    verdict: t(`panel.review.verdict.${decision.verdict}`),
    reasons: [
      ...advice.options
        .filter((option) => option.reasons.length > 0)
        .map((option) => ({ label: optionText(option, t), lines: lines(option.reasons) })),
      ...(advice.reasons.length > 0 ? [{ label: null, lines: lines(advice.reasons) }] : []),
    ],
  };
}

export function sessionText(session: CoachSessionTally, t: TFunction): string {
  return t('panel.review.session', session);
}
