import type { Phase, PlayerStatus } from '@aipoker/shared';

export interface CommunityRevealStep {
  count: number;
  delayMs: number;
}

export type ResultAnimationPhase = 'announcing' | 'revealing' | 'showing' | 'done' | undefined;

const MIN_SECOND_PASS_DELAY = 0.62;
const SECOND_PASS_PER_PLAYER_DELAY = 0.08;
/** Delay between seats in one pass of the hole-card deal, seconds. */
export const DEAL_STAGGER_SEC = 0.14;
const CARD_ANIMATION_MS = 200;

/**
 * How long the action that closes a street (or the hand) stays on the table, with its chips,
 * before the chips are swept and the next card is dealt.
 */
export const STREET_HOLD_MS = 900;

const FLOP_STAGGER_MS = 160;
const STREET_BEAT_MS = 780;
/** Hole cards are face up for this long before the winner is named. */
const SHOWDOWN_REVEAL_MS = 900;
/** Winner, banner and pot award stay up this long before the result phase is done. */
const RESULT_SHOWING_MS = 2500;
/** After the result phase is done, the next hand starts on its own this much later. */
export const NEXT_HAND_AUTO_START_MS = 2000;

export interface HandResultPhaseTimeline {
  /** `null` when nobody shows cards (everyone else folded). */
  revealingMs: number | null;
  showingMs: number;
  doneMs: number;
  nextHandAutoStartMs: number;
}

/**
 * New board cards, one step per card. The closing action was already held for `STREET_HOLD_MS`,
 * so the first new card lands at once; flop cards follow each other quickly and every later street
 * of an all-in runout gets its own beat.
 */
export function buildCommunityRevealSteps(previousCount: number, nextCount: number): CommunityRevealStep[] {
  const steps: CommunityRevealStep[] = [];
  let elapsedMs = 0;
  for (let count = previousCount + 1; count <= nextCount; count += 1) {
    if (count > previousCount + 1) {
      elapsedMs += count <= 3 ? FLOP_STAGGER_MS : STREET_BEAT_MS;
    }
    steps.push({ count, delayMs: elapsedMs });
  }
  return steps;
}

/** Time until the last new board card has landed (0 when the board does not grow). */
export function getCommunityRunoutMs(previousCount: number, nextCount: number): number {
  const last = buildCommunityRevealSteps(previousCount, nextCount).at(-1);
  return last ? last.delayMs + CARD_ANIMATION_MS : 0;
}

/** Time until every hole card of a fresh hand has landed. */
export function getDealDurationMs(playerCount: number): number {
  if (playerCount <= 0) return 0;
  const lastCardStartSec = (playerCount - 1) * DEAL_STAGGER_SEC + getHoleCardSecondPassDelay(playerCount);
  return Math.round(lastCardStartSec * 1000) + CARD_ANIMATION_MS;
}

export function shouldRevealShowdownCards(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'revealing' || resultPhase === 'showing' || resultPhase === 'done';
}

export function shouldShowWinnerIdentity(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing' || resultPhase === 'done';
}

/** The result banner stays up from the winner reveal until the next hand. */
export function shouldShowWinnerAnnouncement(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing' || resultPhase === 'done';
}

export function shouldAnimatePotAward(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing';
}

export function getDisplayedSeatStack(
  settledStack: number,
  payoutAmount: number | undefined,
  resultPhase: ResultAnimationPhase,
): number {
  if ((resultPhase !== 'announcing' && resultPhase !== 'revealing') || payoutAmount === undefined) {
    return settledStack;
  }

  return Math.max(0, settledStack - payoutAmount);
}

export function getSeatDealOrderIndex(
  occupiedSeatIndices: number[],
  buttonSeat: number | null,
  seatIndex: number,
): number {
  if (occupiedSeatIndices.length === 0) {
    return 0;
  }

  const sortedSeatIndices = [...occupiedSeatIndices].sort((left, right) => left - right);
  if (buttonSeat === null) {
    return Math.max(0, sortedSeatIndices.indexOf(seatIndex));
  }

  const firstSeatIndex =
    sortedSeatIndices.find((candidateSeatIndex) => candidateSeatIndex > buttonSeat) ??
    sortedSeatIndices[0];
  if (firstSeatIndex === undefined) {
    return 0;
  }

  const firstDealIndex = sortedSeatIndices.indexOf(firstSeatIndex);
  const seatDealIndex = sortedSeatIndices.indexOf(seatIndex);

  if (seatDealIndex === -1) {
    return 0;
  }

  return (seatDealIndex - firstDealIndex + sortedSeatIndices.length) % sortedSeatIndices.length;
}

export function getHoleCardSecondPassDelay(activePlayerCount: number): number {
  return Number(
    Math.max(
      MIN_SECOND_PASS_DELAY,
      MIN_SECOND_PASS_DELAY + Math.max(0, activePlayerCount - 2) * SECOND_PASS_PER_PLAYER_DELAY,
    ).toFixed(2),
  );
}

/**
 * Result phases, measured from the moment the result is applied (after the closing-action hold).
 * A showdown waits for the board runout, shows the cards, then names the winner; an uncontested
 * hand names the winner at once.
 */
export function getHandResultPhaseTimeline(input: { runoutMs: number; isShowdown: boolean }): HandResultPhaseTimeline {
  const revealingMs = input.isShowdown ? input.runoutMs : null;
  const showingMs = input.isShowdown ? input.runoutMs + SHOWDOWN_REVEAL_MS : input.runoutMs;
  return {
    revealingMs,
    showingMs,
    doneMs: showingMs + RESULT_SHOWING_MS,
    nextHandAutoStartMs: NEXT_HAND_AUTO_START_MS,
  };
}

export function shouldDimLosingSeat(input: {
  phase: Phase;
  resultPhase: ResultAnimationPhase;
  isWinner: boolean;
  status: PlayerStatus;
}): boolean {
  if (input.phase !== 'hand_end') {
    return false;
  }

  if (!shouldShowWinnerIdentity(input.resultPhase) || input.isWinner) {
    return false;
  }

  return input.status === 'active' || input.status === 'all_in';
}
