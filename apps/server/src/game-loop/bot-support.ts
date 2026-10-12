import { getValidActions, type HandActionRecord, type HandPhase, type HandState } from '@aipoker/game-engine';
import type { BotAction, BotDecisionContext } from '@aipoker/shared';
import { buildDecisionContext, recordHandStats, type DecisionHand } from '@aipoker/strategy-engine';

import type { RuntimeRoom } from '../rooms/types.ts';

export interface BotRuntimeDeps {
  rng: () => number;
  sleep: (ms: number) => Promise<void>;
  nowMs: () => number;
}

export const DEFAULT_BOT_RUNTIME_DEPS: BotRuntimeDeps = {
  rng: () => Math.random(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  nowMs: () => Date.now(),
};

const BOT_PREFLOP_FOLD_STREAKS = new WeakMap<RuntimeRoom, Map<string, number>>();

function getOrCreateBotPreflopFoldStreaks(room: RuntimeRoom): Map<string, number> {
  const existing = BOT_PREFLOP_FOLD_STREAKS.get(room);
  if (existing) {
    return existing;
  }

  const created = new Map<string, number>();
  BOT_PREFLOP_FOLD_STREAKS.set(room, created);
  return created;
}

export function getBotPreflopFoldStreak(room: RuntimeRoom, playerId: string): number {
  return BOT_PREFLOP_FOLD_STREAKS.get(room)?.get(playerId) ?? 0;
}

export function resetBotPreflopFoldStreaks(room: RuntimeRoom): void {
  BOT_PREFLOP_FOLD_STREAKS.delete(room);
}

export function isFirstPreflopDecisionForPlayer(hand: RuntimeRoom['hand'], playerId: string): boolean {
  if (!hand) {
    return false;
  }

  return !hand.actions.some((action) => action.phase === 'betting_preflop' && action.playerId === playerId);
}

export function trackBotPreflopEntryDecision(
  room: RuntimeRoom,
  hand: RuntimeRoom['hand'],
  playerId: string,
  actionType: BotAction['type'],
): void {
  if (!isFirstPreflopDecisionForPlayer(hand, playerId)) {
    return;
  }

  const streaks = getOrCreateBotPreflopFoldStreaks(room);
  if (actionType === 'fold') {
    streaks.set(playerId, (streaks.get(playerId) ?? 0) + 1);
    return;
  }

  streaks.set(playerId, 0);
}

type EligibleRoomPlayer = RuntimeRoom['players'] extends Map<string, infer Player> ? Player : never;

function getStackPositivePlayers(room: RuntimeRoom): EligibleRoomPlayer[] {
  return [...room.players.values()]
    .filter((player) => player.stack > 0)
    .sort((left, right) => left.seatIndex - right.seatIndex);
}

export function getAggressiveActionsForPhase(hand: HandState, phase: HandPhase): HandActionRecord[] {
  let currentMax = phase === 'betting_preflop' ? hand.blinds.bigBlind : 0;
  const aggressiveActions: HandActionRecord[] = [];

  for (const action of hand.actions) {
    if (action.phase !== phase) {
      continue;
    }
    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      aggressiveActions.push(action);
      currentMax = action.toAmount;
    }
  }

  return aggressiveActions;
}

export function getNextButtonMarkerSeat(room: RuntimeRoom): number {
  const stackPositivePlayers = getStackPositivePlayers(room);
  if (stackPositivePlayers.length === 0) {
    return room.lastButtonMarkerSeat ?? 0;
  }

  if (room.lastButtonMarkerSeat === null) {
    return stackPositivePlayers[0]?.seatIndex ?? 0;
  }

  const lastButtonMarkerSeat = room.lastButtonMarkerSeat;
  const nextSeat = stackPositivePlayers.find((player) => player.seatIndex > lastButtonMarkerSeat)?.seatIndex;
  return nextSeat ?? stackPositivePlayers[0]?.seatIndex ?? lastButtonMarkerSeat;
}

export function resolveButtonMarkerSeatForNextHand(
  room: RuntimeRoom,
  requestedButtonMarkerSeat: number | undefined,
  rng: () => number
): number {
  const stackPositivePlayers = getStackPositivePlayers(room);
  if (stackPositivePlayers.length === 0) {
    return requestedButtonMarkerSeat ?? room.lastButtonMarkerSeat ?? 0;
  }

  const stackPositiveSeats = new Set(stackPositivePlayers.map((player) => player.seatIndex));
  const isFirstHand = room.handNumber === 0 || room.lastButtonMarkerSeat === null;
  if (isFirstHand) {
    if (
      requestedButtonMarkerSeat !== undefined
      && stackPositiveSeats.has(requestedButtonMarkerSeat)
    ) {
      return requestedButtonMarkerSeat;
    }

    const index = Math.max(0, Math.min(stackPositivePlayers.length - 1, Math.floor(rng() * stackPositivePlayers.length)));
    return stackPositivePlayers[index]?.seatIndex ?? stackPositivePlayers[0]?.seatIndex ?? 0;
  }

  return getNextButtonMarkerSeat(room);
}

export function buildBotDecisionContext(room: RuntimeRoom, actorId: string): BotDecisionContext | null {
  const hand = room.hand;
  const actor = hand?.players.find((player) => player.id === actorId);
  if (!hand || hand.currentActorSeat === null || !actor || actor.seatIndex !== hand.currentActorSeat) {
    return null;
  }

  return buildDecisionContext(toDecisionHand(hand), actor.id, getValidActions(hand, actor.id), room.playerStats);
}

function toDecisionHand(hand: HandState): DecisionHand {
  return { ...hand, smallBlind: hand.blinds.smallBlind, bigBlind: hand.blinds.bigBlind };
}

const HANDS_IN_PLAYER_STATS = new WeakSet<HandState>();

/** Counts a finished hand toward every player's tendencies, once however often it is called. */
export function recordFinishedHandStats(room: RuntimeRoom): void {
  const hand = room.hand;
  if (!hand || hand.phase !== 'hand_end' || HANDS_IN_PLAYER_STATS.has(hand)) {
    return;
  }
  HANDS_IN_PLAYER_STATS.add(hand);
  recordHandStats(room.playerStats, toDecisionHand(hand));
}
