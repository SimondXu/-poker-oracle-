import { getValidActions, type HandActionRecord, type HandPhase } from '@aipoker/game-engine';
import type {
  BotAction,
  BotBettingState,
  BotDecisionContext,
  BotDecisionPhase,
  BotPosition,
  Card,
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

const POSITION_LAYOUTS: Record<number, BotPosition[]> = {
  2: ['btn', 'bb'],
  3: ['btn', 'sb', 'bb'],
  4: ['btn', 'sb', 'bb', 'utg'],
  5: ['btn', 'sb', 'bb', 'utg', 'co'],
  6: ['btn', 'sb', 'bb', 'utg', 'hj', 'co'],
};

function getStackPositivePlayers(room: RuntimeRoom): EligibleRoomPlayer[] {
  return [...room.players.values()]
    .filter((player) => player.stack > 0)
    .sort((left, right) => left.seatIndex - right.seatIndex);
}

function sortSeatsClockwise(seats: number[], startSeat: number): number[] {
  const sorted = [...seats].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return sorted;
  }

  const exactStartIndex = sorted.indexOf(startSeat);
  if (exactStartIndex >= 0) {
    return [...sorted.slice(exactStartIndex), ...sorted.slice(0, exactStartIndex)];
  }

  const firstHigherIndex = sorted.findIndex((seat) => seat > startSeat);
  if (firstHigherIndex >= 0) {
    return [...sorted.slice(firstHigherIndex), ...sorted.slice(0, firstHigherIndex)];
  }

  return sorted;
}

function getPositionLayout(playerCount: number): BotPosition[] {
  if (playerCount <= 2) {
    return POSITION_LAYOUTS[2]!;
  }
  if (playerCount >= 6) {
    return POSITION_LAYOUTS[6]!;
  }
  return POSITION_LAYOUTS[playerCount] ?? POSITION_LAYOUTS[6]!;
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

function deriveBettingState(aggressiveActions: Array<HandActionRecord & { seatIndex: number }>): BotBettingState {
  if (aggressiveActions.length === 0) {
    return 'unopened';
  }
  if (aggressiveActions.length === 1) {
    return 'facing_open';
  }
  if (aggressiveActions.length === 2) {
    return 'facing_raise';
  }
  return 'facing_3bet_plus';
}

function buildPositionMap(room: RuntimeRoom): Map<number, BotPosition> {
  const hand = room.hand;
  if (!hand) {
    return new Map();
  }

  const orderedSeats = sortSeatsClockwise(
    hand.players.map((player) => player.seatIndex),
    hand.buttonMarkerSeat
  );
  const layout = getPositionLayout(orderedSeats.length);
  const positionMap = new Map<number, BotPosition>();

  orderedSeats.forEach((seat, index) => {
    const layoutIndex = Math.min(index, layout.length - 1);
    const position = layout[layoutIndex];
    if (position) {
      positionMap.set(seat, position);
    }
  });

  return positionMap;
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
    holeCards: [...(actor.holeCards as Card[])],
    communityCards: [...(hand.communityCards as Card[])],
    activePlayerCount: activePlayers.length,
    opponentCount: Math.max(0, activePlayers.length - 1),
    position: positionMap.get(actor.seatIndex) ?? 'utg',
    effectiveStack,
    effectiveStackBb,
    spr: potBaseForSpr > 0 ? effectiveStack / potBaseForSpr : 0,
    bettingState: deriveBettingState(aggressiveActions),
    isPreflopAggressor: preflopAggressiveActions.at(-1)?.playerId === actor.id,
    isLastStreetAggressor: previousStreetAggressiveActions.at(-1)?.playerId === actor.id,
  };
}
