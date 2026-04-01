import type { Server, Socket } from 'socket.io';

import type { GuestSession } from '../../auth/session-token.ts';
import { clearRoomActionTimeout, type RoomActionTimeouts } from '../../game-loop/action-timeout.ts';
import { clearRoomNextHandTimeout, type RoomNextHandTimeouts } from '../../game-loop/auto-next-hand.ts';
import {
  clearEmptyRoomTimeout,
  scheduleEmptyRoomTimeout,
  type EmptyRoomTimeouts,
} from '../../game-loop/empty-room-timeout.ts';
import { getOrCreateRoom, pickSeatIndex } from '../../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitGameStateToSocket, emitRoomState } from '../emitters.ts';
import {
  joinRoomPayloadSchema,
  roomLeavePayloadSchema,
  roomCreatePayloadSchema,
  roomRemovePlayerPayloadSchema,
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
  roomNextHandTimeouts: RoomNextHandTimeouts;
  emptyRoomTimeouts: EmptyRoomTimeouts;
  authStrict: boolean;
  actionTimeoutMs: number;
  emptyRoomTtlMs: number;
  nowMs: () => number;
}

const CREATE_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_CREATES_PER_WINDOW = 10;

export function registerRoomEvents(input: RegisterRoomEventsInput): void {
  const {
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
  } = input;
  const createTimestamps: number[] = [];

  function shouldKeepSeatDuringHand(room: RuntimeRoom, playerId: string): boolean {
    return (
      room.hand !== null &&
      room.hand.phase !== 'hand_end' &&
      room.hand.players.some((player) => player.id === playerId)
    );
  }

  function hasOtherSocketForPlayer(roomId: string, playerId: string): boolean {
    for (const [socketId, membership] of memberships) {
      if (socketId === socket.id) {
        continue;
      }
      if (membership.roomId === roomId && membership.playerId === playerId) {
        return true;
      }
    }
    return false;
  }

  function removePlayerFromRoom(room: RuntimeRoom, playerId: string): void {
    room.players.delete(playerId);
    room.readyPlayerIds.delete(playerId);
    room.pendingDisconnectPlayerIds.delete(playerId);
    room.spectatingPlayerIds.delete(playerId);
  }

  function deleteRoom(roomId: string): void {
    clearRoomActionTimeout(roomActionTimeouts, roomId);
    clearRoomNextHandTimeout(roomNextHandTimeouts, roomId);
    clearEmptyRoomTimeout(emptyRoomTimeouts, roomId);
    rooms.delete(roomId);
  }

  function isCreateRateLimited(): boolean {
    const now = nowMs();
    while (createTimestamps.length > 0) {
      const oldest = createTimestamps[0];
      if (oldest === undefined || now - oldest < CREATE_RATE_LIMIT_WINDOW_MS) {
        break;
      }
      createTimestamps.shift();
    }

    if (createTimestamps.length >= MAX_CREATES_PER_WINDOW) {
      return true;
    }

    createTimestamps.push(now);
    return false;
  }

  socket.on('room:create', (payload: unknown, ack?: (result: RoomCreateAck) => void) => {
    const parsed = roomCreatePayloadSchema.safeParse(payload);
    if (!parsed.success || parsed.data.bigBlind < parsed.data.smallBlind) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const authSession = (socket.data.authSession ?? null) as GuestSession | null;
    if (authStrict && !authSession) {
      ack?.({ ok: false, error: 'unauthorized' });
      return;
    }

    if (isCreateRateLimited()) {
      ack?.({ ok: false, error: 'rate_limited' });
      return;
    }

    if (rooms.has(parsed.data.roomId)) {
      ack?.({ ok: false, error: 'room_already_exists' });
      return;
    }

    const room = getOrCreateRoom(rooms, parsed.data.roomId, {
      smallBlind: parsed.data.smallBlind,
      bigBlind: parsed.data.bigBlind,
      actionTimeoutMs
    });
    scheduleEmptyRoomTimeout(emptyRoomTimeouts, room.id, emptyRoomTtlMs, () => {
      const latestRoom = rooms.get(room.id);
      if (!latestRoom || latestRoom.players.size > 0) {
        return;
      }

      deleteRoom(room.id);
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

    const { roomId } = parsed.data;
    const isBot = parsed.data.isBot === true;
    const authSession = (socket.data.authSession ?? null) as GuestSession | null;
    if (!isBot && authStrict && !authSession) {
      ack?.({ ok: false, error: 'unauthorized' });
      return;
    }

    const resolvedPlayerId = isBot ? parsed.data.playerId : (authSession?.userId ?? parsed.data.playerId);
    const resolvedPlayerName = isBot ? parsed.data.playerName : (parsed.data.playerName ?? authSession?.username);
    if (!resolvedPlayerId || !resolvedPlayerName) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    if (!isBot && authSession && parsed.data.playerId && parsed.data.playerId !== authSession.userId) {
      ack?.({ ok: false, error: 'unauthorized' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      ack?.({ ok: false, error: 'room_not_found' });
      return;
    }
    clearEmptyRoomTimeout(emptyRoomTimeouts, room.id);

    const normalizedName = resolvedPlayerName.trim().toLowerCase();
    const hasNameConflict = [...room.players.values()].some(
      (player) => player.id !== resolvedPlayerId && player.name.trim().toLowerCase() === normalizedName
    );
    if (hasNameConflict) {
      ack?.({ ok: false, error: 'player_name_taken' });
      return;
    }

    const previousMembership = memberships.get(socket.id);

    if (previousMembership && previousMembership.roomId !== roomId) {
      const previousRoom = rooms.get(previousMembership.roomId);
      await socket.leave(previousMembership.roomId);
      if (previousRoom) {
        const hasOtherSockets = hasOtherSocketForPlayer(previousMembership.roomId, previousMembership.playerId);
        if (!hasOtherSockets) {
          if (shouldKeepSeatDuringHand(previousRoom, previousMembership.playerId)) {
            previousRoom.pendingDisconnectPlayerIds.add(previousMembership.playerId);
          } else {
            removePlayerFromRoom(previousRoom, previousMembership.playerId);
          }
          if (previousRoom.players.size === 0) {
            deleteRoom(previousMembership.roomId);
          }
          emitRoomState(io, previousRoom);
        }
      }
    }

    const existingPlayer = room.players.get(resolvedPlayerId);
    const requestedSeat = parsed.data.seatIndex;
    const seatTakenByOther =
      requestedSeat !== undefined
        && !existingPlayer
        ? [...room.players.values()].some((player) => player.seatIndex === requestedSeat && player.id !== resolvedPlayerId)
        : false;
    if (seatTakenByOther) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const nextPlayer = existingPlayer ?? {
      id: resolvedPlayerId,
      name: resolvedPlayerName,
      seatIndex: requestedSeat ?? pickSeatIndex(room),
      stack: parsed.data.stack ?? 1000,
      isBot,
      ...(parsed.data.botStrategy ? { botStrategy: parsed.data.botStrategy } : {}),
    };

    room.players.set(resolvedPlayerId, nextPlayer);
    room.pendingDisconnectPlayerIds.delete(resolvedPlayerId);
    if (nextPlayer.stack > 0) {
      room.spectatingPlayerIds.delete(resolvedPlayerId);
    }
    if (existingPlayer) {
      if (room.readyPlayerIds.has(resolvedPlayerId)) {
        room.readyPlayerIds.add(resolvedPlayerId);
      } else {
        room.readyPlayerIds.delete(resolvedPlayerId);
      }
    } else if (isBot) {
      room.readyPlayerIds.add(resolvedPlayerId);
    } else {
      room.readyPlayerIds.delete(resolvedPlayerId);
    }

    if (!isBot) {
      memberships.set(socket.id, { roomId, playerId: resolvedPlayerId });
    }
    await socket.join(roomId);

    ack?.({ ok: true, roomId, playerCount: room.players.size });
    emitRoomState(io, room);
    // Re-entry or late join should receive an immediate hand snapshot without re-broadcasting turn prompts.
    emitGameStateToSocket(io, socket.id, room, memberships);
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
    const parsed = roomRemovePlayerPayloadSchema.safeParse(payload);
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

    if (hasOtherSocketForPlayer(membership.roomId, membership.playerId)) {
      room.pendingDisconnectPlayerIds.delete(membership.playerId);
      ack?.({ ok: true, roomId: room.id, playerCount: room.players.size });
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
      deleteRoom(membership.roomId);
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

    if (hasOtherSocketForPlayer(membership.roomId, membership.playerId)) {
      room.pendingDisconnectPlayerIds.delete(membership.playerId);
      return;
    }

    if (shouldKeepSeatDuringHand(room, membership.playerId)) {
      room.pendingDisconnectPlayerIds.add(membership.playerId);
      emitRoomState(io, room);
      return;
    }

    removePlayerFromRoom(room, membership.playerId);
    if (room.players.size === 0) {
      deleteRoom(membership.roomId);
      return;
    }

    emitRoomState(io, room);
  });
}
