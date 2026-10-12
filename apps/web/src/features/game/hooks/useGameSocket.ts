'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import { useT } from '@/i18n';
import { getGameErrorKey } from '../lib/game-errors';
import {
  canRequestNextHand,
  getStreetHoldHand,
  isShowdownHand,
  mapHandResultToStore,
  shouldIgnoreNextHandError,
  startsNewHand,
  type NextHandRequestSource,
} from '../lib/game-socket-controller';
import {
  STREET_HOLD_MS,
  getCommunityRunoutMs,
  getDealDurationMs,
  getHandResultPhaseTimeline,
} from '../lib/table-animation';
import { createHoldQueue, type HoldQueue } from '../lib/hold-queue';
import { useGameSocketTransport } from './useGameSocketTransport';
import { useHandResultPhaseTimers } from './useHandResultPhaseTimers';
import type { ActionType, GameActionRequiredEvent, GameStateEvent, HandResultEvent, HandState } from '@aipoker/shared';

const GAME_START_ACK_TIMEOUT_MS = 5000;
const GAME_SPECTATE_ACK_TIMEOUT_MS = 5000;

export function useGameSocket(
  roomId: string,
  playerId: string,
  playerName: string,
  enabled = true,
) {
  const t = useT();
  const seqRef = useRef(0);
  const setHandState = useGameStore((state) => state.setHandState);
  const setValidActions = useGameStore((state) => state.setValidActions);
  const clearValidActions = useGameStore((state) => state.clearValidActions);
  const setHandResult = useGameStore((state) => state.setHandResult);
  const setHandResultPhase = useGameStore((state) => state.setHandResultPhase);
  const clearHandResult = useGameStore((state) => state.clearHandResult);
  const markNextHandRequested = useGameStore((state) => state.markNextHandRequested);
  const clearNextHandRequested = useGameStore((state) => state.clearNextHandRequested);
  const setConnectionStatus = useGameStore((state) => state.setConnectionStatus);
  const setError = useGameStore((state) => state.setError);
  const reset = useGameStore((state) => state.reset);
  const { clearPhaseTimers, schedulePhaseTimers } = useHandResultPhaseTimers(setHandResultPhase);

  const handleError = useCallback(
    (message: string) => {
      toast.error(message);
      setError(message);
    },
    [setError],
  );

  // While the table holds a moment (the action that closed a street, or a fresh deal), later server
  // events wait and are applied in order once it ends, so nothing skips past what is on screen.
  const holdQueueRef = useRef<HoldQueue | null>(null);
  holdQueueRef.current ??= createHoldQueue();
  const holdQueue = holdQueueRef.current;
  const runoutMsRef = useRef(0);

  const applyGameState = useCallback(
    (hand: HandState, version: number | undefined) => {
      const current = useGameStore.getState().hand;

      if (startsNewHand(current, hand)) {
        clearPhaseTimers();
        clearHandResult();
        clearNextHandRequested();
        runoutMsRef.current = getCommunityRunoutMs(0, hand.communityCards.length);
        setHandState(hand, version);
        // A fresh deal: let the hole cards land before the hero is asked to act.
        if (hand.phase === 'betting_preflop' && hand.actions.length === 0) {
          holdQueue.hold(getDealDurationMs(hand.players.filter((player) => player.status !== 'out').length));
        }
        return;
      }

      const held = getStreetHoldHand(current, hand);
      if (held) {
        setHandState(held, version);
        holdQueue.hold(STREET_HOLD_MS, () => {
          runoutMsRef.current = getCommunityRunoutMs(held.communityCards.length, hand.communityCards.length);
          setHandState(hand, version);
        });
        return;
      }

      runoutMsRef.current = getCommunityRunoutMs(current?.communityCards.length ?? 0, hand.communityCards.length);
      setHandState(hand, version);
    },
    [clearHandResult, clearNextHandRequested, clearPhaseTimers, holdQueue, setHandState],
  );

  const handleGameState = useCallback(
    (payload: GameStateEvent | HandState) => {
      const hand = 'hand' in payload ? payload.hand : payload;
      const version = 'stateVersion' in payload ? payload.stateVersion : undefined;
      holdQueue.run(() => applyGameState(hand, version));
    },
    [applyGameState, holdQueue],
  );

  const handleActionRequired = useCallback(
    (payload: GameActionRequiredEvent) => {
      const receivedAt = Date.now();
      holdQueue.run(() => {
        // The server clock started on receipt; a hold must not hand the hero a longer timer than the server's.
        setValidActions(payload.validActions, Math.max(0, payload.timeoutMs - (Date.now() - receivedAt)));
      });
    },
    [holdQueue, setValidActions],
  );

  const handleHandResult = useCallback(
    (payload: HandResultEvent) => {
      holdQueue.run(() => {
        clearValidActions();
        clearNextHandRequested();
        clearPhaseTimers();

        const currentHand = useGameStore.getState().hand;
        setHandResult(
          mapHandResultToStore({
            result: payload,
            currentHand,
            fallbackPlayerName: t('common.game.player.fallbackName'),
          }),
        );
        schedulePhaseTimers(
          getHandResultPhaseTimeline({ runoutMs: runoutMsRef.current, isShowdown: isShowdownHand(currentHand) }),
        );
      });
    },
    [
      clearNextHandRequested,
      clearPhaseTimers,
      clearValidActions,
      holdQueue,
      schedulePhaseTimers,
      setHandResult,
      t,
    ],
  );

  const handleDisconnected = useCallback(() => {
    setConnectionStatus('disconnected');
    clearNextHandRequested();
    toast.warning(t('common.game.toast.reconnecting'), { id: 'reconnect' });
  }, [clearNextHandRequested, setConnectionStatus, t]);

  const handleAuthError = useCallback(() => {
    const message = t('common.game.toast.sessionFailed');
    toast.error(message);
    setError(message);
  }, [setError, t]);

  useEffect(() => {
    if (!enabled) {
      holdQueue.clear();
      clearPhaseTimers();
      reset();
    }
  }, [clearPhaseTimers, enabled, holdQueue, reset]);

  useEffect(() => () => holdQueue.clear(), [holdQueue]);

  useGameSocketTransport({
    roomId,
    playerId,
    playerName,
    enabled,
    onConnected: () => {
      setConnectionStatus('connected');
    },
    onDisconnected: handleDisconnected,
    onReconnecting: () => {
      setConnectionStatus('reconnecting');
    },
    onReconnected: () => {
      setConnectionStatus('connected');
      toast.success(t('common.game.toast.reconnected'), { id: 'reconnect' });
    },
    onGameState: handleGameState,
    onActionRequired: handleActionRequired,
    onHandResult: handleHandResult,
    onError: handleError,
    onCleanup: () => {
      holdQueue.clear();
      clearPhaseTimers();
      reset();
    },
    onAuthError: handleAuthError,
  });

  const sendAction = useCallback(
    (type: ActionType, amount?: number) => {
      if (!enabled || !playerId) {
        toast.error(t('common.game.toast.invalidPlayer'));
        return;
      }

      const socket = getSocket();
      const seq = ++seqRef.current;
      const { validActions, timerStartedAt, timerDurationMs, stateVersion } = useGameStore.getState();

      useGameStore.getState().clearValidActions();

      socket.emit(
        'game:action',
        {
          roomId,
          type,
          amount,
          seq,
          ...(stateVersion !== null ? { expectedVersion: stateVersion } : {}),
        },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            toast.error(t(getGameErrorKey(res.error, 'common.game.toast.actionFailed')));
            if (validActions) {
              useGameStore.setState({ validActions, timerStartedAt, timerDurationMs });
            }
          }
        },
      );
    },
    [enabled, playerId, roomId, t],
  );

  const startNextHand = useCallback(
    (source: NextHandRequestSource = 'manual'): boolean => {
      const store = useGameStore.getState();
      if (!canRequestNextHand({ enabled, roomId, nextHandRequested: store.nextHandRequested })) {
        return false;
      }

      markNextHandRequested();
      getSocket()
        .timeout(GAME_START_ACK_TIMEOUT_MS)
        .emit(
          'game:start',
          { roomId },
          (timeoutError: Error | null, res?: { ok: boolean; error?: string }) => {
            if (timeoutError || !res) {
              clearNextHandRequested();
              if (source === 'manual') {
                toast.error(t('common.game.toast.requestTimeout'));
              }
              return;
            }

            if (res.ok) {
              return;
            }

            clearNextHandRequested();
            if (shouldIgnoreNextHandError(source, res.error)) {
              return;
            }

            toast.error(t(getGameErrorKey(res.error, 'common.game.toast.nextHandFailed')));
          },
        );

      return true;
    },
    [clearNextHandRequested, enabled, markNextHandRequested, roomId, t],
  );

  const spectateAfterElimination = useCallback(async (): Promise<boolean> => {
    if (!enabled || !playerId) {
      toast.error(t('common.game.toast.invalidPlayer'));
      return false;
    }

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      getSocket()
        .timeout(GAME_SPECTATE_ACK_TIMEOUT_MS)
        .emit(
          'game:spectate',
          { roomId },
          (timeoutError: Error | null, ack?: { ok: boolean; error?: string }) => {
            if (timeoutError || !ack) {
              resolve({ ok: false, error: 'timeout' });
              return;
            }

            resolve(ack);
          },
        );
    });

    if (result.ok) {
      return true;
    }

    toast.error(
      t(
        result.error === 'timeout'
          ? 'common.game.toast.spectateTimeout'
          : result.error === 'not_eliminated'
          ? 'common.game.toast.spectateNotAllowed'
          : getGameErrorKey(result.error, 'common.game.toast.spectateFailed'),
      ),
    );
    return false;
  }, [enabled, playerId, roomId, t]);

  return { sendAction, startNextHand, spectateAfterElimination };
}
