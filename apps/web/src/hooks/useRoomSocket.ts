'use client';

import { useEffect, useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ensureGuestSession } from '@/lib/auth-session';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';
import type { BotPersonality, RoomStateEvent } from '@aipoker/shared';

export interface RoomPlayer {
  id: string;
  name: string;
  seatIndex: number;
  isBot: boolean;
  botStrategy: BotPersonality | null;
  isReady: boolean;
}

export interface RoomState {
  players: RoomPlayer[];
  playerCount: number;
  readyCount: number;
  isPlaying: boolean;
}

export function useRoomSocket(roomId: string, playerId: string, playerName: string) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setIsConnected(true);
      setIsReady(false);
      // Join room as human player
      socket.emit(
        'room:join',
        { roomId, playerName, stack: 1000, isBot: false },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) toast.error(res.error ?? '加入房间失败');
        },
      );
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setIsReady(false);
    };

    const onRoomState = (state: RoomStateEvent) => {
      setRoomState({
        players: state.players,
        playerCount: state.playerCount,
        readyCount: state.readyCount,
        isPlaying: state.isPlaying,
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    let cancelled = false;
    void (async () => {
      try {
        await ensureGuestSession(playerName);
      } catch {
        if (!cancelled) {
          toast.error('会话初始化失败，请刷新重试');
        }
        return;
      }

      if (!cancelled) {
        connectSocket();
      }
    })();

    return () => {
      cancelled = true;
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.emit('room:leave', {}, () => {});
      disconnectSocket();
    };
  }, [roomId, playerId, playerName]);

  useEffect(() => {
    if (!roomState) {
      setIsReady(false);
      return;
    }
    const self = roomState.players.find((p) => p.id === playerId);
    setIsReady(Boolean(self?.isReady));
  }, [roomState, playerId]);

  const addBot = useCallback(
    (strategy: BotPersonality, seatIndex: number) => {
      const socket = getSocket();
      const botId = `bot-${strategy}-${seatIndex}`;
      socket.emit(
        'room:join',
        {
          roomId,
          playerId: botId,
          playerName: `${strategy.toUpperCase()} Bot ${seatIndex + 1}`,
          seatIndex,
          stack: 1000,
          isBot: true,
          botStrategy: strategy,
        },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) toast.error(res.error ?? '添加 Bot 失败');
        },
      );
    },
    [roomId],
  );

  const removeBot = useCallback(
    (botPlayerId: string) => {
      const socket = getSocket();
      socket.emit('room:remove_player', { roomId, playerId: botPlayerId }, () => {});
    },
    [roomId],
  );

  const markReady = useCallback(() => {
    const socket = getSocket();
    socket.emit(
      'room:ready',
      {},
      (res: { ok: boolean; readyCount?: number; playerCount?: number; error?: string }) => {
        if (!res.ok) {
          toast.error(res.error ?? '准备失败');
        }
      },
    );
  }, []);

  const startGame = useCallback(
    (onSuccess: () => void) => {
      const socket = getSocket();
      socket.emit(
        'game:start',
        { roomId },
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) {
            onSuccess();
          } else {
            const messages: Record<string, string> = {
              players_not_ready: '需要所有玩家准备完毕',
              not_enough_players: '至少需要 2 名玩家',
              hand_already_started: '游戏已经开始',
            };
            toast.error(messages[res.error ?? ''] ?? res.error ?? '开始游戏失败');
          }
        },
      );
    },
    [roomId],
  );

  return { roomState, isConnected, isReady, addBot, removeBot, markReady, startGame };
}
