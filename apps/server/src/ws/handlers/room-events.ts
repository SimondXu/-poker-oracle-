import { isCliAgentModel, type AgentModel, type AgentPersonaId, type BotConfig, type BotPersonality } from '@aipoker/shared';
import type { Server, Socket } from 'socket.io';

import type { GuestSession } from '../../auth/session-token.ts';
import type { FixedWindowRateLimiter } from '../../http/rate-limit.ts';
import {
  clearEmptyRoomTimeout,
  scheduleEmptyRoomTimeout,
  type EmptyRoomTimeouts,
} from '../../game-loop/empty-room-timeout.ts';
import { forgetCoachPlayer } from '../../game-loop/coach-review.ts';
import { getOrCreateRoom, hasHumanPlayers, pickSeatIndex, syncRoomHost } from '../../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitGameStateToSocket, emitRoomState } from '../emitters.ts';
import {
  MAX_SEATS,
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
import { toAck } from '../ack.ts';

interface RegisterRoomEventsInput {
  io: Server;
  socket: Socket;
  rooms: Map<string, RuntimeRoom>;
  memberships: Map<string, RoomMembership>;
  emptyRoomTimeouts: EmptyRoomTimeouts;
  authStrict: boolean;
  actionTimeoutMs: number;
  emptyRoomTtlMs: number;
  /** Pending waiting-room seat removals, keyed `roomId:playerId`. Shared by every socket. */
  waitingRoomRemovals: Map<string, ReturnType<typeof setTimeout>>;
  waitingRoomReconnectGraceMs: number;
  nowMs: () => number;
  deleteRoom: (roomId: string) => void;
  /** Whether Claude Code bots may be added now (`LLM_CLI_BOTS_ENABLED`, startup checks passed, no stop rule tripped). */
  cliBotsEnabled: () => boolean;
  // Shared across sockets so reconnecting does not reset the budget.
  rateLimit: FixedWindowRateLimiter;
}

const MAX_CREATES_PER_WINDOW = 10;
const MAX_BOT_JOINS_PER_WINDOW = 30;
const BOT_ID_PREFIX = 'bot-';

function toRuleBotConfig(personality: BotPersonality | undefined) {
  return {
    kind: 'rule' as const,
    personality: personality ?? 'fish',
  };
}

function toBotConfig(input: {
  botStrategy: BotPersonality | undefined;
  botModel: AgentModel | undefined;
  botPersonaId: AgentPersonaId | undefined;
}): BotConfig | undefined {
  if (input.botModel) {
    return {
      kind: 'llm',
      model: input.botModel,
      // Claude Code bots play the Analyst at tables; the Exploiter is eval-only.
      personaId: isCliAgentModel(input.botModel) ? 'analyst' : input.botPersonaId ?? 'analyst',
    };
  }

  if (input.botStrategy) {
    return toRuleBotConfig(input.botStrategy);
  }

  return undefined;
}

export function registerRoomEvents(input: RegisterRoomEventsInput): void {
  const {
    io,
    socket,
    rooms,
    memberships,
    emptyRoomTimeouts,
    authStrict,
    actionTimeoutMs,
    emptyRoomTtlMs,
    waitingRoomRemovals,
    waitingRoomReconnectGraceMs,
    nowMs,
    deleteRoom,
    cliBotsEnabled,
    rateLimit,
  } = input;
  const clientKey = socket.handshake.address;

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
    forgetCoachPlayer(room, playerId);
    syncRoomHost(room);
  }

  function isRateLimited(action: string, maxPerWindow: number): boolean {
    return !rateLimit(`${action}:${clientKey}`, nowMs(), maxPerWindow).allowed;
  }

  function cancelWaitingRoomRemoval(roomId: string, playerId: string): void {
    const key = `${roomId}:${playerId}`;
    clearTimeout(waitingRoomRemovals.get(key));
    waitingRoomRemovals.delete(key);
  }

  /** Remove a disconnected human now, or keep the seat until the hand that holds it ends. */
  function removeDisconnectedPlayer(room: RuntimeRoom, playerId: string): void {
    if (shouldKeepSeatDuringHand(room, playerId)) {
      room.pendingDisconnectPlayerIds.add(playerId);
      emitRoomState(io, room);
      return;
    }

    removePlayerFromRoom(room, playerId);
    if (deleteRoomIfNoHumans(room)) {
      return;
    }

    emitRoomState(io, room);
  }

  /** A refresh drops the socket for a moment; hold the seat (between or during hands) so the same player can come back. */
  function scheduleDisconnectRemoval(roomId: string, playerId: string): void {
    cancelWaitingRoomRemoval(roomId, playerId);
    const handle = setTimeout(() => {
      waitingRoomRemovals.delete(`${roomId}:${playerId}`);
      const room = rooms.get(roomId);
      if (!room || !room.players.has(playerId) || hasOtherSocketForPlayer(roomId, playerId)) {
        return;
      }
      removeDisconnectedPlayer(room, playerId);
    }, waitingRoomReconnectGraceMs);
    handle.unref?.();
    waitingRoomRemovals.set(`${roomId}:${playerId}`, handle);
  }

  function deleteRoomIfNoHumans(room: RuntimeRoom): boolean {
    if (hasHumanPlayers(room)) {
      return false;
    }

    deleteRoom(room.id);
    return true;
  }

  socket.on('room:create', (payload: unknown, rawAck?: unknown) => {
    const ack = toAck<RoomCreateAck>(rawAck);
    const parsed = roomCreatePayloadSchema.safeParse(payload);
    if (!parsed.success || parsed.data.bigBlind < parsed.data.smallBlind) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const authSession = (socket.data.authSession ?? null) as GuestSession | null;
    if (authStrict && !authSession) {
      ack({ ok: false, error: 'unauthorized' });
      return;
    }

    if (isRateLimited('create', MAX_CREATES_PER_WINDOW)) {
      ack({ ok: false, error: 'rate_limited' });
      return;
    }

    if (rooms.has(parsed.data.roomId)) {
      ack({ ok: false, error: 'room_already_exists' });
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

    ack({ ok: true, roomId: room.id });
    emitRoomState(io, room);
  });

  socket.on('room:join', async (payload: unknown, rawAck?: unknown) => {
    const ack = toAck<JoinRoomAck>(rawAck);
    const parsed = joinRoomPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const { roomId } = parsed.data;
    const isBot = parsed.data.isBot === true;
    const authSession = (socket.data.authSession ?? null) as GuestSession | null;
    if (!isBot && authStrict && !authSession) {
      ack({ ok: false, error: 'unauthorized' });
      return;
    }

    const resolvedPlayerId = isBot ? parsed.data.playerId : (authSession?.userId ?? parsed.data.playerId);
    const resolvedPlayerName = isBot ? parsed.data.playerName : (parsed.data.playerName ?? authSession?.username);
    if (!resolvedPlayerId || !resolvedPlayerName) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    if (!isBot && authSession && parsed.data.playerId && parsed.data.playerId !== authSession.userId) {
      ack({ ok: false, error: 'unauthorized' });
      return;
    }

    // Bot and human ids live in separate namespaces so neither can take over the other's seat.
    if (isBot !== resolvedPlayerId.startsWith(BOT_ID_PREFIX)) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      ack({ ok: false, error: 'room_not_found' });
      return;
    }

    const previousMembership = memberships.get(socket.id);
    const existingPlayer = room.players.get(resolvedPlayerId);
    if (isBot) {
      // Only a seated member of this room may add or reconfigure its bots.
      if (!previousMembership || previousMembership.roomId !== roomId || !room.players.has(previousMembership.playerId)) {
        ack({ ok: false, error: 'not_room_member' });
        return;
      }
      if (existingPlayer && !existingPlayer.isBot) {
        ack({ ok: false, error: 'invalid_payload' });
        return;
      }
      if (parsed.data.botModel && isCliAgentModel(parsed.data.botModel) && !cliBotsEnabled()) {
        ack({ ok: false, error: 'cli_bots_disabled' });
        return;
      }
      if (!existingPlayer && isRateLimited('bot_join', MAX_BOT_JOINS_PER_WINDOW)) {
        ack({ ok: false, error: 'rate_limited' });
        return;
      }
    }

    if (!existingPlayer && room.players.size >= MAX_SEATS) {
      ack({ ok: false, error: 'room_full' });
      return;
    }

    const normalizedName = resolvedPlayerName.trim().toLowerCase();
    const hasNameConflict = [...room.players.values()].some(
      (player) => player.id !== resolvedPlayerId && player.name.trim().toLowerCase() === normalizedName
    );
    if (hasNameConflict) {
      ack({ ok: false, error: 'player_name_taken' });
      return;
    }

    const requestedSeat = parsed.data.seatIndex;
    const seatTakenByOther =
      requestedSeat !== undefined
        && !existingPlayer
        ? [...room.players.values()].some((player) => player.seatIndex === requestedSeat && player.id !== resolvedPlayerId)
        : false;
    if (seatTakenByOther) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    // All checks pass; everything below mutates synchronously so no other handler can interleave
    // between validation and the seat being taken.
    clearEmptyRoomTimeout(emptyRoomTimeouts, room.id);
    cancelWaitingRoomRemoval(room.id, resolvedPlayerId);
    if (!isBot && previousMembership && previousMembership.roomId !== roomId) {
      const previousRoom = rooms.get(previousMembership.roomId);
      void socket.leave(previousMembership.roomId);
      if (previousRoom) {
        const hasOtherSockets = hasOtherSocketForPlayer(previousMembership.roomId, previousMembership.playerId);
        if (!hasOtherSockets) {
          if (shouldKeepSeatDuringHand(previousRoom, previousMembership.playerId)) {
            previousRoom.pendingDisconnectPlayerIds.add(previousMembership.playerId);
          } else {
            removePlayerFromRoom(previousRoom, previousMembership.playerId);
          }
          if (!deleteRoomIfNoHumans(previousRoom)) {
            emitRoomState(io, previousRoom);
          }
        }
      }
    }

    const botConfig = isBot
      ? toBotConfig({
          botStrategy: parsed.data.botStrategy,
          botModel: parsed.data.botModel,
          botPersonaId: parsed.data.botPersonaId,
        })
      : undefined;

    const nextPlayer =
      existingPlayer
      ?? (
        isBot && botConfig
          ? {
              id: resolvedPlayerId,
              name: resolvedPlayerName,
              seatIndex: requestedSeat ?? pickSeatIndex(room),
              stack: parsed.data.stack ?? 1000,
              isBot: true,
              botConfig,
            }
          : {
              id: resolvedPlayerId,
              name: resolvedPlayerName,
              seatIndex: requestedSeat ?? pickSeatIndex(room),
              stack: parsed.data.stack ?? 1000,
              isBot,
            }
      );

    // Reconfiguring a bot that is mid-hand would orphan its pending turn, so only do it between hands.
    if (existingPlayer && botConfig && !shouldKeepSeatDuringHand(room, existingPlayer.id)) {
      existingPlayer.botConfig = botConfig;
    }

    room.players.set(resolvedPlayerId, nextPlayer);
    syncRoomHost(room);
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

    ack({ ok: true, roomId, playerCount: room.players.size });
    emitRoomState(io, room);
    // Re-entry or late join should receive an immediate hand snapshot without re-broadcasting turn prompts.
    emitGameStateToSocket(io, socket.id, room, memberships);
  });

  socket.on('room:ready', (payload: unknown, rawAck?: unknown) => {
    const ack = toAck<RoomReadyAck>(rawAck);
    const parsed = roomReadyPayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership) {
      ack({ ok: false, error: 'not_room_member' });
      return;
    }

    const room = rooms.get(membership.roomId);
    if (!room || !room.players.has(membership.playerId)) {
      ack({ ok: false, error: 'not_room_member' });
      return;
    }

    room.readyPlayerIds.add(membership.playerId);
    ack({
      ok: true,
      roomId: room.id,
      readyCount: room.readyPlayerIds.size,
      playerCount: room.players.size
    });
    emitRoomState(io, room);
  });

  socket.on('room:remove_player', (payload: unknown, rawAck?: unknown) => {
    const ack = toAck<{ ok: boolean; error?: string }>(rawAck);
    const parsed = roomRemovePlayerPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership || membership.roomId !== parsed.data.roomId) {
      ack({ ok: false, error: 'not_room_member' });
      return;
    }

    const room = rooms.get(parsed.data.roomId);
    if (!room) {
      ack({ ok: false, error: 'room_not_found' });
      return;
    }

    if (membership.playerId !== room.hostPlayerId) {
      ack({ ok: false, error: 'not_room_host' });
      return;
    }

    const target = room.players.get(parsed.data.playerId);
    if (!target || !target.isBot) {
      ack({ ok: false, error: 'not_a_bot' });
      return;
    }

    // Don't allow removing bots during an active hand
    if (room.hand && room.hand.phase !== 'hand_end') {
      ack({ ok: false, error: 'hand_in_progress' });
      return;
    }

    removePlayerFromRoom(room, parsed.data.playerId);
    ack({ ok: true });
    emitRoomState(io, room);
  });

  socket.on('room:leave', async (payload: unknown, rawAck?: unknown) => {
    const ack = toAck<RoomLeaveAck>(rawAck);
    const parsed = roomLeavePayloadSchema.safeParse(payload ?? {});
    if (!parsed.success) {
      ack({ ok: false, error: 'invalid_payload' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership) {
      ack({ ok: false, error: 'not_room_member' });
      return;
    }

    memberships.delete(socket.id);
    await socket.leave(membership.roomId);

    const room = rooms.get(membership.roomId);
    if (!room) {
      ack({ ok: false, error: 'not_room_member' });
      return;
    }

    if (hasOtherSocketForPlayer(membership.roomId, membership.playerId)) {
      room.pendingDisconnectPlayerIds.delete(membership.playerId);
      ack({ ok: true, roomId: room.id, playerCount: room.players.size });
      return;
    }

    if (shouldKeepSeatDuringHand(room, membership.playerId)) {
      room.pendingDisconnectPlayerIds.add(membership.playerId);
      ack({ ok: true, roomId: room.id, playerCount: room.players.size });
      emitRoomState(io, room);
      return;
    }

    removePlayerFromRoom(room, membership.playerId);
    ack({ ok: true, roomId: room.id, playerCount: room.players.size });

    if (deleteRoomIfNoHumans(room)) {
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

    if (waitingRoomReconnectGraceMs > 0) {
      scheduleDisconnectRemoval(membership.roomId, membership.playerId);
      return;
    }

    removeDisconnectedPlayer(room, membership.playerId);
  });
}
