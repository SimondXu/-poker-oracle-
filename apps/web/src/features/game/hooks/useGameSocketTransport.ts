'use client';

import { useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';
import { useSocketSession } from '@/hooks/useSocketSession';
import { useT } from '@/i18n';
import { getGameErrorKey } from '../lib/game-errors';
import type { GameActionRequiredEvent, GameStateEvent, HandResultEvent, HandState } from '@aipoker/shared';

interface UseGameSocketTransportOptions {
  roomId: string;
  playerId: string;
  playerName: string;
  enabled?: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onReconnecting?: () => void;
  onReconnected?: () => void;
  onGameState: (payload: GameStateEvent | HandState) => void;
  onActionRequired: (payload: GameActionRequiredEvent) => void;
  onHandResult: (payload: HandResultEvent) => void;
  onError: (message: string) => void;
  onCleanup?: () => void;
  onAuthError?: () => void;
}

export function useGameSocketTransport({
  roomId,
  playerId,
  playerName,
  enabled = true,
  onConnected,
  onDisconnected,
  onReconnecting,
  onReconnected,
  onGameState,
  onActionRequired,
  onHandResult,
  onError,
  onCleanup,
  onAuthError,
}: UseGameSocketTransportOptions) {
  const t = useT();
  const normalizedPlayerName = playerName.trim();

  const handleConnect = useCallback(
    (socket: Socket) => {
      onConnected?.();

      if (!playerId || !normalizedPlayerName) {
        onError(t('common.game.toast.identityMissing'));
        return;
      }

      socket.emit(
        'room:join',
        { roomId, playerName: normalizedPlayerName, stack: 1000, isBot: false },
        (res: { ok: boolean; error?: string }) => {
          if (!res.ok) {
            onError(t(getGameErrorKey(res.error, 'common.game.toast.joinFailed')));
          }
        },
      );
    },
    [normalizedPlayerName, onConnected, onError, playerId, roomId, t],
  );

  const registerEvents = useCallback(
    (socket: ReturnType<typeof getSocket>) => {
      const handleReconnectAttempt = () => {
        onReconnecting?.();
      };
      const handleReconnect = () => {
        onReconnected?.();
      };
      // The server's `message` is English debug text; show our own copy for the code.
      const handleSocketError = (payload: { code?: string }) => {
        onError(t(getGameErrorKey(payload?.code, 'common.game.error.generic')));
      };

      socket.io.on('reconnect_attempt', handleReconnectAttempt);
      socket.io.on('reconnect', handleReconnect);
      socket.on('game:state', onGameState);
      socket.on('game:action_required', onActionRequired);
      socket.on('game:hand_result', onHandResult);
      socket.on('error', handleSocketError);

      return () => {
        socket.io.off('reconnect_attempt', handleReconnectAttempt);
        socket.io.off('reconnect', handleReconnect);
        socket.off('game:state', onGameState);
        socket.off('game:action_required', onActionRequired);
        socket.off('game:hand_result', onHandResult);
        socket.off('error', handleSocketError);
      };
    },
    [onActionRequired, onError, onGameState, onHandResult, onReconnected, onReconnecting, t],
  );

  const handleCleanup = useCallback(
    (socket: Socket) => {
      socket.emit('room:leave', {}, () => {});
      onCleanup?.();
    },
    [onCleanup],
  );

  useSocketSession({
    enabled,
    playerName,
    deps: [roomId, playerId],
    onConnect: handleConnect,
    registerEvents,
    onCleanup: handleCleanup,
    ...(onDisconnected ? { onDisconnect: onDisconnected } : {}),
    ...(onAuthError ? { onAuthError } : {}),
  });
}
