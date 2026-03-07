import type { ActionType, HandState, ValidActions } from '@aipoker/shared';
import { getPositionName } from '../../../lib/utils.ts';
import type { HandResult } from '../../../stores/gameStore.ts';
import { shouldAnimatePotAward, shouldRevealShowdownCards, shouldShowWinnerAnnouncement } from './table-animation.ts';

export type EliminatedDecision = 'pending' | 'spectating' | null;
export type TrainingSuggestion = Extract<ActionType, 'check' | 'call'>;
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
  shouldShowResultModal: boolean;
  shouldRunAwardAnimation: boolean;
  pot: number;
  championStack: number | null;
  winnerBestCardsByPlayer: Record<string, string[]>;
  payoutAmountsByPlayer: Record<string, number>;
  trainingData: { position?: string; suggestion?: TrainingSuggestion } | undefined;
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
  const tableSeats = input.hand?.maxSeats ?? 6;
  const positionLabel =
    input.hand && currentSeat !== undefined
      ? getPositionName(currentSeat, input.hand.buttonMarkerSeat, tableSeats)
      : undefined;

  const isMyTurn = input.validActions !== null && currentSeat === input.hand?.currentActorSeat;
  const isTableFinished = Boolean(input.handResult?.table.isTableFinished);
  const isEliminatedPendingChoice = input.eliminatedDecision === 'pending' && !isCurrentUserActiveStackPlayer && !isTableFinished;
  const isEliminatedSpectating = input.eliminatedDecision === 'spectating' && !isCurrentUserActiveStackPlayer && !isTableFinished;
  const isResultPresentationActive = Boolean(input.handResult && input.handResult.phase !== 'done');
  const shouldRevealOutcome = shouldRevealShowdownCards(input.handResult?.phase);
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

  const trainingData =
    isMyTurn && input.validActions
      ? {
          ...(positionLabel ? { position: positionLabel } : {}),
          ...(input.validActions.canCheck
            ? { suggestion: 'check' as const }
            : input.validActions.canCall
              ? { suggestion: 'call' as const }
              : {}),
        }
      : undefined;

  return {
    currentPlayer,
    canCurrentUserStartNextHand,
    positionLabel,
    isMyTurn,
    isEliminatedPendingChoice,
    isEliminatedSpectating,
    isResultPresentationActive,
    shouldRevealOutcome,
    shouldShowResultModal,
    shouldRunAwardAnimation,
    pot,
    championStack,
    winnerBestCardsByPlayer,
    payoutAmountsByPlayer,
    trainingData,
  };
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
