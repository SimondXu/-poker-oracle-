import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';

const joinRoomPayloadSchema = z.object({
  roomId: z.string().trim().min(1),
  playerId: z.string().trim().min(1),
  playerName: z.string().trim().min(1)
});

interface RoomMembership {
  roomId: string;
  playerId: string;
}

type JoinRoomAck =
  | { ok: true; roomId: string; playerCount: number }
  | { ok: false; error: 'invalid_payload' };

function bindJoinHandler(
  io: Server,
  socket: Socket,
  rooms: Map<string, Map<string, string>>,
  memberships: Map<string, RoomMembership>
): void {
  const emitRoomState = (roomId: string): void => {
    const room = rooms.get(roomId);
    io.to(roomId).emit('room:state', {
      roomId,
      playerCount: room?.size ?? 0
    });
  };

  socket.on('room:join', (payload: unknown, ack?: (result: JoinRoomAck) => void) => {
    const parsed = joinRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const { roomId, playerId, playerName } = parsed.data;
    const previousMembership = memberships.get(socket.id);

    if (previousMembership && previousMembership.roomId !== roomId) {
      const previousRoom = rooms.get(previousMembership.roomId);
      previousRoom?.delete(previousMembership.playerId);
      if (previousRoom && previousRoom.size === 0) {
        rooms.delete(previousMembership.roomId);
      }
      void socket.leave(previousMembership.roomId);
      emitRoomState(previousMembership.roomId);
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = new Map<string, string>();
      rooms.set(roomId, room);
    }

    room.set(playerId, playerName);
    memberships.set(socket.id, { roomId, playerId });
    void socket.join(roomId);

    ack?.({ ok: true, roomId, playerCount: room.size });
    emitRoomState(roomId);
  });

  socket.on('disconnect', () => {
    const membership = memberships.get(socket.id);
    if (!membership) {
      return;
    }

    memberships.delete(socket.id);
    const room = rooms.get(membership.roomId);
    if (!room) {
      return;
    }

    room.delete(membership.playerId);
    if (room.size === 0) {
      rooms.delete(membership.roomId);
      return;
    }

    emitRoomState(membership.roomId);
  });
}

export function attachRealtime(app: FastifyInstance): Server {
  const io = new Server(app.server, {
    cors: {
      origin: '*'
    }
  });

  const rooms = new Map<string, Map<string, string>>();
  const memberships = new Map<string, RoomMembership>();

  io.on('connection', (socket) => {
    bindJoinHandler(io, socket, rooms, memberships);
  });

  return io;
}
