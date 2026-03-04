import { getValidActions } from '@aipoker/game-engine';
import type { Server } from 'socket.io';

import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { buildHandResultPayload } from './view-models/hand-result.ts';
import { buildViewerHand } from './view-models/viewer-hand.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

function emitActionRequired(io: Server, room: RuntimeRoom, memberships: Map<string, RoomMembership>): void {
  if (!room.hand || room.hand.currentActorSeat === null) {
    return;
  }

  const actor = getRoomPlayerBySeat(room, room.hand.currentActorSeat);
  if (!actor || actor.isBot) {
    return;
  }

  const validActions = getValidActions(room.hand, actor.id);
  const roomSocketIds = io.sockets.adapter.rooms.get(room.id);
  if (!roomSocketIds) {
    return;
  }

  for (const socketId of roomSocketIds) {
    const membership = memberships.get(socketId);
    if (!membership || membership.roomId !== room.id || membership.playerId !== actor.id) {
      continue;
    }

    io.to(socketId).emit('game:action_required', {
      roomId: room.id,
      playerId: actor.id,
      timeoutMs: room.actionTimeoutMs,
      validActions
    });
  }
}

function emitHandResult(io: Server, room: RuntimeRoom): void {
  const payload = buildHandResultPayload(room);
  if (!payload) {
    return;
  }

  io.to(room.id).emit('game:hand_result', payload);
}

function emitGameEvents(io: Server, room: RuntimeRoom): void {
  if (!room.hand) {
    return;
  }

  if (room.hand.actions.length < room.lastBroadcastActionCount) {
    room.lastBroadcastActionCount = 0;
  }

  const newActions = room.hand.actions.slice(room.lastBroadcastActionCount);
  for (const action of newActions) {
    io.to(room.id).emit('game:event', {
      roomId: room.id,
      type: 'action_applied',
      action
    });
  }

  room.lastBroadcastActionCount = room.hand.actions.length;
}

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

  emitGameEvents(io, room);
  emitActionRequired(io, room, memberships);
  emitHandResult(io, room);
}
