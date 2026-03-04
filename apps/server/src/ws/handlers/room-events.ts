import type { Server, Socket } from 'socket.io';

import { clearRoomActionTimeout, type RoomActionTimeouts } from '../../game-loop/action-timeout.ts';
import { getOrCreateRoom, pickSeatIndex } from '../../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitRoomState } from '../emitters.ts';
import { joinRoomPayloadSchema, roomCreatePayloadSchema, type JoinRoomAck, type RoomCreateAck } from '../schemas.ts';

interface RegisterRoomEventsInput {
  io: Server;
  socket: Socket;
  rooms: Map<string, RuntimeRoom>;
  memberships: Map<string, RoomMembership>;
  roomActionTimeouts: RoomActionTimeouts;
  actionTimeoutMs: number;
}

export function registerRoomEvents(input: RegisterRoomEventsInput): void {
  const { io, socket, rooms, memberships, roomActionTimeouts, actionTimeoutMs } = input;

  socket.on('room:create', (payload: unknown, ack?: (result: RoomCreateAck) => void) => {
    const parsed = roomCreatePayloadSchema.safeParse(payload);
    if (!parsed.success || parsed.data.bigBlind < parsed.data.smallBlind) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const room = getOrCreateRoom(rooms, parsed.data.roomId, {
      smallBlind: parsed.data.smallBlind,
      bigBlind: parsed.data.bigBlind,
      actionTimeoutMs
    });

    ack?.({ ok: true, roomId: room.id });
    emitRoomState(io, room);
  });

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
      previousRoom?.players.delete(previousMembership.playerId);
      if (previousRoom && previousRoom.players.size === 0) {
        clearRoomActionTimeout(roomActionTimeouts, previousMembership.roomId);
        rooms.delete(previousMembership.roomId);
      }
      void socket.leave(previousMembership.roomId);
      if (previousRoom) {
        emitRoomState(io, previousRoom);
      }
    }

    const room = getOrCreateRoom(rooms, roomId, {
      actionTimeoutMs
    });
    const requestedSeat = parsed.data.seatIndex;
    const seatTakenByOther =
      requestedSeat !== undefined
        ? [...room.players.values()].some((player) => player.seatIndex === requestedSeat && player.id !== playerId)
        : false;
    if (seatTakenByOther) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      seatIndex: requestedSeat ?? pickSeatIndex(room),
      stack: parsed.data.stack ?? 1000,
      isBot: parsed.data.isBot ?? false
    });

    memberships.set(socket.id, { roomId, playerId });
    void socket.join(roomId);

    ack?.({ ok: true, roomId, playerCount: room.players.size });
    emitRoomState(io, room);
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

    room.players.delete(membership.playerId);
    if (room.players.size === 0) {
      clearRoomActionTimeout(roomActionTimeouts, membership.roomId);
      rooms.delete(membership.roomId);
      return;
    }

    emitRoomState(io, room);
  });
}
