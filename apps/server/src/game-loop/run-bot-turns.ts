import { chooseBotAction } from '@aipoker/bot-engine';
import { applyAction, type PlayerActionInput } from '@aipoker/game-engine';
import type { Server } from 'socket.io';

import { buildBotDecisionContext, type BotRuntimeDeps } from './bot-support.ts';
import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RoomMembership, RuntimeRoom } from '../rooms/types.ts';
import { emitGameState } from '../ws/emitters.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
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
  runtime: BotRuntimeDeps,
): Promise<void> {
  while (room.hand && room.hand.currentActorSeat !== null) {
    const seatIndex = room.hand.currentActorSeat;
    const actor = getRoomPlayerBySeat(room, seatIndex);

    if (!actor || !actor.isBot) {
      // Human's turn — stop
      return;
    }

    const context = buildBotDecisionContext(room, actor.id);
    if (!context) {
      return;
    }

    const botAction = chooseBotAction(
      context,
      actor.botStrategy ?? 'fish',
      runtime.rng,
    );

    await runtime.sleep(botAction.thinkingDelayMs);

    // Re-validate state after the delay (disconnect or other events may have mutated it)
    if (!room.hand || room.hand.currentActorSeat !== seatIndex) {
      return;
    }
    const actorAfterDelay = getRoomPlayerBySeat(room, seatIndex);
    if (!actorAfterDelay || actorAfterDelay.id !== actor.id || !actorAfterDelay.isBot) {
      return;
    }

    const actionInput = buildActionInput(actor.id, botAction);
    const result = applyAction(room.hand, actionInput, { timestamp: runtime.nowMs() });
    if (!result.ok) {
      return;
    }

    room.hand = result.value;
    room.stateVersion += 1;
    syncRoomPlayersFromHand(room);
    emitGameState(io, room, memberships);
  }
}
