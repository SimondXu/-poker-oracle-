'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { ensureGuestSession } from '@/lib/auth-session';
import { getGameStartErrorMessage } from '@/lib/game-start-errors';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import { useGameStore } from '@/stores/gameStore';
import { evaluateHandRanking, getHandRankDisplayName } from '@/lib/hand-evaluator';
import type { ActionType, GameActionRequiredEvent, GameStateEvent, HandResultEvent, HandState } from '@aipoker/shared';
import type { PayoutInfo, HandResult } from '@/stores/gameStore';

const GAME_START_ACK_TIMEOUT_MS = 5000;

/**
 * useSocket — 管理 Socket.io 连接与游戏事件绑定
 *
 * 在 /game/[id] 页面 mount 时调用，unmount 时自动清理。
 */
export function useSocket(
  roomId: string,
  playerId: string,
  playerName: string,
  enabled = true,
) {
  const seqRef = useRef(0);
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const {
    setHandState,
    setValidActions,
    clearValidActions,
    setHandResult,
    setHandResultPhase,
    clearHandResult,
    markNextHandRequested,
    clearNextHandRequested,
    setConnectionStatus,
    setError,
    reset,
  } = useGameStore();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket = getSocket();

    // ── 连接事件 ──
    const onConnect = () => {
      setConnectionStatus('connected');

      if (!playerId || !playerName) {
        setError('玩家身份缺失，请返回首页重新进入');
        return;
      }

      // 加入房间
      socket.emit(
        'room:join',
        { roomId, playerName, stack: 1000, isBot: false },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            toast.error(res.error ?? '加入房间失败');
            setError(res.error ?? '加入房间失败');
          }
        },
      );
    };

    const onDisconnect = () => {
      setConnectionStatus('disconnected');
      clearNextHandRequested();
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
      const version = 'stateVersion' in payload ? payload.stateVersion : undefined;

      // 新手牌开始时清除上一手的结果状态
      if (hand.phase === 'betting_preflop') {
        for (const timer of phaseTimersRef.current) clearTimeout(timer);
        phaseTimersRef.current = [];
        clearHandResult();
        clearNextHandRequested();
      }

      setHandState(hand, version);
    };

    const onActionRequired = (data: GameActionRequiredEvent) => {
      setValidActions(data.validActions, data.timeoutMs);
    };

    const onHandResult = (result: HandResultEvent) => {
      clearValidActions();
      clearNextHandRequested();

      // 清除旧的phase定时器
      for (const timer of phaseTimersRef.current) clearTimeout(timer);
      phaseTimersRef.current = [];

      // 从 gameStore 获取当前手牌状态中的玩家信息和公共牌
      const currentHand = useGameStore.getState().hand;
      const communityCards = currentHand?.communityCards ?? [];

      // 聚合每个玩家的总收益
      const payoutsByPlayer = new Map<string, number>();
      for (const p of result.payouts) {
        payoutsByPlayer.set(p.playerId, (payoutsByPlayer.get(p.playerId) ?? 0) + p.amount);
      }

      // 构建 PayoutInfo 列表
      const payoutInfos: PayoutInfo[] = [];
      for (const [pid, amount] of payoutsByPlayer) {
        // 从 result.players 或 currentHand 中找玩家信息
        const resultPlayer = result.players.find((p) => p.id === pid);
        const handPlayer = currentHand?.players.find((p) => p.id === pid);
        const name = resultPlayer?.name ?? handPlayer?.name ?? '玩家';
        const holeCards = resultPlayer?.holeCards ?? handPlayer?.holeCards ?? [];

        let handRankName = '';
        let bestCards: string[] = [];

        const canEvaluateShowdown = holeCards.length >= 2 && communityCards.length >= 5;
        if (canEvaluateShowdown) {
          const evaluation = evaluateHandRanking(holeCards, communityCards);
          handRankName = getHandRankDisplayName(evaluation.category);
          bestCards = evaluation.bestCards;
        }

        payoutInfos.push({ playerId: pid, playerName: name, amount, handRankName, bestCards });
      }

      const winnerIds = [...payoutsByPlayer.keys()];

      const handResultData: HandResult = {
        payouts: payoutInfos,
        winnerIds,
        potTotal: result.potTotal,
        phase: 'announcing',
        table: result.table,
      };

      setHandResult(handResultData);

      // 阶段自动过渡
      const t1 = setTimeout(() => {
        setHandResultPhase('showing');
      }, 2500);

      const t2 = setTimeout(() => {
        setHandResultPhase('done');
      }, 4000);

      phaseTimersRef.current = [t1, t2];
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

    let cancelled = false;
    void (async () => {
      try {
        await ensureGuestSession(playerName);
      } catch {
        if (!cancelled) {
          toast.error('会话初始化失败，请刷新重试');
          setError('会话初始化失败');
        }
        return;
      }

      if (!cancelled) {
        connectSocket();
      }
    })();

    return () => {
      cancelled = true;
      for (const timer of phaseTimersRef.current) clearTimeout(timer);
      phaseTimersRef.current = [];
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
  }, [enabled, roomId, playerId, playerName]); // eslint-disable-line react-hooks/exhaustive-deps

  /** 发送游戏动作 */
  const sendAction = useCallback(
    (type: ActionType, amount?: number) => {
      if (!enabled || !playerId) {
        toast.error('玩家身份无效，请返回大厅重试');
        return;
      }

      const socket = getSocket();
      const seq = ++seqRef.current;

      // 快照当前可操作状态，ack 失败时用于恢复
      const { validActions, timerStartedAt, timerDurationMs } =
        useGameStore.getState();
      const stateVersion = useGameStore.getState().stateVersion;

      // 立即清除（防止重复提交），等待服务端 ack
      useGameStore.getState().clearValidActions();

      socket.emit(
        'game:action',
        {
          roomId,
          type,
          amount,
          seq,
          ...(stateVersion !== null ? { expectedVersion: stateVersion } : {})
        },
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
    [enabled, playerId, roomId],
  );

  /** 请求发下一手牌 */
  const startNextHand = useCallback((source: 'manual' | 'auto' | 'hotkey' = 'manual'): boolean => {
    if (!enabled || !roomId) return false;

    const store = useGameStore.getState();
    if (store.nextHandRequested) return false;

    markNextHandRequested();
    const socket = getSocket();
    socket.timeout(GAME_START_ACK_TIMEOUT_MS).emit(
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
        if (source !== 'manual' && res.error === 'hand_already_started') {
          return;
        }

        toast.error(getGameStartErrorMessage(res.error, '开始下一手失败'));
      },
    );
    return true;
  }, [enabled, roomId, clearNextHandRequested, markNextHandRequested]);

  return { sendAction, startNextHand };
}
