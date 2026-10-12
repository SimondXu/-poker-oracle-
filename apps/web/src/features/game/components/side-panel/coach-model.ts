/**
 * Pure helpers for the Coach tab. Everything shown comes from the training
 * analysis (`trainingData`) or from the hand state; nothing is estimated here.
 * `coach-model.test.ts` covers it.
 */
import type { HandState } from '@aipoker/shared';
import type { TFunction } from '@/i18n';
import type { GameTrainingData } from '../../lib/training-analysis';

export type CoachData = GameTrainingData;

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

/** Fraction of the equity bar that the hand strength fills (preflop: how far from the top of the range). */
export function strengthFill(data: CoachData): number {
  const { strength } = data;
  return Math.min(1, Math.max(0, strength.kind === 'top_percent' ? 1 - strength.value : strength.value));
}

/** Whether the hand's equity beats the equity the price demands; `null` when either side is unknown. */
export function clearsPrice(data: CoachData): boolean | null {
  if (data.strength.kind !== 'equity' || data.winRequirement === undefined) return null;
  return data.strength.value >= data.winRequirement;
}

/**
 * The reason sentence, composed from the same numbers and suggestion the
 * engine used. The engine's own `suggestionReason` is Chinese-only and mixes in
 * English scenario names, so it is not shown as is.
 */
export function coachReason(data: CoachData, t: TFunction): string | null {
  if (!data.suggestion) return null;

  const { strength, suggestion } = data;
  if (strength.kind === 'top_percent') {
    // `value` is the top-percent rank (0.08 = top 8%); "beats 92%" reads the right way round for a learner.
    const lead = t('panel.coach.reason.pre', { percent: percent(1 - strength.value), position: data.position ?? '—' });
    return `${lead} ${t(`panel.coach.reason.pre.${suggestion}`)}`;
  }
  const needsPrice = data.winRequirement !== undefined && suggestion !== 'raise' && suggestion !== 'check';
  // The stats row shows raw pot odds; say why the requirement can sit a point or two above them.
  const odds = data.potOdds !== undefined ? percent(data.potOdds) : null;
  const need = data.winRequirement !== undefined ? percent(data.winRequirement) : null;
  const lead = !needsPrice
    ? t('panel.coach.reason.post', { percent: percent(strength.value) })
    : odds !== null && odds !== need
      ? t('panel.coach.reason.post_need_margin', { percent: percent(strength.value), need: need ?? 0, odds })
      : t('panel.coach.reason.post_need', { percent: percent(strength.value), need: need ?? 0 });
  return `${lead} ${t(`panel.coach.reason.post.${suggestion}`)}`;
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
