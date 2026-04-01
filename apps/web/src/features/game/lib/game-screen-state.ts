import type { HandState, ValidActions } from '@aipoker/shared';
import type { HandResult } from '../../../stores/gameStore.ts';
import {
  getPositionLabelForSeat,
  getTrainingData,
  type GameTrainingData,
} from './training-analysis.ts';
import {
  shouldAnimatePotAward,
  shouldRevealShowdownCards,
  shouldShowWinnerAnnouncement,
  shouldShowWinnerIdentity,
} from './table-animation.ts';

export type EliminatedDecision = 'pending' | 'spectating' | null;
export type GameFooterMode =
  | 'actions'
  | 'eliminated-choice'
  | 'result-presentation'
  | 'next-hand'
  | 'eliminated-spectating'
  | 'table-finished'
  | 'waiting'
  | 'idle';

export interface GameScreenState {
  currentPlayer: HandState['players'][number] | undefined;
  canCurrentUserStartNextHand: boolean;
  positionLabel: string | undefined;
  isMyTurn: boolean;
  isEliminatedPendingChoice: boolean;
  isEliminatedSpectating: boolean;
  isResultPresentationActive: boolean;
  shouldRevealOutcome: boolean;
  shouldHighlightWinners: boolean;
  shouldShowResultModal: boolean;
  shouldRunAwardAnimation: boolean;
  pot: number;
  championStack: number | null;
  winnerBestCardsByPlayer: Record<string, string[]>;
  payoutAmountsByPlayer: Record<string, number>;
  trainingData: GameTrainingData | undefined;
}

interface GetGameScreenStateInput {
  currentUserId: string;
  hand: HandState | null;
  handResult: HandResult | null;
  validActions: ValidActions | null;
  eliminatedDecision: EliminatedDecision;
  championInfo: { id: string; name: string } | null;
}

export function getGameScreenState(input: GetGameScreenStateInput): GameScreenState {
  const currentPlayer = input.hand?.players.find((player) => player.id === input.currentUserId);
  const isCurrentUserActiveStackPlayer = Boolean(
    currentPlayer && !currentPlayer.isBot && currentPlayer.stack > 0,
  );
  const canCurrentUserStartNextHand = Boolean(input.handResult?.table.canStartNextHand) && isCurrentUserActiveStackPlayer;
  const currentSeat = currentPlayer?.seatIndex;
  const positionLabel = getPositionLabelForSeat(input.hand, currentSeat);

  const isMyTurn = input.validActions !== null && currentSeat === input.hand?.currentActorSeat;
  const isTableFinished = Boolean(input.handResult?.table.isTableFinished);
  const isEliminatedPendingChoice = input.eliminatedDecision === 'pending' && !isCurrentUserActiveStackPlayer && !isTableFinished;
  const isEliminatedSpectating = input.eliminatedDecision === 'spectating' && !isCurrentUserActiveStackPlayer && !isTableFinished;
  const isResultPresentationActive = Boolean(input.handResult && input.handResult.phase !== 'done');
  const shouldRevealOutcome = shouldRevealShowdownCards(input.handResult?.phase);
  const shouldHighlightWinners = shouldShowWinnerIdentity(input.handResult?.phase);
  const shouldShowResultModal = shouldShowWinnerAnnouncement(input.handResult?.phase);
  const shouldRunAwardAnimation = shouldAnimatePotAward(input.handResult?.phase);

  const potFromSettledPots = input.hand?.pots.reduce((sum, pot) => sum + pot.amount, 0) ?? 0;
  const potFromCommitted = input.hand?.players.reduce((sum, player) => sum + player.handCommitted, 0) ?? 0;
  const pot = Math.max(potFromSettledPots, potFromCommitted);
  const championPlayerId = input.championInfo?.id;
  const championStack =
    championPlayerId
      ? (input.hand?.players.find((player) => player.id === championPlayerId)?.stack ?? null)
      : null;

  const winnerBestCardsByPlayer: Record<string, string[]> = {};
  for (const payout of input.handResult?.payouts ?? []) {
    winnerBestCardsByPlayer[payout.playerId] = payout.bestCards;
  }

  const payoutAmountsByPlayer: Record<string, number> = {};
  for (const payout of input.handResult?.payouts ?? []) {
    payoutAmountsByPlayer[payout.playerId] = payout.amount;
  }

  const trainingData = getTrainingData({
    currentUserId: input.currentUserId,
    hand: input.hand,
    validActions: input.validActions,
    isMyTurn,
  });

  return {
    currentPlayer,
    canCurrentUserStartNextHand,
    positionLabel,
    isMyTurn,
    isEliminatedPendingChoice,
    isEliminatedSpectating,
    isResultPresentationActive,
    shouldRevealOutcome,
    shouldHighlightWinners,
    shouldShowResultModal,
    shouldRunAwardAnimation,
    pot,
    championStack,
    winnerBestCardsByPlayer,
    payoutAmountsByPlayer,
    trainingData,
  };
}

export function canAdvanceToNextHand(input: {
  handPhase: HandState['phase'] | null;
  handResultPhase: HandResult['phase'] | null;
  canCurrentUserStartNextHand: boolean;
}): boolean {
  return input.handPhase === 'hand_end'
    && input.handResultPhase === 'done'
    && input.canCurrentUserStartNextHand;
}

export function getGameFooterMode(input: {
  hasHand: boolean;
  isMyTurn: boolean;
  hasValidActions: boolean;
  isEliminatedPendingChoice: boolean;
  isResultPresentationActive: boolean;
  canCurrentUserStartNextHand: boolean;
  isEliminatedSpectating: boolean;
  isTableFinished: boolean;
  handPhase: HandState['phase'] | null;
}): GameFooterMode {
  if (input.isMyTurn && input.hasValidActions) {
    return 'actions';
  }

  if (input.isEliminatedPendingChoice) {
    return 'eliminated-choice';
  }

  if (input.isResultPresentationActive) {
    return 'result-presentation';
  }

  if (input.handPhase === 'hand_end' && input.canCurrentUserStartNextHand) {
    return 'next-hand';
  }

  if (input.isEliminatedSpectating) {
    return 'eliminated-spectating';
  }

  if (input.handPhase === 'hand_end' && input.isTableFinished) {
    return 'table-finished';
  }

  if (input.hasHand) {
    return 'waiting';
  }

  return 'idle';
}
