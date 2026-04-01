import { analyzeTrainingSpot, type TrainingAnalysis } from '@aipoker/strategy-engine';
import {
  buildBotPositionMap,
  deriveBotBettingState,
  formatBotPositionLabel,
  hasPreflopLimpers,
  type BotBettingState,
  type BotDecisionContext,
  type BotDecisionPhase,
  type BotPosition,
  type GameAction,
  type HandState,
  type PlayerState,
  type ValidActions,
} from '@aipoker/shared';

export type GameTrainingData = TrainingAnalysis & { position?: string };

function mapHandPhase(phase: HandState['phase']): BotDecisionPhase | null {
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

function buildPositionMap(hand: HandState): Map<number, BotPosition> {
  return buildBotPositionMap(
    hand.players
      .filter((player) => player.status !== 'out' && player.status !== 'sitting_out')
      .map((player) => player.seatIndex),
    hand.buttonMarkerSeat,
  );
}

function getPotTotal(hand: HandState): number {
  const potFromSettledPots = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const potFromCommitted = hand.players.reduce((sum, player) => sum + player.handCommitted, 0);
  return Math.max(potFromSettledPots, potFromCommitted);
}

function getActivePlayers(hand: HandState): PlayerState[] {
  return hand.players.filter(
    (player) => player.status !== 'folded' && player.status !== 'out' && player.status !== 'sitting_out',
  );
}

function getHandPlayers(hand: HandState): PlayerState[] {
  return hand.players.filter((player) => player.status !== 'out' && player.status !== 'sitting_out');
}

function getEffectiveStack(hand: HandState, actorId: string): number {
  const actor = hand.players.find((player) => player.id === actorId);
  if (!actor) {
    return 0;
  }

  const actorTotal = actor.stack + actor.handCommitted;
  const opponentTotals = hand.players
    .filter((player) => player.id !== actorId && player.status !== 'folded' && player.status !== 'out' && player.status !== 'sitting_out')
    .map((player) => Math.min(actorTotal, player.stack + player.handCommitted));

  if (opponentTotals.length === 0) {
    return actorTotal;
  }

  return Math.max(...opponentTotals);
}

function getAggressiveActionsForStreet(
  hand: HandState,
  phase: HandState['phase'],
): Array<GameAction & { seatIndex: number }> {
  let currentMax = phase === 'betting_preflop' ? hand.bigBlind : 0;
  const aggressiveActions: Array<GameAction & { seatIndex: number }> = [];

  for (const action of hand.actions) {
    if (action.phase !== phase) {
      continue;
    }

    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      aggressiveActions.push({ ...action, seatIndex: action.seatIndex });
      currentMax = action.toAmount;
    }
  }

  return aggressiveActions;
}

function getPreviousBettingPhase(phase: HandState['phase']): HandState['phase'] | null {
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
  hand: HandState,
  aggressiveActions: Array<GameAction & { seatIndex: number }>,
): BotBettingState {
  return deriveBotBettingState(
    aggressiveActions.length,
    hasPreflopLimpers(hand.actions, hand.phase, hand.bigBlind),
  );
}

export function getPositionLabelForSeat(hand: HandState | null, seatIndex: number | undefined): string | undefined {
  if (!hand || seatIndex === undefined) {
    return undefined;
  }

  const position = buildPositionMap(hand).get(seatIndex);
  return position ? formatBotPositionLabel(position) : undefined;
}

function getTrainingValidActions(validActions: ValidActions | null): ValidActions {
  return validActions ?? {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canBet: false,
    canRaise: false,
    minBetOrRaiseTo: 0,
    maxBetOrRaiseTo: 0,
    canAllIn: false,
  };
}

function buildTrainingContext(
  hand: HandState,
  currentUserId: string,
  validActions: ValidActions | null,
): BotDecisionContext | null {
  const actor = hand.players.find((player) => player.id === currentUserId);
  const phase = mapHandPhase(hand.phase);
  if (!actor || !phase || actor.status === 'folded' || actor.status === 'out' || actor.status === 'sitting_out') {
    return null;
  }

  if (actor.holeCards.length < 2) {
    return null;
  }

  const playerValidActions = getTrainingValidActions(validActions);
  const handPlayers = getHandPlayers(hand);
  const activePlayers = getActivePlayers(hand);
  const aggressiveActions = getAggressiveActionsForStreet(hand, hand.phase);
  const previousPhase = getPreviousBettingPhase(hand.phase);
  const previousStreetAggressiveActions = previousPhase ? getAggressiveActionsForStreet(hand, previousPhase) : [];
  const preflopAggressiveActions =
    hand.phase === 'betting_preflop'
      ? aggressiveActions
      : getAggressiveActionsForStreet(hand, 'betting_preflop');
  const effectiveStack = getEffectiveStack(hand, actor.id);
  const bigBlind = hand.bigBlind;
  const potTotal = getPotTotal(hand);
  const positionMap = buildPositionMap(hand);
  const effectiveStackBb = bigBlind > 0 ? effectiveStack / bigBlind : 0;
  const sprBase = potTotal > 0 ? potTotal : bigBlind;

  return {
    canFold: playerValidActions.canFold,
    canCheck: playerValidActions.canCheck,
    canCall: playerValidActions.canCall,
    callAmount: playerValidActions.callAmount,
    canRaise: playerValidActions.canRaise,
    minRaiseTo: playerValidActions.minBetOrRaiseTo,
    maxRaiseTo: playerValidActions.maxBetOrRaiseTo,
    canAllIn: playerValidActions.canAllIn,
    phase,
    potTotal,
    myStack: actor.stack,
    holeCards: [...actor.holeCards],
    communityCards: [...hand.communityCards],
    activePlayerCount: handPlayers.length,
    opponentCount: Math.max(0, activePlayers.length - 1),
    position: positionMap.get(actor.seatIndex) ?? 'utg',
    effectiveStack,
    effectiveStackBb,
    spr: sprBase > 0 ? effectiveStack / sprBase : 0,
    bettingState: deriveBettingState(hand, aggressiveActions),
    isPreflopAggressor: preflopAggressiveActions.at(-1)?.playerId === actor.id,
    isLastStreetAggressor: previousStreetAggressiveActions.at(-1)?.playerId === actor.id,
  };
}

export function getTrainingData(input: {
  currentUserId: string;
  hand: HandState | null;
  validActions: ValidActions | null;
  isMyTurn: boolean;
}): GameTrainingData | undefined {
  if (!input.hand) {
    return undefined;
  }

  const context = buildTrainingContext(input.hand, input.currentUserId, input.validActions);
  if (!context) {
    return undefined;
  }

  const training = analyzeTrainingSpot(context, { includeRecommendation: input.isMyTurn });

  return {
    position: formatBotPositionLabel(context.position),
    ...training,
  };
}
