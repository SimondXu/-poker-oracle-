'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  selectChampionInfo,
  selectHand,
  selectHandResult,
  selectIsBotsOnlyContinuation,
  selectIsTableFinished,
  selectValidActions,
  selectWinnerIds,
  useGameStore,
} from '@/stores/gameStore';
import { getGameFooterMode, getGameScreenState, type EliminatedDecision } from '../lib/game-screen-state';

type StartNextHand = (source?: 'manual' | 'auto' | 'hotkey') => boolean;
type SpectateAfterElimination = () => Promise<boolean>;

interface UseGameScreenStateOptions {
  currentUserId: string;
  startNextHand: StartNextHand;
  spectateAfterElimination: SpectateAfterElimination;
}

export function useGameScreenState({
  currentUserId,
  startNextHand,
  spectateAfterElimination,
}: UseGameScreenStateOptions) {
  const hand = useGameStore(selectHand);
  const handResult = useGameStore(selectHandResult);
  const winnerIds = useGameStore(selectWinnerIds);
  const isTableFinished = useGameStore(selectIsTableFinished);
  const isBotsOnlyContinuation = useGameStore(selectIsBotsOnlyContinuation);
  const championInfo = useGameStore(selectChampionInfo);
  const validActions = useGameStore(selectValidActions);
  const timerStartedAt = useGameStore((state) => state.timerStartedAt);
  const timerDurationMs = useGameStore((state) => state.timerDurationMs);
  const isWinning = useGameStore((state) => state.isWinning);
  const winnerCards = useGameStore((state) => state.winnerCards);
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const setHandResultPhase = useGameStore((state) => state.setHandResultPhase);
  const [eliminatedDecision, setEliminatedDecision] = useState<EliminatedDecision>(null);

  const screenState = useMemo(
    () =>
      getGameScreenState({
        currentUserId,
        hand,
        handResult,
        validActions,
        eliminatedDecision,
        championInfo,
      }),
    [championInfo, currentUserId, eliminatedDecision, hand, handResult, validActions],
  );

  const isCurrentUserActiveStackPlayer = Boolean(
    screenState.currentPlayer &&
      !screenState.currentPlayer.isBot &&
      screenState.currentPlayer.stack > 0,
  );

  useEffect(() => {
    if (isTableFinished || isCurrentUserActiveStackPlayer) {
      setEliminatedDecision(null);
      return;
    }

    if (hand?.phase === 'hand_end') {
      setEliminatedDecision((current) => current ?? 'pending');
    }
  }, [hand?.handNumber, hand?.phase, isCurrentUserActiveStackPlayer, isTableFinished]);

  useEffect(() => {
    if (hand?.phase !== 'hand_end' || !screenState.canCurrentUserStartNextHand) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      event.preventDefault();
      setHandResultPhase('done');
      startNextHand('hotkey');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hand?.phase, screenState.canCurrentUserStartNextHand, setHandResultPhase, startNextHand]);

  useEffect(() => {
    if (hand?.phase !== 'hand_end' || !screenState.canCurrentUserStartNextHand) {
      return;
    }
    if (handResult?.phase !== 'done') {
      return;
    }

    const timer = setTimeout(() => {
      startNextHand('auto');
    }, 1500);

    return () => {
      clearTimeout(timer);
    };
  }, [hand?.phase, handResult?.phase, screenState.canCurrentUserStartNextHand, startNextHand]);

  const footerMode = useMemo(
    () =>
      getGameFooterMode({
        hasHand: Boolean(hand),
        isMyTurn: screenState.isMyTurn,
        hasValidActions: Boolean(validActions),
        isEliminatedPendingChoice: screenState.isEliminatedPendingChoice,
        isResultPresentationActive: screenState.isResultPresentationActive,
        canCurrentUserStartNextHand: screenState.canCurrentUserStartNextHand,
        isEliminatedSpectating: screenState.isEliminatedSpectating,
        isTableFinished,
        handPhase: hand?.phase ?? null,
      }),
    [
      hand,
      hand?.phase,
      isTableFinished,
      screenState.canCurrentUserStartNextHand,
      screenState.isEliminatedPendingChoice,
      screenState.isEliminatedSpectating,
      screenState.isMyTurn,
      screenState.isResultPresentationActive,
      validActions,
    ],
  );

  const handleStartNextHand = useCallback(() => {
    if (!screenState.canCurrentUserStartNextHand) {
      return;
    }

    setHandResultPhase('done');
    startNextHand('manual');
  }, [screenState.canCurrentUserStartNextHand, setHandResultPhase, startNextHand]);

  const handleDismissWinnerAnnouncement = useCallback(() => {
    if (handResult?.phase !== 'showing') {
      return;
    }

    setHandResultPhase('done');
  }, [handResult?.phase, setHandResultPhase]);

  const handleSpectate = useCallback(async () => {
    const ok = await spectateAfterElimination();
    if (!ok) {
      return;
    }

    setEliminatedDecision('spectating');
  }, [spectateAfterElimination]);

  return {
    hand,
    handResult,
    validActions,
    timerStartedAt,
    timerDurationMs,
    isWinning,
    winnerCards,
    winnerIds,
    connectionStatus,
    isTableFinished,
    isBotsOnlyContinuation,
    championInfo,
    footerMode,
    screenState,
    handleStartNextHand,
    handleDismissWinnerAnnouncement,
    handleSpectate,
  };
}
