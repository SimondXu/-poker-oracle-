'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import type { ActionType, GameActionRequiredEvent, GameStateEvent, HandState } from '@aipoker/shared';

/**
 * useSocket — 管理 Socket.io 连接与游戏事件绑定
 *
 * 在 /game/[id] 页面 mount 时调用，unmount 时自动清理。
 */
export function useSocket(roomId: string) {
  const seqRef = useRef(0);
  const {
    setHandState,
    setValidActions,
    clearValidActions,
    setWinnerState,
    setConnectionStatus,
    setError,
    reset,
  } = useGameStore();

  useEffect(() => {
    const socket = getSocket();

    // ── 连接事件 ──
    const onConnect = () => {
      setConnectionStatus('connected');
      // 加入房间
      socket.emit('room:join', { roomId }, (res: { ok: boolean; error?: string }) => {
        if (!res.ok) {
          toast.error(res.error ?? '加入房间失败');
          setError(res.error ?? '加入房间失败');
        }
      });
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
      toast.warning('连接断开，正在重连...', { id: 'reconnect' });
    };

    const onReconnecting = () => {
      setConnectionStatus('reconnecting');
    };

    const onReconnect = () => {
      setConnectionStatus('connected');
      toast.success('已重新连接', { id: 'reconnect' });
    };

    // ── 游戏事件 ──
    const onGameState = (payload: GameStateEvent | HandState) => {
      const hand = 'hand' in payload ? payload.hand : payload;
      setHandState(hand);
    };

    const onActionRequired = (data: GameActionRequiredEvent) => {
      setValidActions(data.validActions, data.timeoutMs);
    };

    const onHandResult = (result: { winnerCards?: string[] }) => {
      clearValidActions();
      if (result.winnerCards?.length) {
        setWinnerState(result.winnerCards);
        setTimeout(() => useGameStore.getState().clearWinnerState(), 3000);
      }
    };

    const onError = (data: { code: string; message: string }) => {
      toast.error(data.message);
      setError(data.message);
    };

    // 绑定事件
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.io.on('reconnect_attempt', onReconnecting);
    socket.io.on('reconnect', onReconnect);
    socket.on('game:state', onGameState);
    socket.on('game:action_required', onActionRequired);
    socket.on('game:hand_result', onHandResult);
    socket.on('error', onError);

    connectSocket();

    return () => {
      socket.emit('room:leave', {}, () => {});
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.io.off('reconnect_attempt', onReconnecting);
      socket.io.off('reconnect', onReconnect);
      socket.off('game:state', onGameState);
      socket.off('game:action_required', onActionRequired);
      socket.off('game:hand_result', onHandResult);
      socket.off('error', onError);
      disconnectSocket();
      reset();
    };
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 发送游戏动作 */
  const sendAction = useCallback(
    (type: ActionType, amount?: number) => {
      const socket = getSocket();
      const seq = ++seqRef.current;

      // 快照当前可操作状态，ack 失败时用于恢复
      const { validActions, timerStartedAt, timerDurationMs } =
        useGameStore.getState();

      // 立即清除（防止重复提交），等待服务端 ack
      useGameStore.getState().clearValidActions();

      socket.emit(
        'game:action',
        { type, amount, seq },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            toast.error(res.error ?? '动作失败，请重试');
            // 恢复快照，让用户可以重新操作（服务端未接受此动作）
            if (validActions) {
              useGameStore.setState({ validActions, timerStartedAt, timerDurationMs });
            }
          }
        },
      );
    },
    [],
  );

  return { sendAction };
}
