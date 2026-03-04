import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { clearRoomActionTimeout, type RoomActionTimeouts } from '../../game-loop/action-timeout.ts';
import { getOrCreateRoom, pickSeatIndex } from '../../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitRoomState } from '../emitters.ts';
import {
  joinRoomPayloadSchema,
  roomLeavePayloadSchema,
  roomCreatePayloadSchema,
  roomReadyPayloadSchema,
  type JoinRoomAck,
  type RoomLeaveAck,
  type RoomCreateAck,
  type RoomReadyAck
} from '../schemas.ts';

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

  function shouldKeepSeatDuringHand(room: RuntimeRoom, playerId: string): boolean {
    return (
      room.hand !== null &&
      room.hand.phase !== 'hand_end' &&
      room.hand.players.some((player) => player.id === playerId)
    );
  }

  function removePlayerFromRoom(room: RuntimeRoom, playerId: string): void {
    room.players.delete(playerId);
    room.readyPlayerIds.delete(playerId);
    room.pendingDisconnectPlayerIds.delete(playerId);
  }

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

  socket.on('room:join', async (payload: unknown, ack?: (result: JoinRoomAck) => void) => {
    const parsed = joinRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const { roomId, playerId, playerName } = parsed.data;
    const previousMembership = memberships.get(socket.id);

    if (previousMembership && previousMembership.roomId !== roomId) {
      const previousRoom = rooms.get(previousMembership.roomId);
      await socket.leave(previousMembership.roomId);
      if (previousRoom) {
        if (shouldKeepSeatDuringHand(previousRoom, previousMembership.playerId)) {
          previousRoom.pendingDisconnectPlayerIds.add(previousMembership.playerId);
        } else {
          removePlayerFromRoom(previousRoom, previousMembership.playerId);
        }
        if (previousRoom.players.size === 0) {
          clearRoomActionTimeout(roomActionTimeouts, previousMembership.roomId);
          rooms.delete(previousMembership.roomId);
        }
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

    const isBot = parsed.data.isBot ?? false;
    room.players.set(playerId, {
      id: playerId,
      name: playerName,
      seatIndex: requestedSeat ?? pickSeatIndex(room),
      stack: parsed.data.stack ?? 1000,
      isBot,
      ...(parsed.data.botStrategy ? { botStrategy: parsed.data.botStrategy } : {}),
    });
    room.pendingDisconnectPlayerIds.delete(playerId);
    // Bots are auto-ready; humans start un-ready
    if (isBot) {
      room.readyPlayerIds.add(playerId);
    } else {
      room.readyPlayerIds.delete(playerId);
    }

    memberships.set(socket.id, { roomId, playerId });
    await socket.join(roomId);

    ack?.({ ok: true, roomId, playerCount: room.players.size });
    emitRoomState(io, room);
  });

  socket.on('room:ready', (payload: unknown, ack?: (result: RoomReadyAck) => void) => {
    const parsed = roomReadyPayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    const room = rooms.get(membership.roomId);
    if (!room || !room.players.has(membership.playerId)) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    room.readyPlayerIds.add(membership.playerId);
    ack?.({
      ok: true,
      roomId: room.id,
      readyCount: room.readyPlayerIds.size,
      playerCount: room.players.size
    });
    emitRoomState(io, room);
  });

  socket.on('room:remove_player', (payload: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
    const parsed = z.object({ roomId: z.string(), playerId: z.string() }).safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership || membership.roomId !== parsed.data.roomId) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    const room = rooms.get(parsed.data.roomId);
    if (!room) {
      ack?.({ ok: false, error: 'room_not_found' });
      return;
    }

    const target = room.players.get(parsed.data.playerId);
    if (!target || !target.isBot) {
      ack?.({ ok: false, error: 'not_a_bot' });
      return;
    }

    // Don't allow removing bots during an active hand
    if (room.hand && room.hand.phase !== 'hand_end') {
      ack?.({ ok: false, error: 'hand_in_progress' });
      return;
    }

    removePlayerFromRoom(room, parsed.data.playerId);
    ack?.({ ok: true });
    emitRoomState(io, room);
  });

  socket.on('room:leave', async (payload: unknown, ack?: (result: RoomLeaveAck) => void) => {
    const parsed = roomLeavePayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    memberships.delete(socket.id);
    await socket.leave(membership.roomId);

    const room = rooms.get(membership.roomId);
    if (!room) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    if (shouldKeepSeatDuringHand(room, membership.playerId)) {
      room.pendingDisconnectPlayerIds.add(membership.playerId);
      ack?.({ ok: true, roomId: room.id, playerCount: room.players.size });
      emitRoomState(io, room);
      return;
    }

    removePlayerFromRoom(room, membership.playerId);
    ack?.({ ok: true, roomId: room.id, playerCount: room.players.size });

    if (room.players.size === 0) {
      clearRoomActionTimeout(roomActionTimeouts, membership.roomId);
      rooms.delete(membership.roomId);
      return;
    }

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

    if (shouldKeepSeatDuringHand(room, membership.playerId)) {
      room.pendingDisconnectPlayerIds.add(membership.playerId);
      emitRoomState(io, room);
      return;
    }

    removePlayerFromRoom(room, membership.playerId);
    if (room.players.size === 0) {
      clearRoomActionTimeout(roomActionTimeouts, membership.roomId);
      rooms.delete(membership.roomId);
      return;
    }

    emitRoomState(io, room);
  });
}
