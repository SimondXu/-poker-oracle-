import { applyAction, getValidActions, initializeHand, type ActionType as EngineActionType, type PlayerActionInput } from '@aipoker/game-engine';
import type { Server, Socket } from 'socket.io';

import { isDuplicateOrStaleActionSeq, recordActionSeq, resetActionSeqTracker } from '../../game-loop/action-seq.ts';
import {
  clearRoomActionTimeout,
  scheduleRoomActionTimeout,
  type RoomActionTimeouts
} from '../../game-loop/action-timeout.ts';
import { cleanupDisconnectedPlayersAfterHandEnd } from '../../game-loop/cleanup-disconnected-players.ts';
import { runBotTurns } from '../../game-loop/run-bot-turns.ts';
import { syncRoomPlayersFromHand } from '../../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitGameState } from '../emitters.ts';
import { gameActionPayloadSchema, gameStartPayloadSchema, type GameActionAck, type GameStartAck } from '../schemas.ts';

interface RegisterGameEventsInput {
  io: Server;
  socket: Socket;
  rooms: Map<string, RuntimeRoom>;
  memberships: Map<string, RoomMembership>;
  roomActionTimeouts: RoomActionTimeouts;
  actionTimeoutMs: number;
}

const ACTION_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ACTIONS_PER_WINDOW = 20;

type GameActionAckWithRateLimit = GameActionAck | { ok: false; error: 'rate_limited' };

export function registerGameEvents(input: RegisterGameEventsInput): void {
  const { io, socket, rooms, memberships, roomActionTimeouts, actionTimeoutMs } = input;
  const actionTimestamps: number[] = [];

  function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
    return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
  }

  function syncActionTimeout(roomId: string): void {
    const room = rooms.get(roomId);
    if (!room || !room.hand || room.hand.currentActorSeat === null) {
      clearRoomActionTimeout(roomActionTimeouts, roomId);
      return;
    }

    const actor = getRoomPlayerBySeat(room, room.hand.currentActorSeat);
    if (!actor || actor.isBot) {
      clearRoomActionTimeout(roomActionTimeouts, roomId);
      return;
    }

    scheduleRoomActionTimeout(roomActionTimeouts, room.id, actionTimeoutMs, () => {
      const latestRoom = rooms.get(room.id);
      if (!latestRoom || !latestRoom.hand || latestRoom.hand.currentActorSeat === null) {
        clearRoomActionTimeout(roomActionTimeouts, room.id);
        return;
      }

      const latestActor = getRoomPlayerBySeat(latestRoom, latestRoom.hand.currentActorSeat);
      if (!latestActor || latestActor.isBot) {
        clearRoomActionTimeout(roomActionTimeouts, room.id);
        return;
      }

      const valid = getValidActions(latestRoom.hand, latestActor.id);
      const timeoutAction: PlayerActionInput = valid.canCheck
        ? {
            playerId: latestActor.id,
            type: 'check'
          }
        : {
            playerId: latestActor.id,
            type: 'fold'
          };

      const timeoutResult = applyAction(latestRoom.hand, timeoutAction);
      if (!timeoutResult.ok) {
        clearRoomActionTimeout(roomActionTimeouts, room.id);
        return;
      }

      latestRoom.hand = timeoutResult.value;
      syncRoomPlayersFromHand(latestRoom);
      emitStateAndProgress(latestRoom);
    });
  }

  function emitStateAndProgress(room: RuntimeRoom): void {
    emitGameState(io, room, memberships);
    runBotTurns(io, room, memberships);
    cleanupDisconnectedPlayersAfterHandEnd(io, room, rooms, roomActionTimeouts);
    syncActionTimeout(room.id);
  }

  function isActionRateLimited(): boolean {
    const now = Date.now();
    while (actionTimestamps.length > 0) {
      const oldest = actionTimestamps[0];
      if (oldest === undefined || now - oldest < ACTION_RATE_LIMIT_WINDOW_MS) {
        break;
      }
      actionTimestamps.shift();
    }
    if (actionTimestamps.length >= MAX_ACTIONS_PER_WINDOW) {
      return true;
    }

    actionTimestamps.push(now);
    return false;
  }

  socket.on('game:start', (payload: unknown, ack?: (result: GameStartAck) => void) => {
    const parsed = gameStartPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const room = rooms.get(parsed.data.roomId);
    if (!room) {
      ack?.({ ok: false, error: 'room_not_found' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership || membership.roomId !== parsed.data.roomId || !room.players.has(membership.playerId)) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    if (room.readyPlayerIds.size > 0 && room.readyPlayerIds.size < room.players.size) {
      ack?.({ ok: false, error: 'players_not_ready' });
      return;
    }

    if (room.hand && room.hand.phase !== 'hand_end') {
      ack?.({ ok: false, error: 'hand_already_started' });
      return;
    }

    const initialized = initializeHand({
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        seatIndex: player.seatIndex,
        stack: player.stack
      })),
      buttonMarkerSeat: parsed.data.buttonMarkerSeat ?? 0,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      rng: Math.random
    });

    if (!initialized.ok) {
      ack?.({ ok: false, error: initialized.error });
      return;
    }

    room.hand = initialized.value;
    room.handNumber += 1;
    resetActionSeqTracker(room);
    syncRoomPlayersFromHand(room);
    ack?.({ ok: true });
    emitStateAndProgress(room);
  });

  socket.on('game:action', (payload: unknown, ack?: (result: GameActionAckWithRateLimit) => void) => {
    const parsed = gameActionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    const room = rooms.get(parsed.data.roomId);
    if (!room) {
      ack?.({ ok: false, error: 'room_not_found' });
      return;
    }

    if (!room.hand) {
      ack?.({ ok: false, error: 'hand_not_started' });
      return;
    }

    const membership = memberships.get(socket.id);
    if (!membership || membership.roomId !== parsed.data.roomId || membership.playerId !== parsed.data.playerId) {
      ack?.({ ok: false, error: 'not_room_member' });
      return;
    }

    if (isActionRateLimited()) {
      ack?.({ ok: false, error: 'rate_limited' });
      return;
    }

    if (isDuplicateOrStaleActionSeq(room, parsed.data.playerId, parsed.data.seq)) {
      ack?.({ ok: false, error: 'duplicate_action_seq' });
      return;
    }

    const mappedType: EngineActionType = parsed.data.type === 'bet' ? 'raise_to' : parsed.data.type;
    const action: PlayerActionInput =
      parsed.data.amount === undefined
        ? {
            playerId: parsed.data.playerId,
            type: mappedType
          }
        : {
            playerId: parsed.data.playerId,
            type: mappedType,
            amount: parsed.data.amount
          };

    const result = applyAction(room.hand, action);
    if (!result.ok) {
      ack?.({ ok: false, error: result.error });
      return;
    }

    room.hand = result.value;
    recordActionSeq(room, parsed.data.playerId, parsed.data.seq);
    syncRoomPlayersFromHand(room);
    ack?.({ ok: true });
    emitStateAndProgress(room);
  });
}
