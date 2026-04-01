import { getValidActions, type HandActionRecord, type HandPhase } from '@aipoker/game-engine';
import {
  buildBotPositionMap,
  deriveBotBettingState,
  hasPreflopLimpers,
  type BotBettingState,
  type BotDecisionContext,
  type BotDecisionPhase,
  type BotPosition,
  type Card,
  type BotAction,
} from '@aipoker/shared';

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

function mapHandPhase(phase: HandPhase): BotDecisionPhase | null {
  switch (phase) {
    case 'betting_preflop':
      return 'preflop';
    case 'betting_flop':
      return 'flop';
    case 'betting_turn':
      return 'turn';
    case 'betting_river':
      return 'river';
    default:
      return null;
  }
}

function getAggressiveActionsForStreet(
  room: RuntimeRoom,
  phase: HandPhase
): Array<HandActionRecord & { seatIndex: number }> {
  const hand = room.hand;
  if (!hand) {
    return [];
  }

  let currentMax = phase === 'betting_preflop' ? hand.blinds.bigBlind : 0;
  const aggressiveActions: Array<HandActionRecord & { seatIndex: number }> = [];

  for (const action of hand.actions) {
    if (action.phase !== phase) {
      continue;
    }

    const seatIndex = room.players.get(action.playerId)?.seatIndex;
    if (seatIndex === undefined) {
      continue;
    }

    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      aggressiveActions.push({ ...action, seatIndex });
      currentMax = action.toAmount;
    }
  }

  return aggressiveActions;
}

function getPreviousBettingPhase(phase: HandPhase): HandPhase | null {
  switch (phase) {
    case 'betting_flop':
      return 'betting_preflop';
    case 'betting_turn':
      return 'betting_flop';
    case 'betting_river':
      return 'betting_turn';
    default:
      return null;
  }
}

function deriveBettingState(
  room: RuntimeRoom,
  aggressiveActions: Array<HandActionRecord & { seatIndex: number }>,
): BotBettingState {
  const hand = room.hand;
  if (!hand) {
    return 'unopened';
  }

  return deriveBotBettingState(
    aggressiveActions.length,
    hasPreflopLimpers(hand.actions, hand.phase, hand.blinds.bigBlind),
  );
}

function countPreflopLimpers(room: RuntimeRoom): number {
  const hand = room.hand;
  if (!hand || hand.phase !== 'betting_preflop') {
    return 0;
  }

  let currentMax = hand.blinds.bigBlind;
  let limperCount = 0;

  for (const action of hand.actions) {
    if (action.phase !== hand.phase) {
      continue;
    }

    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      currentMax = action.toAmount;
      continue;
    }

    if (currentMax === hand.blinds.bigBlind && action.type === 'call') {
      limperCount += 1;
    }
  }

  return limperCount;
}

function buildPositionMap(room: RuntimeRoom): Map<number, BotPosition> {
  const hand = room.hand;
  if (!hand) {
    return new Map();
  }

  return buildBotPositionMap(hand.players.map((player) => player.seatIndex), hand.buttonMarkerSeat);
}

function getEffectiveStack(room: RuntimeRoom, actorId: string): number {
  const hand = room.hand;
  if (!hand) {
    return 0;
  }

  const actor = hand.players.find((player) => player.id === actorId);
  if (!actor) {
    return 0;
  }

  const actorTotal = actor.stack + actor.handCommitted;
  const opponentTotals = hand.players
    .filter((player) => player.id !== actorId && player.status !== 'folded')
    .map((player) => Math.min(actorTotal, player.stack + player.handCommitted));

  if (opponentTotals.length === 0) {
    return actorTotal;
  }

  return Math.max(...opponentTotals);
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
  if (!hand || hand.currentActorSeat === null) {
    return null;
  }

  const actor = hand.players.find((player) => player.id === actorId);
  if (!actor || actor.seatIndex !== hand.currentActorSeat) {
    return null;
  }

  const phase = mapHandPhase(hand.phase);
  if (!phase) {
    return null;
  }

  const valid = getValidActions(hand, actor.id);
  const activePlayers = hand.players.filter((player) => player.status !== 'folded');
  const effectiveStack = getEffectiveStack(room, actor.id);
  const aggressiveActions = getAggressiveActionsForStreet(room, hand.phase);
  const previousPhase = getPreviousBettingPhase(hand.phase);
  const previousStreetAggressiveActions = previousPhase ? getAggressiveActionsForStreet(room, previousPhase) : [];
  const preflopAggressiveActions = hand.phase === 'betting_preflop'
    ? aggressiveActions
    : getAggressiveActionsForStreet(room, 'betting_preflop');
  const positionMap = buildPositionMap(room);
  const bigBlind = hand.blinds.bigBlind;
  const effectiveStackBb = bigBlind > 0 ? effectiveStack / bigBlind : 0;
  const potBaseForSpr = hand.potTotal > 0 ? hand.potTotal : bigBlind;

  return {
    canFold: valid.canFold,
    canCheck: valid.canCheck,
    canCall: valid.canCall,
    callAmount: valid.callAmount,
    canRaise: valid.canRaise,
    minRaiseTo: valid.minRaiseTo,
    maxRaiseTo: valid.maxRaiseTo,
    canAllIn: valid.canAllIn,
    phase,
    potTotal: hand.potTotal,
    myStack: actor.stack,
    myStreetCommitted: actor.streetCommitted,
    currentBetToMatch: hand.betting.currentBetToMatch,
    lastFullRaiseSize: hand.betting.lastFullRaiseSize,
    bigBlind: hand.blinds.bigBlind,
    smallBlind: hand.blinds.smallBlind,
    preflopLimpersCount: countPreflopLimpers(room),
    streetActionCount: hand.actions.filter((action) => action.phase === hand.phase).length,
    holeCards: [...(actor.holeCards as Card[])],
    communityCards: [...(hand.communityCards as Card[])],
    activePlayerCount: hand.players.length,
    opponentCount: Math.max(0, activePlayers.length - 1),
    position: positionMap.get(actor.seatIndex) ?? 'utg',
    effectiveStack,
    effectiveStackBb,
    spr: potBaseForSpr > 0 ? effectiveStack / potBaseForSpr : 0,
    bettingState: deriveBettingState(room, aggressiveActions),
    isPreflopAggressor: preflopAggressiveActions.at(-1)?.playerId === actor.id,
    isLastStreetAggressor: previousStreetAggressiveActions.at(-1)?.playerId === actor.id,
  };
}
