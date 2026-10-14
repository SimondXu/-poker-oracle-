import { createHash } from 'node:crypto';

import { emptyBotMemory, emptyLedger, type BotSessionMemory, type BotTurnInput, type HandEndInput, type Ledger } from '@aipoker/agent-engine';
import { getValidActions } from '@aipoker/game-engine';
import { buildDecisionContext, type DecisionHand } from '@aipoker/strategy-engine';

import type { RuntimeRoom } from '../rooms/types.ts';
import { toDecisionView } from '../ws/view-models/hero-coach.ts';
import { buildViewerHand } from '../ws/view-models/viewer-hand.ts';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    const children = value instanceof Map ? [...value.keys(), ...value.values()] : Object.values(value);
    children.forEach(deepFreeze);
  }
  return value;
}

/**
 * The bot's view in the strategy engine's shape, with only the fields a decision reads: the viewer
 * projection carries names, the last aggressor's id and rule-bot labels that a prompt must not see.
 */
function toBotView(room: RuntimeRoom, botId: string): DecisionHand {
  const view = toDecisionView(buildViewerHand(room, botId));
  return {
    phase: view.phase,
    smallBlind: view.smallBlind,
    bigBlind: view.bigBlind,
    buttonMarkerSeat: view.buttonMarkerSeat,
    potTotal: view.potTotal,
    players: view.players.map((player) => ({
      id: player.id,
      seatIndex: player.seatIndex,
      stack: player.stack,
      streetCommitted: player.streetCommitted,
      handCommitted: player.handCommitted,
      status: player.status,
      holeCards: [...player.holeCards],
    })),
    communityCards: [...view.communityCards],
    actions: view.actions.map((action) => ({
      playerId: action.playerId,
      phase: action.phase,
      type: action.type,
      toAmount: action.toAmount,
      potTotalBefore: action.potTotalBefore,
    })),
    betting: { currentBetToMatch: view.betting.currentBetToMatch, lastFullRaiseSize: view.betting.lastFullRaiseSize },
  };
}

function copyMemory(memory: BotSessionMemory | undefined): BotSessionMemory {
  return memory ? structuredClone(memory) : emptyBotMemory();
}

/**
 * Everything an LLM bot's decision may read, frozen at the start of its turn. Built only from the
 * bot's viewer hand, the public stats, the room's public opponent ledger and its own memory: never the deck, other players' cards or
 * `room.coach*` (which hold humans' hole cards). Null when it is not this bot's turn.
 */
export function buildBotTurnInput(room: RuntimeRoom, botId: string, memory?: BotSessionMemory, ledger?: Ledger): BotTurnInput | null {
  const hand = room.hand;
  const actor = hand?.players.find((player) => player.seatIndex === hand.currentActorSeat);
  if (!hand || !actor || actor.id !== botId) {
    return null;
  }

  const view = toBotView(room, botId);
  const stats = new Map([...room.playerStats].map(([playerId, playerStats]) => [playerId, { ...playerStats }]));
  const context = buildDecisionContext(view, botId, getValidActions(hand, botId), stats);
  if (!context) {
    return null;
  }

  const actionIndex = view.actions.length;
  return deepFreeze({
    roomId: room.id,
    handNumber: room.handNumber,
    actionIndex,
    stateVersion: room.stateVersion,
    botId,
    view,
    context,
    seats: new Map(view.players.map((player) => [player.id, player.seatIndex + 1])),
    stats,
    memory: copyMemory(memory),
    ledger: structuredClone(ledger ?? emptyLedger()),
    seedBase: `${room.id}:${room.handNumber}:${botId}:${actionIndex}`,
  });
}

/** A seat occupant's key in memory: lets impressions reset when the occupant changes, and is never rendered. */
function occupantKey(playerId: string): string {
  return createHash('sha256').update(playerId).digest('hex').slice(0, 16);
}

/**
 * What the memory reducer reads when a hand ends: the bot's viewer hand (others' cards only if shown
 * at the showdown) and the public payouts. Null before hand end or if the bot wasn't dealt in.
 */
export function buildBotHandEnd(room: RuntimeRoom, botId: string): HandEndInput | null {
  const hand = room.hand;
  if (!hand || hand.phase !== 'hand_end' || !hand.players.some((player) => player.id === botId)) {
    return null;
  }
  const view = toBotView(room, botId);
  return {
    view,
    botId,
    handNumber: room.handNumber,
    seats: new Map(view.players.map((player) => [player.id, player.seatIndex + 1])),
    payouts: hand.payouts.map(({ playerId, amount }) => ({ playerId, amount })),
    occupantKeys: new Map(view.players.map((player) => [player.id, occupantKey(player.id)])),
  };
}
