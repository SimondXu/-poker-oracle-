import { initializeHand } from '@aipoker/game-engine';
import type { Server } from 'socket.io';

import { resetActionSeqTracker } from './action-seq.ts';
import type { RoomActionTimeouts } from './action-timeout.ts';
import { scheduleRoomNextHandTimeout, clearRoomNextHandTimeout, type RoomNextHandTimeouts } from './auto-next-hand.ts';
import { cleanupDisconnectedPlayersAfterHandEnd } from './cleanup-disconnected-players.ts';
import { runBotTurns } from './run-bot-turns.ts';
import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import { enqueueRoomTask, type RoomTaskQueues } from '../rooms/room-queue.ts';
import { getTableLifecycleSnapshot } from '../rooms/table-lifecycle.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { emitGameState } from '../ws/emitters.ts';

const BOTS_ONLY_AUTO_NEXT_DELAY_MS = 1_500;

interface SyncBotsOnlyAutoNextInput {
  io: Server;
  room: RuntimeRoom;
  rooms: Map<string, RuntimeRoom>;
  memberships: Map<string, RoomMembership>;
  roomActionTimeouts: RoomActionTimeouts;
  roomNextHandTimeouts: RoomNextHandTimeouts;
  roomTaskQueues: RoomTaskQueues;
}

export function syncBotsOnlyAutoNextHand(input: SyncBotsOnlyAutoNextInput): void {
  const { io, room, rooms, memberships, roomActionTimeouts, roomNextHandTimeouts, roomTaskQueues } = input;

  if (!rooms.has(room.id) || !room.hand) {
    clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
    return;
  }

  const tableLifecycle = getTableLifecycleSnapshot(room);
  if (room.hand.phase !== 'hand_end' || !tableLifecycle.isBotsOnlyContinuation) {
    clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
    return;
  }

  scheduleRoomNextHandTimeout(roomNextHandTimeouts, room.id, BOTS_ONLY_AUTO_NEXT_DELAY_MS, () => {
    void enqueueRoomTask(roomTaskQueues, room.id, async () => {
      const latestRoom = rooms.get(room.id);
      if (!latestRoom || !latestRoom.hand) {
        return;
      }

      const latestLifecycle = getTableLifecycleSnapshot(latestRoom);
      if (latestRoom.hand.phase !== 'hand_end' || !latestLifecycle.isBotsOnlyContinuation) {
        return;
      }

      const initialized = initializeHand({
        players: [...latestRoom.players.values()].map((player) => ({
          id: player.id,
          seatIndex: player.seatIndex,
          stack: player.stack,
        })),
        buttonMarkerSeat: latestRoom.hand.buttonMarkerSeat,
        smallBlind: latestRoom.smallBlind,
        bigBlind: latestRoom.bigBlind,
        rng: Math.random,
      });
      if (!initialized.ok) {
        return;
      }

      latestRoom.hand = initialized.value;
      latestRoom.handNumber += 1;
      latestRoom.stateVersion += 1;
      resetActionSeqTracker(latestRoom);
      syncRoomPlayersFromHand(latestRoom);
      emitGameState(io, latestRoom, memberships);
      await runBotTurns(io, latestRoom, memberships);
      cleanupDisconnectedPlayersAfterHandEnd(io, latestRoom, rooms, roomActionTimeouts, roomNextHandTimeouts);
      syncBotsOnlyAutoNextHand({ ...input, room: latestRoom });
    }).catch((error: unknown) => {
      console.error('bots-only auto next hand task failed', error);
    });
  });
}
