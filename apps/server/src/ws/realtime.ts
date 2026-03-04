import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { registerGameEvents } from './handlers/game-events.ts';
import { registerRoomEvents } from './handlers/room-events.ts';

export function attachRealtime(app: FastifyInstance): Server {
  const io = new Server(app.server, {
    cors: {
      origin: '*'
    }
  });

  const rooms = new Map<string, RuntimeRoom>();
  const memberships = new Map<string, RoomMembership>();

  io.on('connection', (socket) => {
    registerRoomEvents({
      io,
      socket,
      rooms,
      memberships
    });

    registerGameEvents({
      io,
      socket,
      rooms,
      memberships
    });
  });

  return io;
}
