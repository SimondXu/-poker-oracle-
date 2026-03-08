import type { Server } from 'socket.io';

import type { RoomActionTimeouts } from './action-timeout.ts';
import { clearRoomActionTimeout } from './action-timeout.ts';
import type { RoomNextHandTimeouts } from './auto-next-hand.ts';
import { clearRoomNextHandTimeout } from './auto-next-hand.ts';
import { syncRoomOwner } from '../rooms/room-store.ts';
import type { RuntimeRoom } from '../rooms/types.ts';
import { emitRoomState } from '../ws/emitters.ts';

export function cleanupDisconnectedPlayersAfterHandEnd(
  io: Server,
  room: RuntimeRoom,
  rooms: Map<string, RuntimeRoom>,
  roomActionTimeouts: RoomActionTimeouts,
  roomNextHandTimeouts: RoomNextHandTimeouts
): void {
  if (!room.hand || room.hand.phase !== 'hand_end' || room.pendingDisconnectPlayerIds.size === 0) {
    return;
  }

  for (const playerId of room.pendingDisconnectPlayerIds) {
    room.players.delete(playerId);
    room.readyPlayerIds.delete(playerId);
    room.lastActionSeqByPlayer.delete(playerId);
  }

  room.pendingDisconnectPlayerIds.clear();
  syncRoomOwner(room);

  if (room.players.size === 0) {
    clearRoomActionTimeout(roomActionTimeouts, room.id);
    clearRoomNextHandTimeout(roomNextHandTimeouts, room.id);
    rooms.delete(room.id);
    return;
  }

  emitRoomState(io, room);
}
