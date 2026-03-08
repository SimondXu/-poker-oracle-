import { applyAction, getValidActions, initializeHand, type ActionType as EngineActionType, type PlayerActionInput } from '@aipoker/game-engine';
import type { Server, Socket } from 'socket.io';

import { isDuplicateOrStaleActionSeq, recordActionSeq, resetActionSeqTracker } from '../../game-loop/action-seq.ts';
import {
  clearRoomActionTimeout,
  scheduleRoomActionTimeout,
  type RoomActionTimeouts
} from '../../game-loop/action-timeout.ts';
import {
  resolveButtonMarkerSeatForNextHand,
  type BotRuntimeDeps,
} from '../../game-loop/bot-support.ts';
import {
  clearRoomNextHandTimeout,
  scheduleRoomNextHandTimeout,
  type RoomNextHandTimeouts
} from '../../game-loop/auto-next-hand.ts';
import { cleanupDisconnectedPlayersAfterHandEnd } from '../../game-loop/cleanup-disconnected-players.ts';
import { runBotTurns } from '../../game-loop/run-bot-turns.ts';
import { enqueueRoomTask, type RoomTaskQueues } from '../../rooms/room-queue.ts';
import { syncRoomPlayersFromHand } from '../../rooms/room-store.ts';
import {
  canAutoContinueBotsOnly,
  canPlayerStartNextHand,
  getTableLifecycleSnapshot,
} from '../../rooms/table-lifecycle.ts';
import type { RoomMembership, RuntimeRoom } from '../../rooms/types.ts';
import { emitGameState } from '../emitters.ts';
import {
  gameActionPayloadSchema,
  gameSpectatePayloadSchema,
  gameStartPayloadSchema,
  type GameActionAck,
  type GameSpectateAck,
  type GameStartAck,
} from '../schemas.ts';

interface RegisterGameEventsInput {
  io: Server;
  socket: Socket;
  rooms: Map<string, RuntimeRoom>;
  memberships: Map<string, RoomMembership>;
  roomActionTimeouts: RoomActionTimeouts;
  roomNextHandTimeouts: RoomNextHandTimeouts;
  roomTaskQueues: RoomTaskQueues;
  actionTimeoutMs: number;
  nowMs: () => number;
  botRuntime: BotRuntimeDeps;
}

const ACTION_RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_ACTIONS_PER_WINDOW = 20;
const BOTS_ONLY_AUTO_NEXT_DELAY_MS = 1_500;

export function registerGameEvents(input: RegisterGameEventsInput): void {
  const { io, socket, rooms, memberships, roomActionTimeouts, roomNextHandTimeouts, roomTaskQueues, actionTimeoutMs, nowMs, botRuntime } = input;
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

    const timeoutActorId = actor.id;
    const timeoutActionCount = room.hand.actions.length;
    scheduleRoomActionTimeout(roomActionTimeouts, room.id, actionTimeoutMs, () => {
      void enqueueRoomTask(roomTaskQueues, room.id, async () => {
        const latestRoom = rooms.get(room.id);
        if (!latestRoom || !latestRoom.hand || latestRoom.hand.currentActorSeat === null) {
          clearRoomActionTimeout(roomActionTimeouts, room.id);
          return;
        }

        if (latestRoom.hand.actions.length !== timeoutActionCount) {
          return;
        }

        const latestActor = getRoomPlayerBySeat(latestRoom, latestRoom.hand.currentActorSeat);
        if (!latestActor || latestActor.isBot || latestActor.id !== timeoutActorId) {
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

        const timeoutResult = applyAction(latestRoom.hand, timeoutAction, { timestamp: nowMs() });
        if (!timeoutResult.ok) {
          clearRoomActionTimeout(roomActionTimeouts, room.id);
          return;
        }

        latestRoom.hand = timeoutResult.value;
        syncRoomPlayersFromHand(latestRoom);
        await emitStateAndProgress(latestRoom);
      }).catch((error: unknown) => {
        console.error('room action timeout task failed', error);
      });
    });
  }

  function syncBotsOnlyAutoNext(room: RuntimeRoom): void {
    if (!rooms.has(room.id) || !room.hand) {
      clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
      return;
    }

    if (room.hand.phase !== 'hand_end' || !canAutoContinueBotsOnly(room)) {
      clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
      return;
    }

    scheduleRoomNextHandTimeout(roomNextHandTimeouts, room.id, BOTS_ONLY_AUTO_NEXT_DELAY_MS, () => {
      void enqueueRoomTask(roomTaskQueues, room.id, async () => {
        const latestRoom = rooms.get(room.id);
        if (!latestRoom || !latestRoom.hand) {
          return;
        }

        if (latestRoom.hand.phase !== 'hand_end' || !canAutoContinueBotsOnly(latestRoom)) {
          return;
        }

        const initialized = initializeHand({
          players: [...latestRoom.players.values()].map((player) => ({
            id: player.id,
            seatIndex: player.seatIndex,
            stack: player.stack
          })),
          buttonMarkerSeat: resolveButtonMarkerSeatForNextHand(latestRoom, undefined, botRuntime.rng),
          smallBlind: latestRoom.smallBlind,
          bigBlind: latestRoom.bigBlind,
          rng: botRuntime.rng
        });
        if (!initialized.ok) {
          return;
        }

        latestRoom.hand = initialized.value;
        latestRoom.handNumber += 1;
        latestRoom.lastButtonMarkerSeat = initialized.value.buttonMarkerSeat;
        resetActionSeqTracker(latestRoom);
        syncRoomPlayersFromHand(latestRoom);
        await emitStateAndProgress(latestRoom);
      }).catch((error: unknown) => {
        console.error('bots-only auto next hand task failed', error);
      });
    });
  }

  async function emitStateAndProgress(room: RuntimeRoom): Promise<void> {
    room.stateVersion += 1;
    emitGameState(io, room, memberships);
    await runBotTurns(io, room, memberships, botRuntime);
    cleanupDisconnectedPlayersAfterHandEnd(io, room, rooms, roomActionTimeouts, roomNextHandTimeouts);
    syncActionTimeout(room.id);
    syncBotsOnlyAutoNext(room);
  }

  function isActionRateLimited(): boolean {
    const now = nowMs();
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
    void enqueueRoomTask(roomTaskQueues, parsed.data.roomId, async () => {
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

      const tableLifecycle = getTableLifecycleSnapshot(room);
      if (tableLifecycle.isTableFinished) {
        ack?.({ ok: false, error: 'table_finished' });
        return;
      }

      if (tableLifecycle.activeStackPlayerCount < 2) {
        ack?.({ ok: false, error: 'not_enough_players' });
        return;
      }

      if (!canPlayerStartNextHand(room, membership.playerId)) {
        ack?.({ ok: false, error: 'starter_not_active' });
        return;
      }

      // Only count stack-positive human players in the readiness gate (bots are auto-ready).
      const humanPlayers = [...room.players.values()].filter((p) => !p.isBot && p.stack > 0);
      const humanReadyCount = humanPlayers.filter((p) => room.readyPlayerIds.has(p.id)).length;
      if (humanReadyCount > 0 && humanReadyCount < humanPlayers.length) {
        ack?.({ ok: false, error: 'players_not_ready' });
        return;
      }

      const initialized = initializeHand({
        players: [...room.players.values()].map((player) => ({
          id: player.id,
          seatIndex: player.seatIndex,
          stack: player.stack
        })),
        buttonMarkerSeat: resolveButtonMarkerSeatForNextHand(room, parsed.data.buttonMarkerSeat, botRuntime.rng),
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        rng: botRuntime.rng
      });

      if (!initialized.ok) {
        ack?.({ ok: false, error: initialized.error });
        return;
      }

      clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
      room.hand = initialized.value;
      room.handNumber += 1;
      room.lastButtonMarkerSeat = initialized.value.buttonMarkerSeat;
      resetActionSeqTracker(room);
      syncRoomPlayersFromHand(room);
      ack?.({ ok: true });
      await emitStateAndProgress(room);
    }).catch((error: unknown) => {
      console.error('game:start room task failed', error);
    });
  });

  socket.on('game:spectate', (payload: unknown, ack?: (result: GameSpectateAck) => void) => {
    const parsed = gameSpectatePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    void enqueueRoomTask(roomTaskQueues, parsed.data.roomId, async () => {
      const room = rooms.get(parsed.data.roomId);
      if (!room) {
        ack?.({ ok: false, error: 'room_not_found' });
        return;
      }

      const membership = memberships.get(socket.id);
      if (!membership || membership.roomId !== parsed.data.roomId) {
        ack?.({ ok: false, error: 'not_room_member' });
        return;
      }

      if (!room.hand) {
        ack?.({ ok: false, error: 'hand_not_started' });
        return;
      }

      if (room.hand.phase !== 'hand_end') {
        ack?.({ ok: false, error: 'hand_not_actionable' });
        return;
      }

      const player = room.players.get(membership.playerId);
      if (!player || player.isBot || player.stack > 0) {
        ack?.({ ok: false, error: 'not_eliminated' });
        return;
      }

      room.spectatingPlayerIds.add(player.id);
      ack?.({ ok: true });
      syncBotsOnlyAutoNext(room);
    }).catch((error: unknown) => {
      console.error('game:spectate room task failed', error);
    });
  });

  socket.on('game:action', (payload: unknown, ack?: (result: GameActionAck) => void) => {
    const parsed = gameActionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    if (isActionRateLimited()) {
      ack?.({ ok: false, error: 'rate_limited' });
      return;
    }
    void enqueueRoomTask(roomTaskQueues, parsed.data.roomId, async () => {
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
      if (!membership || membership.roomId !== parsed.data.roomId) {
        ack?.({ ok: false, error: 'not_room_member' });
        return;
      }

      const actionPlayerId = membership.playerId;
      if (parsed.data.playerId && parsed.data.playerId !== actionPlayerId) {
        ack?.({ ok: false, error: 'not_room_member' });
        return;
      }

      if (parsed.data.expectedVersion !== undefined && parsed.data.expectedVersion !== room.stateVersion) {
        ack?.({ ok: false, error: 'stale_state_version' });
        return;
      }

      if (isDuplicateOrStaleActionSeq(room, actionPlayerId, parsed.data.seq)) {
        ack?.({ ok: false, error: 'duplicate_action_seq' });
        return;
      }

      const mappedType: EngineActionType = parsed.data.type === 'bet' ? 'raise_to' : parsed.data.type;
      const action: PlayerActionInput =
        parsed.data.amount === undefined
          ? {
              playerId: actionPlayerId,
              type: mappedType
            }
          : {
              playerId: actionPlayerId,
              type: mappedType,
              amount: parsed.data.amount
            };

      const result = applyAction(room.hand, action, { timestamp: nowMs() });
      if (!result.ok) {
        ack?.({ ok: false, error: result.error });
        return;
      }

      room.hand = result.value;
      recordActionSeq(room, actionPlayerId, parsed.data.seq);
      syncRoomPlayersFromHand(room);
      ack?.({ ok: true });
      await emitStateAndProgress(room);
    }).catch((error: unknown) => {
      console.error('game:action room task failed', error);
    });
  });
}
