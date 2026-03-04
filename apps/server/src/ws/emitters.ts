import type { Server } from 'socket.io';

import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { buildViewerHand } from './view-models/viewer-hand.ts';

export function emitRoomState(io: Server, room: RuntimeRoom): void {
  io.to(room.id).emit('room:state', {
    roomId: room.id,
    playerCount: room.players.size
  });
}

export function emitGameState(io: Server, room: RuntimeRoom, memberships: Map<string, RoomMembership>): void {
  if (!room.hand) {
    return;
  }

  const roomSocketIds = io.sockets.adapter.rooms.get(room.id);
  if (!roomSocketIds) {
    return;
  }

  for (const socketId of roomSocketIds) {
    const membership = memberships.get(socketId);
    const viewerPlayerId = membership?.roomId === room.id ? membership.playerId : null;
    const viewerHand = buildViewerHand(room.hand, viewerPlayerId);

    io.to(socketId).emit('game:state', {
      roomId: room.id,
      hand: viewerHand
    });
  }
}
