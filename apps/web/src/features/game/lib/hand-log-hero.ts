/**
 * One-line outcome of a finished hand for the hero ("You lost 120 · folded
 * turn"), built only from the hand state and its payouts. Pure; structured
 * data, the panel turns it into text. `hand-log-hero.test.ts` covers it.
 */
import type { HandState } from '@aipoker/shared';

import { streetFromPhase, summarizeResult, type HandLogResultInput, type HandLogStreetName } from './hand-log-model.ts';

export interface HeroHandSummary {
  outcome: 'won' | 'lost' | 'even';
  /** Chips won (positive) or lost (negative) in this hand: payout minus what the hero put in. */
  net: number;
  /** Street of the hero's fold, if the hero folded. */
  foldedStreet: HandLogStreetName | null;
  /** Server hand name when the hero won at showdown (`handRankKey` translates it). */
  handRank: string | null;
  /** The hero won because everyone else folded. */
  uncontested: boolean;
}

/** `null` when the hero was not dealt into the hand (spectating, eliminated) or has no hand state. */
export function summarizeHeroHand(
  hand: HandState,
  result: HandLogResultInput,
  heroId: string | null | undefined,
): HeroHandSummary | null {
  if (!heroId) return null;
  const hero = hand.players.find((player) => player.id === heroId);
  if (!hero || hero.status === 'out' || hero.status === 'sitting_out') return null;

  const line = summarizeResult(result).find((entry) => entry.playerId === heroId);
  const payout = line?.amount ?? 0;
  const net = payout - hero.handCommitted;
  const foldAction = hand.actions.find((action) => action.playerId === heroId && action.type === 'fold');
  const foldedStreet = foldAction ? streetFromPhase(foldAction.phase) : null;

  return {
    outcome: net > 0 ? 'won' : net < 0 ? 'lost' : 'even',
    net,
    foldedStreet,
    handRank: line?.handRankName ?? null,
    uncontested: Boolean(line) && !line?.handRankName,
  };
}
