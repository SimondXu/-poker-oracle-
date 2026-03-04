import type { Server } from 'socket.io';

import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';

export function emitRoomState(io: Server, room: RuntimeRoom): void {
  io.to(room.id).emit('room:state', {
    roomId: room.id,
    playerCount: room.players.size
  });
}

function buildViewerHand(room: RuntimeRoom, viewerPlayerId: string | null) {
  if (!room.hand) {
    return null;
  }

  const revealAll = room.hand.phase === 'hand_end';
  return {
    ...room.hand,
    players: room.hand.players.map((player) => {
      if (revealAll || player.id === viewerPlayerId) {
        return player;
      }
      return {
        ...player,
        holeCards: []
      };
    })
  };
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
    const viewerHand = buildViewerHand(room, viewerPlayerId);
    if (!viewerHand) {
      continue;
    }

    io.to(socketId).emit('game:state', {
      roomId: room.id,
      hand: viewerHand
    });
  }
}
