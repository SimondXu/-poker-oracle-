import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

import { DEFAULT_AUTH_COOKIE_NAME, parseCookies } from '../auth/cookies.ts';
import { verifyGuestSessionToken } from '../auth/session-token.ts';
import type { RoomActionTimeouts } from '../game-loop/action-timeout.ts';
import type { RoomNextHandTimeouts } from '../game-loop/auto-next-hand.ts';
import type { EmptyRoomTimeouts } from '../game-loop/empty-room-timeout.ts';
import { DEFAULT_BOT_RUNTIME_DEPS, type BotRuntimeDeps } from '../game-loop/bot-support.ts';
import type { RoomTaskQueues } from '../rooms/room-queue.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { registerGameEvents } from './handlers/game-events.ts';
import { registerRoomEvents } from './handlers/room-events.ts';

interface AttachRealtimeOptions {
  actionTimeoutMs?: number;
  authSecret?: string;
  authCookieName?: string;
  authStrict?: boolean;
  emptyRoomTtlMs?: number;
  nowMs?: () => number;
  botRuntime?: Partial<BotRuntimeDeps>;
}

export function attachRealtime(app: FastifyInstance, options: AttachRealtimeOptions = {}): Server {
  const io = new Server(app.server, {
    cors: {
      origin: '*'
    }
  });

  const actionTimeoutMs = options.actionTimeoutMs ?? 30000;
  const authSecret = options.authSecret ?? 'dev-guest-secret-change-me';
  const authCookieName = options.authCookieName ?? DEFAULT_AUTH_COOKIE_NAME;
  const authStrict = options.authStrict ?? false;
  const emptyRoomTtlMs = options.emptyRoomTtlMs ?? 60_000;
  const nowMs = options.nowMs ?? (() => Date.now());
  const botRuntime: BotRuntimeDeps = {
    ...DEFAULT_BOT_RUNTIME_DEPS,
    ...(options.botRuntime ?? {}),
  };
  const rooms = new Map<string, RuntimeRoom>();
  const memberships = new Map<string, RoomMembership>();
  const roomActionTimeouts: RoomActionTimeouts = new Map();
  const roomNextHandTimeouts: RoomNextHandTimeouts = new Map();
  const emptyRoomTimeouts: EmptyRoomTimeouts = new Map();
  const roomTaskQueues: RoomTaskQueues = new Map();

  io.use((socket, next) => {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const sessionToken = cookies.get(authCookieName);
    const authSession = sessionToken
      ? verifyGuestSessionToken({
          token: sessionToken,
          nowMs: nowMs(),
          secret: authSecret
        })
      : null;

    socket.data.authSession = authSession;
    socket.data.authStrict = authStrict;
    next();
  });

  io.on('connection', (socket) => {
    registerRoomEvents({
      io,
      socket,
      rooms,
      memberships,
      roomActionTimeouts,
      roomNextHandTimeouts,
      emptyRoomTimeouts,
      authStrict,
      actionTimeoutMs,
      emptyRoomTtlMs,
      nowMs,
    });

    registerGameEvents({
      io,
      socket,
      rooms,
      memberships,
      roomActionTimeouts,
      roomNextHandTimeouts,
      roomTaskQueues,
      actionTimeoutMs,
      nowMs,
      botRuntime,
    });
  });

  return io;
}
