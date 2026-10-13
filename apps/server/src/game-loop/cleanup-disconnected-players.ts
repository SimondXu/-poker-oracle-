import type { Server } from 'socket.io';

import { hasHumanPlayers, syncRoomHost } from '../rooms/room-store.ts';
import type { RuntimeRoom } from '../rooms/types.ts';
import { emitRoomState } from '../ws/emitters.ts';
import { forgetCoachPlayer } from './coach-review.ts';

export function cleanupDisconnectedPlayersAfterHandEnd(
  io: Server,
  room: RuntimeRoom,
  deleteRoom: (roomId: string) => void
): void {
  if (!room.hand || room.hand.phase !== 'hand_end' || room.pendingDisconnectPlayerIds.size === 0) {
    return;
  }

  for (const playerId of room.pendingDisconnectPlayerIds) {
    room.players.delete(playerId);
    room.readyPlayerIds.delete(playerId);
    room.spectatingPlayerIds.delete(playerId);
    room.lastActionSeqByPlayer.delete(playerId);
    forgetCoachPlayer(room, playerId);
  }

  room.pendingDisconnectPlayerIds.clear();
  syncRoomHost(room);

  if (!hasHumanPlayers(room)) {
    deleteRoom(room.id);
    return;
  }

  emitRoomState(io, room);
}
