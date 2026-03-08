'use client';

import { useEffect, useCallback, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { getGameStartErrorMessage } from '@/features/game/lib/game-start-errors';
import { getSocket } from '@/lib/socket';
import { useSocketSession } from '@/hooks/useSocketSession';
import type { BotPersonality, RoomStateEvent } from '@aipoker/shared';
import { getRoomErrorMessage } from '../lib/room-errors';
import type { RoomJoinIntent } from '../lib/room-types';
import {
  initialRoomSocketViewState,
  roomSocketViewReducer,
  toRoomState,
  type RoomPlayer,
} from '../lib/room-socket-state';

export type { RoomJoinIntent } from '../lib/room-types';
export type { RoomPlayer, RoomState } from '../lib/room-socket-state';

interface UseRoomSocketOptions {
  intent?: RoomJoinIntent;
  onJoinFailed?: (error?: string) => void;
}

interface RoomActionAck {
  ok: boolean;
  error?: string;
}

export function useRoomSocket(
  roomId: string,
  playerId: string,
  playerName: string,
  options?: UseRoomSocketOptions,
) {
  const intent = options?.intent ?? 'join';
  const onJoinFailed = options?.onJoinFailed;
  const [{ roomState, isConnected, isReady }, dispatch] = useReducer(
    roomSocketViewReducer,
    initialRoomSocketViewState,
  );
  const hasCreatedRoomRef = useRef(false);
  const normalizedPlayerName = playerName.trim();

  useEffect(() => {
    hasCreatedRoomRef.current = false;
    dispatch({ type: 'reset' });
  }, [normalizedPlayerName, playerId, roomId]);

  useEffect(() => {
    if (!roomId || !playerId || !normalizedPlayerName) {
      dispatch({ type: 'reset' });
    }
  }, [normalizedPlayerName, playerId, roomId]);

  const joinRoom = useCallback(
    (socket: ReturnType<typeof getSocket>) => {
      socket.emit(
        'room:join',
        {
          roomId,
          playerId,
          playerName: normalizedPlayerName,
          stack: 1000,
          isBot: false,
        },
        (res: RoomActionAck) => {
          if (res.ok) {
            return;
          }

          dispatch({ type: 'reset' });
          toast.error(getRoomErrorMessage(res.error, '加入房间失败'));
          onJoinFailed?.(res.error);
        },
      );
    },
    [normalizedPlayerName, onJoinFailed, playerId, roomId],
  );

  const handleConnect = useCallback(
    (socket: ReturnType<typeof getSocket>) => {
      dispatch({ type: 'connected' });

      if (intent !== 'create' || hasCreatedRoomRef.current) {
        joinRoom(socket);
        return;
      }

      socket.emit(
        'room:create',
        { roomId, smallBlind: 10, bigBlind: 20 },
        (res: RoomActionAck) => {
          if (!res.ok) {
            dispatch({ type: 'reset' });
            toast.error(getRoomErrorMessage(res.error, '创建房间失败'));
            onJoinFailed?.(res.error);
            return;
          }

          hasCreatedRoomRef.current = true;
          joinRoom(socket);
        },
      );
    },
    [intent, joinRoom, onJoinFailed, roomId],
  );

  const handleDisconnect = useCallback(() => {
    dispatch({ type: 'disconnected' });
  }, []);

  const registerEvents = useCallback((socket: ReturnType<typeof getSocket>) => {
    const onRoomState = (state: RoomStateEvent) => {
      dispatch({ type: 'roomStateReceived', roomState: toRoomState(state), playerId });
    };

    socket.on('room:state', onRoomState);

    return () => {
      socket.off('room:state', onRoomState);
    };
  }, [playerId]);

  const handleCleanup = useCallback((socket: ReturnType<typeof getSocket>) => {
    socket.emit('room:leave', {}, () => {});
  }, []);

  const handleAuthError = useCallback(() => {
    dispatch({ type: 'reset' });
    toast.error('会话初始化失败，请刷新重试');
  }, []);

  useSocketSession({
    enabled: Boolean(roomId && playerId && normalizedPlayerName),
    playerName,
    deps: [intent, playerId, roomId],
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    registerEvents,
    onCleanup: handleCleanup,
    onAuthError: handleAuthError,
  });

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
        (res: RoomActionAck) => {
          if (!res.ok) {
            toast.error(getRoomErrorMessage(res.error, '添加 Bot 失败'));
          }
        },
      );
    },
    [roomId],
  );

  const removeBot = useCallback(
    (botPlayerId: string) => {
      const socket = getSocket();
      socket.emit(
        'room:remove_player',
        { roomId, playerId: botPlayerId },
        (res: RoomActionAck) => {
          if (!res.ok) {
            toast.error(getRoomErrorMessage(res.error, '移除 Bot 失败'));
          }
        },
      );
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
            toast.error(getGameStartErrorMessage(res.error, '开始游戏失败'));
          }
        },
      );
    },
    [roomId],
  );

  return { roomState, isConnected, isReady, addBot, removeBot, markReady, startGame };
}
