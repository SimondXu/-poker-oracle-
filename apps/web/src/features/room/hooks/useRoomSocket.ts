'use client';

import { useEffect, useCallback, useReducer, useRef } from 'react';
import { toast } from 'sonner';
import { useT } from '@/i18n';
import { getSocket } from '@/lib/socket';
import { useSocketSession } from '@/hooks/useSocketSession';
import type { BotPersonality, RoomStateEvent } from '@aipoker/shared';
import { getBotDisplayName } from '../lib/bot-names';
import { getRoomErrorKey } from '../lib/room-errors';
import type { RoomJoinIntent } from '../lib/room-types';
import {
  initialRoomSocketViewState,
  roomSocketViewReducer,
  toRoomState,
} from '../lib/room-socket-state';

export type { RoomJoinIntent } from '../lib/room-types';
export type { RoomPlayer, RoomState } from '../lib/room-socket-state';

export interface RoomAck {
  ok: boolean;
  error?: string | undefined;
}

const ACK_TIMEOUT_MS = 5000;

/** Emit with an ack, resolving `{ ok: false, error: 'timeout' }` instead of hanging when the server is silent. */
function emitWithAck(socket: ReturnType<typeof getSocket>, event: string, payload: unknown): Promise<RoomAck> {
  return new Promise((resolve) => {
    socket.timeout(ACK_TIMEOUT_MS).emit(event, payload, (err: Error | null, res?: RoomAck) => {
      if (err || !res) {
        resolve({ ok: false, error: 'timeout' });
        return;
      }
      resolve(res);
    });
  });
}

interface UseRoomSocketOptions {
  intent?: RoomJoinIntent;
  onJoinFailed?: (error?: string) => void;
}

export function useRoomSocket(
  roomId: string,
  playerId: string,
  playerName: string,
  options?: UseRoomSocketOptions,
) {
  const t = useT();
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
        (res: { ok: boolean; error?: string }) => {
          if (res.ok) {
            return;
          }

          dispatch({ type: 'reset' });
          toast.error(t(getRoomErrorKey(res.error, 'lobby.room.error.join')));
          onJoinFailed?.(res.error);
        },
      );
    },
    [normalizedPlayerName, onJoinFailed, playerId, roomId, t],
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
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            dispatch({ type: 'reset' });
            toast.error(t(getRoomErrorKey(res.error, 'lobby.room.error.create')));
            onJoinFailed?.(res.error);
            return;
          }

          hasCreatedRoomRef.current = true;
          joinRoom(socket);
        },
      );
    },
    [intent, joinRoom, onJoinFailed, roomId, t],
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
    toast.error(t('lobby.room.error.session'));
  }, [t]);

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

  const requestAddBot = useCallback(
    (strategy: BotPersonality, seatIndex: number) =>
      emitWithAck(getSocket(), 'room:join', {
        roomId,
        playerId: `bot-${strategy}-${seatIndex}`,
        playerName: getBotDisplayName(seatIndex),
        seatIndex,
        stack: 1000,
        isBot: true,
        botStrategy: strategy,
      }),
    [roomId],
  );

  const requestReady = useCallback(() => emitWithAck(getSocket(), 'room:ready', {}), []);

  const requestStart = useCallback(() => emitWithAck(getSocket(), 'game:start', { roomId }), [roomId]);

  const addBot = useCallback(
    (strategy: BotPersonality, seatIndex: number) => {
      void requestAddBot(strategy, seatIndex).then((res) => {
        if (!res.ok) {
          toast.error(t(getRoomErrorKey(res.error, 'lobby.room.error.addBot')));
        }
      });
    },
    [requestAddBot, t],
  );

  const removeBot = useCallback(
    (botPlayerId: string) => {
      const socket = getSocket();
      socket.emit('room:remove_player', { roomId, playerId: botPlayerId }, () => {});
    },
    [roomId],
  );

  const markReady = useCallback(() => {
    void requestReady().then((res) => {
      if (!res.ok) {
        toast.error(t(getRoomErrorKey(res.error, 'lobby.room.error.ready')));
      }
    });
  }, [requestReady, t]);

  const startGame = useCallback(
    (onSuccess: () => void) => {
      void requestStart().then((res) => {
        if (res.ok) {
          onSuccess();
        } else {
          toast.error(t(getRoomErrorKey(res.error, 'lobby.room.error.start')));
        }
      });
    },
    [requestStart, t],
  );

  return {
    roomState,
    isConnected,
    isReady,
    addBot,
    removeBot,
    markReady,
    startGame,
    requestAddBot,
    requestReady,
    requestStart,
  };
}
