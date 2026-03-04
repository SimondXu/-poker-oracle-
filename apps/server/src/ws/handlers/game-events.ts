import { applyAction, initializeHand, type PlayerActionInput } from '@aipoker/game-engine';
import type { Server, Socket } from 'socket.io';

import { isDuplicateOrStaleActionSeq, recordActionSeq, resetActionSeqTracker } from '../../game-loop/action-seq.ts';
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
}

export function registerGameEvents(input: RegisterGameEventsInput): void {
  const { io, socket, rooms, memberships } = input;

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
    resetActionSeqTracker(room);
    syncRoomPlayersFromHand(room);
    ack?.({ ok: true });
    emitGameState(io, room, memberships);
    runBotTurns(io, room, memberships);
  });

  socket.on('game:action', (payload: unknown, ack?: (result: GameActionAck) => void) => {
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

    if (isDuplicateOrStaleActionSeq(room, parsed.data.playerId, parsed.data.seq)) {
      ack?.({ ok: false, error: 'duplicate_action_seq' });
      return;
    }

    const action: PlayerActionInput =
      parsed.data.amount === undefined
        ? {
            playerId: parsed.data.playerId,
            type: parsed.data.type
          }
        : {
            playerId: parsed.data.playerId,
            type: parsed.data.type,
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
    emitGameState(io, room, memberships);
    runBotTurns(io, room, memberships);
  });
}
