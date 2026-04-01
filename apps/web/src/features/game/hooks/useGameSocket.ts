'use client';

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import { getGameStartErrorMessage } from '../lib/game-start-errors';
import {
  canRequestNextHand,
  mapHandResultToStore,
  shouldIgnoreNextHandError,
  type NextHandRequestSource,
} from '../lib/game-socket-controller';
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

  const handleGameState = useCallback(
    (payload: GameStateEvent | HandState) => {
      const hand = 'hand' in payload ? payload.hand : payload;
      const version = 'stateVersion' in payload ? payload.stateVersion : undefined;

      if (hand.phase === 'betting_preflop') {
        clearPhaseTimers();
        clearHandResult();
        clearNextHandRequested();
      }

      setHandState(hand, version);
    },
    [clearHandResult, clearNextHandRequested, clearPhaseTimers, setHandState],
  );

  const handleActionRequired = useCallback(
    (payload: GameActionRequiredEvent) => {
      setValidActions(payload.validActions, payload.timeoutMs);
    },
    [setValidActions],
  );

  const handleHandResult = useCallback(
    (payload: HandResultEvent) => {
      clearValidActions();
      clearNextHandRequested();
      clearPhaseTimers();

      const currentHand = useGameStore.getState().hand;
      setHandResult(
        mapHandResultToStore({
          result: payload,
          currentHand,
        }),
      );
      schedulePhaseTimers();
    },
    [
      clearNextHandRequested,
      clearPhaseTimers,
      clearValidActions,
      schedulePhaseTimers,
      setHandResult,
    ],
  );

  const handleDisconnected = useCallback(() => {
    setConnectionStatus('disconnected');
    clearNextHandRequested();
    toast.warning('连接断开，正在重连...', { id: 'reconnect' });
  }, [clearNextHandRequested, setConnectionStatus]);

  const handleAuthError = useCallback(() => {
    toast.error('会话初始化失败，请刷新重试');
    setError('会话初始化失败');
  }, [setError]);

  useEffect(() => {
    if (!enabled) {
      clearPhaseTimers();
      reset();
    }
  }, [clearPhaseTimers, enabled, reset]);

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
      toast.success('已重新连接', { id: 'reconnect' });
    },
    onGameState: handleGameState,
    onActionRequired: handleActionRequired,
    onHandResult: handleHandResult,
    onError: handleError,
    onCleanup: () => {
      clearPhaseTimers();
      reset();
    },
    onAuthError: handleAuthError,
  });

  const sendAction = useCallback(
    (type: ActionType, amount?: number) => {
      if (!enabled || !playerId) {
        toast.error('玩家身份无效，请返回大厅重试');
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
            toast.error(res.error ?? '动作失败，请重试');
            if (validActions) {
              useGameStore.setState({ validActions, timerStartedAt, timerDurationMs });
            }
          }
        },
      );
    },
    [enabled, playerId, roomId],
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
                toast.error('请求超时，请稍后重试');
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

            toast.error(getGameStartErrorMessage(res.error, '开始下一手失败'));
          },
        );

      return true;
    },
    [clearNextHandRequested, enabled, markNextHandRequested, roomId],
  );

  const spectateAfterElimination = useCallback(async (): Promise<boolean> => {
    if (!enabled || !playerId) {
      toast.error('玩家身份无效，请返回大厅重试');
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

    const message = result.error === 'timeout'
      ? '进入观战超时，请稍后重试'
      : result.error === 'not_eliminated'
      ? '当前还不能进入观战'
      : '进入观战失败，请稍后重试';
    toast.error(message);
    return false;
  }, [enabled, playerId, roomId]);

  return { sendAction, startNextHand, spectateAfterElimination };
}
