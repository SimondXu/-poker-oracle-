import { chooseBotAction } from '@aipoker/strategy-engine';
import { applyAction, getValidActions, type PlayerActionInput } from '@aipoker/game-engine';
import { getRuleBotPersonality, type BotDecisionContext } from '@aipoker/shared';
import type { Server } from 'socket.io';

import {
  buildBotDecisionContext,
  getBotPreflopFoldStreak,
  isFirstPreflopDecisionForPlayer,
  trackBotPreflopEntryDecision,
  type BotRuntimeDeps,
} from './bot-support.ts';
import { selectEmergencyBotActionInput } from './realtime-bot-fallback.ts';
import { syncRoomPlayersFromHand } from '../rooms/room-store.ts';
import type { RoomMembership, RuntimePlayer, RuntimeRoom } from '../rooms/types.ts';
import { emitGameState } from '../ws/emitters.ts';

function getRoomPlayerBySeat(room: RuntimeRoom, seatIndex: number) {
  return [...room.players.values()].find((player) => player.seatIndex === seatIndex);
}

/** First bot action of a hand waits for the client's hole-card deal (~1.5s at six seats). */
const DEAL_PAUSE_MS = 1_200;
/**
 * First bot action of a street waits for the client to hold the closing action (~0.9s) and reveal
 * the new card, so the card is on screen for a beat before anyone acts on it.
 */
const NEW_STREET_PAUSE_MS = 1_800;

export function getStreetOpeningPauseMs(hand: Pick<NonNullable<RuntimeRoom['hand']>, 'phase' | 'actions'>): number {
  if (hand.actions.some((action) => action.phase === hand.phase)) {
    return 0;
  }
  return hand.phase === 'betting_preflop' ? DEAL_PAUSE_MS : NEW_STREET_PAUSE_MS;
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

export interface StartRealtimeLlmTurnInput {
  room: RuntimeRoom;
  actor: RuntimePlayer;
  context: BotDecisionContext;
}

export type StartRealtimeLlmTurn = (input: StartRealtimeLlmTurnInput) => void;

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
  startRealtimeLlmTurn?: StartRealtimeLlmTurn,
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
    if (actor.botConfig?.kind === 'llm') {
      startRealtimeLlmTurn?.({
        room,
        actor,
        context,
      });
      return;
    }

    const personality = actor.botConfig ? getRuleBotPersonality(actor.botConfig) : 'fish';
    if (!personality) {
      return;
    }
    const isFirstPreflopDecision = context.phase === 'preflop' && isFirstPreflopDecisionForPlayer(room.hand, actor.id);

    const botAction = chooseBotAction(
      context,
      personality,
      runtime.rng,
      {
        preflopConsecutiveFolds: getBotPreflopFoldStreak(room, actor.id),
        isFirstPreflopDecision,
      },
    );

    await runtime.sleep(botAction.thinkingDelayMs + getStreetOpeningPauseMs(room.hand));

    // Re-validate state after the delay (disconnect or other events may have mutated it)
    if (!room.hand || room.hand.currentActorSeat !== seatIndex) {
      return;
    }
    const actorAfterDelay = getRoomPlayerBySeat(room, seatIndex);
    if (!actorAfterDelay || actorAfterDelay.id !== actor.id || !actorAfterDelay.isBot) {
      return;
    }

    const actionInput = buildActionInput(actor.id, botAction);
    const handBeforeAction = room.hand;
    let result = applyAction(handBeforeAction, actionInput, { timestamp: runtime.nowMs() });
    if (!result.ok) {
      // An illegal heuristic choice must not stall the table; fall back to the safest legal action.
      console.error('rule bot chose an illegal action', { roomId: room.id, playerId: actor.id, action: actionInput });
      const emergencyAction = selectEmergencyBotActionInput(actor.id, getValidActions(handBeforeAction, actor.id));
      result = applyAction(handBeforeAction, emergencyAction, { timestamp: runtime.nowMs() });
      if (!result.ok) {
        return;
      }
    }
    trackBotPreflopEntryDecision(room, handBeforeAction, actor.id, botAction.type);

    room.hand = result.value;
    room.stateVersion += 1;
    syncRoomPlayersFromHand(room);
    emitGameState(io, room, memberships);
  }
}
