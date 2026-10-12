import {
  buildBotPositionMap,
  deriveBotBettingState,
  hasPreflopLimpers,
  type BotDecisionContext,
  type BotDecisionPhase,
  type Card,
} from '@aipoker/shared';

/** The slice of a hand that both the server engine state and the client view can provide. */
export interface DecisionHand {
  phase: string;
  smallBlind: number;
  bigBlind: number;
  buttonMarkerSeat: number;
  potTotal: number;
  players: ReadonlyArray<{
    id: string;
    seatIndex: number;
    stack: number;
    streetCommitted: number;
    handCommitted: number;
    status: string;
    holeCards: readonly Card[];
  }>;
  communityCards: readonly Card[];
  actions: ReadonlyArray<{ playerId: string; phase: string; type: string; toAmount: number }>;
  betting: { currentBetToMatch: number; lastFullRaiseSize: number };
}

export interface DecisionValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
}

const PREVIOUS_BETTING_PHASE: Record<string, string> = {
  betting_flop: 'betting_preflop',
  betting_turn: 'betting_flop',
  betting_river: 'betting_turn',
};

function mapHandPhase(phase: string): BotDecisionPhase | null {
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

function isSeated(player: DecisionHand['players'][number]): boolean {
  return player.status !== 'out' && player.status !== 'sitting_out';
}

/** Raises that lifted the price on a street, in order. */
export function getAggressiveActions(hand: DecisionHand, phase: string): DecisionHand['actions'] {
  let currentMax = phase === 'betting_preflop' ? hand.bigBlind : 0;
  return hand.actions.filter((action) => {
    if (action.phase !== phase || (action.type !== 'raise_to' && action.type !== 'all_in') || action.toAmount <= currentMax) {
      return false;
    }
    currentMax = action.toAmount;
    return true;
  });
}

function countPreflopLimpers(hand: DecisionHand): number {
  if (hand.phase !== 'betting_preflop') {
    return 0;
  }

  let currentMax = hand.bigBlind;
  let limperCount = 0;
  for (const action of hand.actions) {
    if (action.phase !== hand.phase) {
      continue;
    }
    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      currentMax = action.toAmount;
      continue;
    }
    if (currentMax === hand.bigBlind && action.type === 'call') {
      limperCount += 1;
    }
  }
  return limperCount;
}

/** Chips the actor and the deepest live opponent both still had behind when this street began. */
function getEffectiveStack(hand: DecisionHand, actorId: string): number {
  const actor = hand.players.find((player) => player.id === actorId);
  if (!actor) {
    return 0;
  }

  const actorTotal = actor.stack + actor.streetCommitted;
  const opponentTotals = hand.players
    .filter((player) => player.id !== actorId && player.status !== 'folded' && isSeated(player))
    .map((player) => Math.min(actorTotal, player.stack + player.streetCommitted));

  return opponentTotals.length === 0 ? actorTotal : Math.max(...opponentTotals);
}

/** One decision context for bots (server) and the coach (client), so the two can't drift apart. */
export function buildDecisionContext(
  hand: DecisionHand,
  actorId: string,
  valid: DecisionValidActions,
): BotDecisionContext | null {
  const actor = hand.players.find((player) => player.id === actorId);
  const phase = mapHandPhase(hand.phase);
  if (!actor || !phase || actor.holeCards.length < 2) {
    return null;
  }

  const handPlayers = hand.players.filter(isSeated);
  const activePlayers = handPlayers.filter((player) => player.status !== 'folded');
  const aggressiveActions = getAggressiveActions(hand, hand.phase);
  const previousPhase = PREVIOUS_BETTING_PHASE[hand.phase];
  const previousStreetAggressiveActions = previousPhase ? getAggressiveActions(hand, previousPhase) : [];
  const preflopAggressiveActions = hand.phase === 'betting_preflop'
    ? aggressiveActions
    : getAggressiveActions(hand, 'betting_preflop');
  const positionMap = buildBotPositionMap(handPlayers.map((player) => player.seatIndex), hand.buttonMarkerSeat);
  const effectiveStack = getEffectiveStack(hand, actor.id);
  const effectiveStackBb = hand.bigBlind > 0 ? effectiveStack / hand.bigBlind : 0;
  // SPR compares the stack to the pot as the street began; preflop that pot is empty, so use the blinds in it.
  const potAtStreetStart = hand.potTotal - hand.players.reduce((sum, player) => sum + player.streetCommitted, 0);
  const potBaseForSpr = potAtStreetStart > 0 ? potAtStreetStart : hand.potTotal > 0 ? hand.potTotal : hand.bigBlind;

  return {
    ...valid,
    phase,
    potTotal: hand.potTotal,
    myStack: actor.stack,
    myStreetCommitted: actor.streetCommitted,
    currentBetToMatch: hand.betting.currentBetToMatch,
    lastFullRaiseSize: hand.betting.lastFullRaiseSize,
    bigBlind: hand.bigBlind,
    smallBlind: hand.smallBlind,
    preflopLimpersCount: countPreflopLimpers(hand),
    streetActionCount: hand.actions.filter((action) => action.phase === hand.phase).length,
    holeCards: [...actor.holeCards],
    communityCards: [...hand.communityCards],
    activePlayerCount: handPlayers.length,
    opponentCount: Math.max(0, activePlayers.length - 1),
    position: positionMap.get(actor.seatIndex) ?? 'utg',
    effectiveStack,
    effectiveStackBb,
    spr: potBaseForSpr > 0 ? effectiveStack / potBaseForSpr : 0,
    bettingState: deriveBotBettingState(
      aggressiveActions.length,
      hasPreflopLimpers(hand.actions, hand.phase, hand.bigBlind),
    ),
    isPreflopAggressor: preflopAggressiveActions.at(-1)?.playerId === actor.id,
    isLastStreetAggressor: previousStreetAggressiveActions.at(-1)?.playerId === actor.id,
  };
}
