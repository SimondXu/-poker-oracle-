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
import {
  canAdvanceToNextHand,
  getGameFooterMode,
  getGameScreenState,
  type EliminatedDecision,
} from '../lib/game-screen-state';
import { NEXT_HAND_AUTO_START_MS } from '../lib/table-animation';

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
  // Hero's chips at the first hand of the table, for the end-of-table result.
  const [sessionStart, setSessionStart] = useState<{ roomId: string; stack: number } | null>(null);

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
    if (
      !canAdvanceToNextHand({
        handPhase: hand?.phase ?? null,
        handResultPhase: handResult?.phase ?? null,
        canCurrentUserStartNextHand: screenState.canCurrentUserStartNextHand,
      })
    ) {
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
      startNextHand('hotkey');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hand?.phase, handResult?.phase, screenState.canCurrentUserStartNextHand, startNextHand]);

  useEffect(() => {
    // Space / the button work as soon as the winner is shown; the automatic start waits for `done`.
    if (
      handResult?.phase !== 'done' ||
      !canAdvanceToNextHand({
        handPhase: hand?.phase ?? null,
        handResultPhase: handResult.phase,
        canCurrentUserStartNextHand: screenState.canCurrentUserStartNextHand,
      })
    ) {
      return;
    }

    const timer = setTimeout(() => {
      startNextHand('auto');
    }, NEXT_HAND_AUTO_START_MS);

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
        handResultPhase: handResult?.phase ?? null,
      }),
    [
      hand,
      hand?.phase,
      handResult?.phase,
      isTableFinished,
      screenState.canCurrentUserStartNextHand,
      screenState.isEliminatedPendingChoice,
      screenState.isEliminatedSpectating,
      screenState.isMyTurn,
      screenState.isResultPresentationActive,
      validActions,
    ],
  );

  const heroInHand = hand?.players.find((player) => player.id === currentUserId);
  const heroStartStack =
    hand?.handNumber === 1 && heroInHand ? heroInHand.stack + heroInHand.handCommitted : null;
  useEffect(() => {
    if (hand && heroStartStack !== null) {
      setSessionStart((current) => (current?.roomId === hand.roomId ? current : { roomId: hand.roomId, stack: heroStartStack }));
    }
  }, [hand, heroStartStack]);
  const startStack = sessionStart?.roomId === hand?.roomId ? sessionStart?.stack ?? null : null;
  const heroResult = heroInHand
    ? { stack: heroInHand.stack, net: startStack !== null ? heroInHand.stack - startStack : null }
    : null;

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
    heroResult,
    handleStartNextHand,
    handleDismissWinnerAnnouncement,
    handleSpectate,
  };
}

export type GameScreen = ReturnType<typeof useGameScreenState>;
