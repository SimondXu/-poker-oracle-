import { analyzeTrainingSpot, buildDecisionContext, type TrainingAnalysis } from '@aipoker/strategy-engine';
import {
  buildBotPositionMap,
  formatBotPositionLabel,
  type BotDecisionContext,
  type BotPosition,
  type HandState,
  type ValidActions,
} from '@aipoker/shared';

export type GameTrainingData = TrainingAnalysis & { position?: string };

function buildPositionMap(hand: HandState): Map<number, BotPosition> {
  return buildBotPositionMap(
    hand.players
      .filter((player) => player.status !== 'out' && player.status !== 'sitting_out')
      .map((player) => player.seatIndex),
    hand.buttonMarkerSeat,
  );
}

/** Heads-up the button posts the small blind and acts first before the flop, so call it SB there. */
function getDisplayPosition(position: BotPosition, hand: HandState): BotPosition {
  const seated = hand.players.filter((player) => player.status !== 'out' && player.status !== 'sitting_out').length;
  return seated === 2 && position === 'btn' && hand.phase === 'betting_preflop' ? 'sb' : position;
}

function getPotTotal(hand: HandState): number {
  const potFromSettledPots = hand.pots.reduce((sum, pot) => sum + pot.amount, 0);
  const potFromCommitted = hand.players.reduce((sum, player) => sum + player.handCommitted, 0);
  return Math.max(potFromSettledPots, potFromCommitted);
}

export function getPositionLabelForSeat(hand: HandState | null, seatIndex: number | undefined): string | undefined {
  if (!hand || seatIndex === undefined) {
    return undefined;
  }

  const position = buildPositionMap(hand).get(seatIndex);
  return position ? formatBotPositionLabel(getDisplayPosition(position, hand)) : undefined;
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
  if (!actor || actor.status === 'folded' || actor.status === 'out' || actor.status === 'sitting_out') {
    return null;
  }

  const valid = getTrainingValidActions(validActions);
  return buildDecisionContext({ ...hand, potTotal: getPotTotal(hand) }, actor.id, {
    canFold: valid.canFold,
    canCheck: valid.canCheck,
    canCall: valid.canCall,
    callAmount: valid.callAmount,
    // The engine has one flag for betting and raising; the client splits it by whether the street is opened.
    canRaise: valid.canBet || valid.canRaise,
    minRaiseTo: valid.minBetOrRaiseTo,
    maxRaiseTo: valid.maxBetOrRaiseTo,
    canAllIn: valid.canAllIn,
  });
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
    position: formatBotPositionLabel(getDisplayPosition(context.position, input.hand)),
    ...training,
  };
}
