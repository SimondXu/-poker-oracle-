import type { Server } from 'socket.io';

import type { RuntimeRoom } from '../rooms/types.ts';

export function emitRoomState(io: Server, room: RuntimeRoom): void {
  io.to(room.id).emit('room:state', {
    roomId: room.id,
    playerCount: room.players.size
  });
}

export function emitGameState(io: Server, room: RuntimeRoom): void {
  if (!room.hand) {
    return;
  }

  io.to(room.id).emit('game:state', {
    roomId: room.id,
    hand: room.hand
  });
}
