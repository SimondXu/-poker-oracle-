import { chooseBotAction } from '@aipoker/bot-engine';
import { applyAction, getValidActions, type PlayerActionInput } from '@aipoker/game-engine';
import type { BotPersonality, Card } from '@aipoker/shared';
import type { Server } from 'socket.io';

import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { emitGameState } from '../ws/emitters.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildActionInput(
  actorId: string,
  botAction: ReturnType<typeof chooseBotAction>,
): PlayerActionInput {
  switch (botAction.type) {
    case 'raise_to':
      return { playerId: actorId, type: 'raise_to', amount: botAction.amount };
    case 'call':
      return { playerId: actorId, type: 'call' };
    case 'all_in':
      return { playerId: actorId, type: 'all_in' };
    case 'check':
      return { playerId: actorId, type: 'check' };
    default:
      return { playerId: actorId, type: 'fold' };
  }
}

/**
 * Runs all consecutive bot turns asynchronously, with a simulated thinking
 * delay between each action. Stops when the current actor is a human or the
 * hand reaches a terminal state.
 */
export async function runBotTurns(
  io: Server,
  room: RuntimeRoom,
  memberships: Map<string, RoomMembership>,
): Promise<void> {
  while (room.hand && room.hand.currentActorSeat !== null) {
    const seatIndex = room.hand.currentActorSeat;
    const actor = getRoomPlayerBySeat(room, seatIndex);

    if (!actor || !actor.isBot) {
      // Human's turn — stop
      return;
    }

    const valid = getValidActions(room.hand, actor.id);
    const currentPlayer = room.hand.players.find((p) => p.id === actor.id);
    const potTotal = room.hand.pots.reduce((s, p) => s + p.amount, 0);

    const botAction = chooseBotAction(
      {
        canFold: valid.canFold,
        canCheck: valid.canCheck,
        canCall: valid.canCall,
        callAmount: valid.callAmount,
        canRaise: valid.canRaise,
        minRaiseTo: valid.minRaiseTo,
        maxRaiseTo: valid.maxRaiseTo,
        canAllIn: valid.canAllIn,
        potTotal,
        myStack: currentPlayer?.stack ?? 0,
        holeCards: (currentPlayer?.holeCards as Card[] | undefined) ?? [],
        communityCards: room.hand.communityCards as Card[],
      },
      (actor.botStrategy ?? 'fish') as BotPersonality,
      Math.random,
    );

    // Simulate thinking delay
    await sleep(botAction.thinkingDelayMs);

    // Re-validate state after the delay (disconnect or other events may have mutated it)
    if (!room.hand || room.hand.currentActorSeat !== seatIndex) {
      return;
    }
    const actorAfterDelay = getRoomPlayerBySeat(room, seatIndex);
    if (!actorAfterDelay || actorAfterDelay.id !== actor.id || !actorAfterDelay.isBot) {
      return;
    }

    const actionInput = buildActionInput(actor.id, botAction);
    const result = applyAction(room.hand, actionInput);
    if (!result.ok) {
      return;
    }

    room.hand = result.value;
    syncRoomPlayersFromHand(room);
    emitGameState(io, room, memberships);
  }
}
