import { getValidActions, type HandState as EngineHandState, type ValidActions as EngineValidActions } from '@aipoker/game-engine';
import {
  getRuleBotPersonality,
  type BotStatusEvent,
  type GameEvent as ClientGameEvent,
  type HandResultEvent,
  type ValidActions as ClientValidActions,
} from '@aipoker/shared';
import type { Server } from 'socket.io';

import { takeHandReviews } from '../game-loop/coach-review.ts';
import { getTableLifecycleSnapshot } from '../rooms/table-lifecycle.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { buildHandResultPayload } from './view-models/hand-result.ts';
import { buildHeroCoachEvent } from './view-models/hero-coach.ts';
import { buildClientAction, buildViewerHand } from './view-models/viewer-hand.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

function toClientValidActions(hand: EngineHandState, validActions: EngineValidActions): ClientValidActions {
  const isUnopenedStreet = hand.betting.currentBetToMatch === 0;

  return {
    canFold: validActions.canFold,
    canCheck: validActions.canCheck,
    canCall: validActions.canCall,
    callAmount: validActions.callAmount,
    canBet: isUnopenedStreet && validActions.canRaise,
    canRaise: !isUnopenedStreet && validActions.canRaise,
    minBetOrRaiseTo: validActions.minRaiseTo,
    maxBetOrRaiseTo: validActions.maxRaiseTo,
    canAllIn: validActions.canAllIn
  };
}

interface ActionRequiredPayload {
  roomId: string;
  playerId: string;
  stateVersion: number;
  timeoutMs: number;
  validActions: ClientValidActions;
}

function buildActionRequiredPayloadForSocket(
  socketId: string,
  room: RuntimeRoom,
  memberships: Map<string, RoomMembership>
): ActionRequiredPayload | null {
  if (!room.hand || room.hand.currentActorSeat === null) {
    return null;
  }

  const actor = getRoomPlayerBySeat(room, room.hand.currentActorSeat);
  if (!actor || actor.isBot) {
    return null;
  }

  const membership = memberships.get(socketId);
  if (!membership || membership.roomId !== room.id || membership.playerId !== actor.id) {
    return null;
  }

  return {
    roomId: room.id,
    playerId: actor.id,
    stateVersion: room.stateVersion,
    timeoutMs: room.actionTimeoutMs,
    validActions: toClientValidActions(room.hand, getValidActions(room.hand, actor.id))
  };
}

function emitActionRequired(io: Server, room: RuntimeRoom, memberships: Map<string, RoomMembership>): void {
  const roomSocketIds = io.sockets.adapter.rooms.get(room.id);
  if (!roomSocketIds) {
    return;
  }

  const actorSocketIds: string[] = [];
  for (const socketId of roomSocketIds) {
    const payload = buildActionRequiredPayloadForSocket(socketId, room, memberships);
    if (payload) {
      io.to(socketId).emit('game:action_required', payload);
      actorSocketIds.push(socketId);
    }
  }
  scheduleCoachAdvice(io, room, actorSocketIds);
}

/**
 * Sends the actor's coach advice on the next tick, so their controls never wait for the Monte Carlo.
 * The sockets are the ones just sent game:action_required, so advice reaches only the actor.
 */
function scheduleCoachAdvice(io: Server, room: RuntimeRoom, actorSocketIds: string[]): void {
  if (actorSocketIds.length === 0) {
    return;
  }
  const stateVersion = room.stateVersion;
  setImmediate(() => {
    if (room.stateVersion !== stateVersion) {
      return;
    }
    const event = buildHeroCoachEvent(room);
    if (event) {
      for (const socketId of actorSocketIds) {
        io.to(socketId).emit('game:coach', event);
      }
    }
  });
}

function emitHandResult(io: Server, room: RuntimeRoom): void {
  const payload = buildHandResultPayload(room);
  if (!payload) {
    return;
  }

  const event: HandResultEvent = {
    ...payload,
    stateVersion: room.stateVersion
  };
  io.to(room.id).emit('game:hand_result', event);
}

function emitGameEvents(io: Server, room: RuntimeRoom): void {
  if (!room.hand) {
    return;
  }

  if (room.hand.actions.length < room.lastBroadcastActionCount) {
    room.lastBroadcastActionCount = 0;
  }

  const newActions = room.hand.actions.slice(room.lastBroadcastActionCount);
  for (const [offset, action] of newActions.entries()) {
    const event: ClientGameEvent = {
      roomId: room.id,
      stateVersion: room.stateVersion,
      type: 'action_applied',
      action: buildClientAction(room.hand, room, action, room.lastBroadcastActionCount + offset),
    };
    io.to(room.id).emit('game:event', event);
  }

  room.lastBroadcastActionCount = room.hand.actions.length;
}

export function emitRoomState(io: Server, room: RuntimeRoom): void {
  const players = [...room.players.values()].map((p) => ({
    id: p.id,
    name: p.name,
    seatIndex: p.seatIndex,
    stack: p.stack,
    isBot: p.isBot,
    botStrategy: getRuleBotPersonality(p.botConfig),
    isReady: room.readyPlayerIds.has(p.id),
  }));
  io.to(room.id).emit('room:state', {
    roomId: room.id,
    stateVersion: room.stateVersion,
    players,
    playerCount: room.players.size,
    readyCount: room.readyPlayerIds.size,
    isPlaying: room.hand !== null && room.hand.phase !== 'hand_end',
    table: getTableLifecycleSnapshot(room),
    hostPlayerId: room.hostPlayerId,
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
    const viewerHand = buildViewerHand(room, viewerPlayerId);

    io.to(socketId).emit('game:state', {
      roomId: room.id,
      stateVersion: room.stateVersion,
      hand: viewerHand
    });
  }

  emitGameEvents(io, room);
  emitActionRequired(io, room, memberships);
  emitHandResult(io, room);
}

/** At hand end, each human's review goes to their own sockets only. */
export function emitHandReviews(io: Server, room: RuntimeRoom, memberships: Map<string, RoomMembership>): void {
  const reviews = takeHandReviews(room);
  const roomSocketIds = io.sockets.adapter.rooms.get(room.id);
  if (reviews.length === 0 || !roomSocketIds) {
    return;
  }
  for (const socketId of roomSocketIds) {
    const membership = memberships.get(socketId);
    const review = membership?.roomId === room.id ? reviews.find((candidate) => candidate.playerId === membership.playerId) : undefined;
    if (review) {
      io.to(socketId).emit('game:review', review);
    }
  }
}

export function emitBotStatus(
  io: Server,
  room: RuntimeRoom,
  event: Omit<BotStatusEvent, 'roomId' | 'stateVersion'>,
): void {
  io.to(room.id).emit('game:bot_status', {
    roomId: room.id,
    stateVersion: room.stateVersion,
    ...event,
  } satisfies BotStatusEvent);
}

export function emitGameStateToSocket(
  io: Server,
  socketId: string,
  room: RuntimeRoom,
  memberships: Map<string, RoomMembership>
): void {
  if (!room.hand) {
    return;
  }

  const membership = memberships.get(socketId);
  const viewerPlayerId = membership?.roomId === room.id ? membership.playerId : null;
  const viewerHand = buildViewerHand(room, viewerPlayerId);

  io.to(socketId).emit('game:state', {
    roomId: room.id,
    stateVersion: room.stateVersion,
    hand: viewerHand
  });

  const actionRequiredPayload = buildActionRequiredPayloadForSocket(socketId, room, memberships);
  if (actionRequiredPayload) {
    io.to(socketId).emit('game:action_required', actionRequiredPayload);
    scheduleCoachAdvice(io, room, [socketId]);
  }

  if (room.hand.phase === 'hand_end') {
    const handResultPayload = buildHandResultPayload(room);
    if (handResultPayload) {
      const event: HandResultEvent = {
        ...handResultPayload,
        stateVersion: room.stateVersion
      };
      io.to(socketId).emit('game:hand_result', event);
    }
  }

  // The client shows this hand's review once it is over, and the last hand's until the player's
  // first decision of the next; it decides which, so replay either.
  const review = viewerPlayerId ? room.coachReviews.get(viewerPlayerId) : undefined;
  if (review && review.handNumber >= room.handNumber - 1) {
    io.to(socketId).emit('game:review', review);
  }
}
