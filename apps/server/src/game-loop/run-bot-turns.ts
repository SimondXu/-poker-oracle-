import { chooseBotAction } from '@aipoker/bot-engine';
import { applyAction, getValidActions, type PlayerActionInput } from '@aipoker/game-engine';
import type { Server } from 'socket.io';

import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { emitGameState } from '../ws/emitters.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

export function runBotTurns(io: Server, room: RuntimeRoom, memberships: Map<string, RoomMembership>): void {
  while (room.hand && room.hand.currentActorSeat !== null) {
    const actor = getRoomPlayerBySeat(room, room.hand.currentActorSeat);
    if (!actor || !actor.isBot) {
      return;
    }

    const valid = getValidActions(room.hand, actor.id);
    const botAction = chooseBotAction(
      {
        canCheck: valid.canCheck,
        canCall: valid.canCall,
        callAmount: valid.callAmount
      },
      Math.random
    );

    const action: PlayerActionInput =
      botAction.type === 'call'
        ? {
            playerId: actor.id,
            type: 'call'
          }
        : {
            playerId: actor.id,
            type: botAction.type
          };

    const result = applyAction(room.hand, action);
    if (!result.ok) {
      return;
    }

    room.hand = result.value;
    syncRoomPlayersFromHand(room);
    emitGameState(io, room, memberships);
  }
}
