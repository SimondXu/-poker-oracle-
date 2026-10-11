/**
 * Ring buffer of finished-hand summaries for the log panel. The store only
 * holds the current hand, so the panel remembers a few finished ones.
 * Pure; `hand-log-history.test.ts` covers it.
 */
import type { HandState } from '@aipoker/shared';

import { summarizeHeroHand, type HeroHandSummary } from './hand-log-hero.ts';
import { buildHandLog, type HandLog, type HandLogResultInput, type HandLogResultLine } from './hand-log-model.ts';

export const HAND_LOG_HISTORY_LIMIT = 12;

export interface HandLogSummary {
  roomId: string;
  handNumber: number;
  board: string[];
  results: HandLogResultLine[];
  potTotal: number;
  /** The full log, so a collapsed hand can be expanded again. */
  log: HandLog;
  /** What happened to the hero; `null` when the hero was not in the hand. */
  hero: HeroHandSummary | null;
}

export function summarizeFinishedHand(
  hand: HandState,
  result: HandLogResultInput,
  heroId?: string | null,
): HandLogSummary {
  const log = buildHandLog(hand, result);
  return {
    roomId: hand.roomId,
    handNumber: hand.handNumber,
    board: [...hand.communityCards],
    results: log.results,
    potTotal: result.potTotal,
    log,
    hero: summarizeHeroHand(hand, result, heroId),
  };
}

/**
 * Add (or replace, keyed by handNumber) a summary. Switching room drops the
 * old room's hands. Returns the same array when nothing changed so callers can
 * skip notifying subscribers.
 */
export function recordHandSummary(
  history: readonly HandLogSummary[],
  summary: HandLogSummary,
  limit: number = HAND_LOG_HISTORY_LIMIT,
): readonly HandLogSummary[] {
  const sameRoom = history.filter((entry) => entry.roomId === summary.roomId);
  const existing = sameRoom.find((entry) => entry.handNumber === summary.handNumber);
  if (existing && sameRoom.length === history.length && JSON.stringify(existing) === JSON.stringify(summary)) {
    return history;
  }
  const next = [...sameRoom.filter((entry) => entry.handNumber !== summary.handNumber), summary].sort(
    (a, b) => a.handNumber - b.handNumber,
  );
  return next.slice(-limit);
}

/** Finished hands to list above the current hand, oldest first. */
export function selectPastHands(
  history: readonly HandLogSummary[],
  roomId: string | null,
  currentHandNumber: number | null,
): HandLogSummary[] {
  return history.filter((entry) => entry.roomId === roomId && entry.handNumber !== currentHandNumber);
}
