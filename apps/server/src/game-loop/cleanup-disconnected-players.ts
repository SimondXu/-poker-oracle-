import type { Server } from 'socket.io';

import type { RoomActionTimeouts } from './action-timeout.ts';
import { clearRoomActionTimeout } from './action-timeout.ts';
import type { RuntimeRoom } from '../rooms/types.ts';
import { emitRoomState } from '../ws/emitters.ts';

export function cleanupDisconnectedPlayersAfterHandEnd(
  io: Server,
  room: RuntimeRoom,
  rooms: Map<string, RuntimeRoom>,
  roomActionTimeouts: RoomActionTimeouts
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

  if (room.players.size === 0) {
    clearRoomActionTimeout(roomActionTimeouts, room.id);
    rooms.delete(room.id);
    return;
  }

  emitRoomState(io, room);
}
