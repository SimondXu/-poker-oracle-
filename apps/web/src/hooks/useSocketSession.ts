'use client';

import { useEffect, useRef } from 'react';
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
  // Avoid useEffectEvent here because the current Next/React client runtime in this project
  // does not expose it consistently on the room route.
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const registerEventsRef = useRef(registerEvents);
  const onCleanupRef = useRef(onCleanup);
  const onAuthErrorRef = useRef(onAuthError);

  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  registerEventsRef.current = registerEvents;
  onCleanupRef.current = onCleanup;
  onAuthErrorRef.current = onAuthError;

  useEffect(() => {
    if (!enabled || !normalizedPlayerName) {
      return;
    }

    const socket = getSocket();
    const unregisterEvents = registerEventsRef.current?.(socket) ?? noop;

    const handleConnect = () => {
      onConnectRef.current?.(socket);
    };
    const handleDisconnect = () => {
      onDisconnectRef.current?.();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    let cancelled = false;
    void (async () => {
      try {
        await ensureGuestSession(normalizedPlayerName);
      } catch {
        if (!cancelled) {
          onAuthErrorRef.current?.();
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
      onCleanupRef.current?.(socket);
      disconnectSocket();
    };
  }, [enabled, normalizedPlayerName, ...deps]);

  return { normalizedPlayerName };
}
