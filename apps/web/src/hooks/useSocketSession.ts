'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { ensureGuestSession } from '@/lib/auth-session';
import { getSocket, connectSocket, disconnectSocket } from '@/lib/socket';

interface UseSocketSessionOptions {
  enabled?: boolean;
  playerName: string;
  deps?: readonly unknown[];
  onConnect?: (socket: Socket) => void;
  onDisconnect?: () => void;
  registerEvents?: (socket: Socket) => (() => void) | void;
  onCleanup?: (socket: Socket) => void;
  onAuthError?: () => void;
}

const noop = () => {};

function useStableEventCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback((...args: Args) => callbackRef.current(...args), []);
}

export function useSocketSession({
  enabled = true,
  playerName,
  deps = [],
  onConnect,
  onDisconnect,
  registerEvents,
  onCleanup,
  onAuthError,
}: UseSocketSessionOptions) {
  const normalizedPlayerName = playerName.trim();
  const handleConnectEvent = useStableEventCallback((socket: Socket) => {
    onConnect?.(socket);
  });
  const handleDisconnectEvent = useStableEventCallback(() => {
    onDisconnect?.();
  });
  const registerEventsEvent = useStableEventCallback((socket: Socket) => registerEvents?.(socket) ?? noop);
  const handleCleanupEvent = useStableEventCallback((socket: Socket) => {
    onCleanup?.(socket);
  });
  const handleAuthErrorEvent = useStableEventCallback(() => {
    onAuthError?.();
  });

  useEffect(() => {
    if (!enabled || !normalizedPlayerName) {
      return;
    }

    const socket = getSocket();
    const unregisterEvents = registerEventsEvent(socket);

    const handleConnect = () => {
      handleConnectEvent(socket);
    };
    const handleDisconnect = () => {
      handleDisconnectEvent();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    let cancelled = false;
    void (async () => {
      try {
        await ensureGuestSession(normalizedPlayerName);
      } catch {
        if (!cancelled) {
          handleAuthErrorEvent();
        }
        return;
      }

      if (!cancelled) {
        connectSocket();
      }
    })();

    return () => {
      cancelled = true;
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      unregisterEvents();
      handleCleanupEvent(socket);
      disconnectSocket();
    };
  }, [enabled, normalizedPlayerName, ...deps]);

  return { normalizedPlayerName };
}
