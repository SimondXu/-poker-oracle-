import type { Phase, PlayerStatus } from '@aipoker/shared';

export interface CommunityRevealStep {
  count: number;
  delayMs: number;
}

export type ResultAnimationPhase = 'announcing' | 'showing' | 'done' | undefined;

const MIN_SECOND_PASS_DELAY = 0.38;
const SECOND_PASS_PER_PLAYER_DELAY = 0.05;

const HAND_RESULT_PHASE_TIMELINE = {
  announcingMs: 1200,
  doneMs: 3800,
} as const;

export function buildCommunityRevealSteps(previousCount: number, nextCount: number): CommunityRevealStep[] {
  if (nextCount <= previousCount) {
    return [];
  }

  const steps: CommunityRevealStep[] = [];
  const flopStartDelayMs = previousCount === 0 ? 120 : 0;
  const flopStaggerMs = 110;
  const streetBeatMs = 360;

  let elapsedMs = 0;
  for (let count = previousCount + 1; count <= nextCount; count += 1) {
    if (count <= 3) {
      elapsedMs = flopStartDelayMs + (count - 1) * flopStaggerMs;
    } else if (count === previousCount + 1) {
      elapsedMs = streetBeatMs;
    } else {
      elapsedMs += streetBeatMs;
    }

    steps.push({ count, delayMs: elapsedMs });
  }

  return steps;
}

export function shouldRevealShowdownCards(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing' || resultPhase === 'done';
}

export function shouldShowWinnerAnnouncement(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing';
}

export function shouldAnimatePotAward(resultPhase: ResultAnimationPhase): boolean {
  return resultPhase === 'showing';
}

export function getDisplayedSeatStack(
  settledStack: number,
  payoutAmount: number | undefined,
  resultPhase: ResultAnimationPhase,
): number {
  if (resultPhase !== 'announcing' || payoutAmount === undefined) {
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

export function getHandResultPhaseTimeline() {
  return HAND_RESULT_PHASE_TIMELINE;
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

  if (!shouldRevealShowdownCards(input.resultPhase) || input.isWinner) {
    return false;
  }

  return input.status === 'active' || input.status === 'all_in';
}
