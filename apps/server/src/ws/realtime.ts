import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

import type { RoomActionTimeouts } from '../game-loop/action-timeout.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { registerGameEvents } from './handlers/game-events.ts';
import { registerRoomEvents } from './handlers/room-events.ts';

interface AttachRealtimeOptions {
  actionTimeoutMs?: number;
}

export function attachRealtime(app: FastifyInstance, options: AttachRealtimeOptions = {}): Server {
  const io = new Server(app.server, {
    cors: {
      origin: '*'
    }
  });

  const actionTimeoutMs = options.actionTimeoutMs ?? 30000;
  const rooms = new Map<string, RuntimeRoom>();
  const memberships = new Map<string, RoomMembership>();
  const roomActionTimeouts: RoomActionTimeouts = new Map();

  io.on('connection', (socket) => {
    registerRoomEvents({
      io,
      socket,
      rooms,
      memberships,
      roomActionTimeouts
    });

    registerGameEvents({
      io,
      socket,
      rooms,
      memberships,
      roomActionTimeouts,
      actionTimeoutMs
    });
  });

  return io;
}
