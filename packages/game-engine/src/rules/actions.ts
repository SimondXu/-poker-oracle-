import type { ApplyActionError, EngineResult, HandInitPlayerState, HandPhase, HandState, PlayerActionInput, ValidActions } from '../state/types.ts';
import { buildSidePots } from '../settlement/side-pots.ts';
import { err, ok } from './result.ts';
import {
  computePotTotal,
  determineNextActorSeat,
  getActiveInHandPlayers,
  getPendingActorIds,
  getPlayerById,
  isPlayerEligibleToAct,
  resetPendingActors
} from './shared.ts';

function baseInvalidActions(): ValidActions {
  return {
    canFold: false,
    canCheck: false,
    canCall: false,
    callAmount: 0,
    canRaise: false,
    minRaiseTo: 0,
    maxRaiseTo: 0,
    canAllIn: false
  };
}

function evaluateRaiseWindow(state: HandState, player: HandInitPlayerState): {
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
} {
  const currentBetToMatch = state.betting.currentBetToMatch;
  const maxRaiseTo = player.streetCommitted + player.stack;
  const minRaiseTo = currentBetToMatch + state.betting.lastFullRaiseSize;

  if (maxRaiseTo <= currentBetToMatch) {
    return {
      canRaise: false,
      minRaiseTo,
      maxRaiseTo
    };
  }

  const deltaSinceLastAction = currentBetToMatch - player.matchedBetToMatchAtLastAction;
  const isReopened = !player.hasActedThisStreet || deltaSinceLastAction >= state.betting.lastFullRaiseSize;

  return {
    canRaise: isReopened,
    minRaiseTo,
    maxRaiseTo
  };
}

export function getValidActions(state: HandState, playerId: string): ValidActions {
  const player = getPlayerById(state.players, playerId);
  if (!player || !isPlayerEligibleToAct(player)) {
    return baseInvalidActions();
  }

  const toCall = Math.max(0, state.betting.currentBetToMatch - player.streetCommitted);
  const callAmount = Math.min(toCall, player.stack);
  const raiseWindow = evaluateRaiseWindow(state, player);

  return {
    canFold: true,
    canCheck: toCall === 0,
    canCall: toCall > 0 && callAmount > 0,
    callAmount,
    canRaise: raiseWindow.canRaise,
    minRaiseTo: raiseWindow.minRaiseTo,
    maxRaiseTo: raiseWindow.maxRaiseTo,
    canAllIn: player.stack > 0
  };
}

function finalizeActionResult(
  previous: HandState,
  players: HandInitPlayerState[],
  actorSeat: number,
  pendingActorIds: string[],
  betting: HandState['betting']
): HandState {
  const remainingInHand = getActiveInHandPlayers(players);
  if (remainingInHand.length <= 1) {
    return {
      ...previous,
      phase: 'hand_end',
      players,
      currentActorSeat: null,
      pendingActorIds: [],
      potTotal: computePotTotal(players),
      pots: buildSidePots(players),
      betting
    };
  }

  const nextActorSeat = determineNextActorSeat(players, actorSeat, pendingActorIds);
  if (nextActorSeat === null) {
    const advancedStreet = advanceStreet(previous, players);
    if (advancedStreet) {
      return {
        ...advancedStreet,
        potTotal: computePotTotal(players)
      };
    }

    return {
      ...previous,
      phase: 'street_complete',
      players,
      currentActorSeat: null,
      pendingActorIds: [],
      potTotal: computePotTotal(players),
      betting
    };
  }

  return {
    ...previous,
    phase: previous.phase,
    players,
    currentActorSeat: nextActorSeat,
    pendingActorIds,
    potTotal: computePotTotal(players),
    betting
  };
}

function isBettingPhase(phase: HandPhase): boolean {
  return phase === 'betting_preflop' || phase === 'betting_flop' || phase === 'betting_turn' || phase === 'betting_river';
}

function getNextBettingStreet(
  phase: HandPhase
): { phase: HandPhase; communityCardsToDeal: number } | null {
  if (phase === 'betting_preflop') {
    return {
      phase: 'betting_flop',
      communityCardsToDeal: 3
    };
  }

  if (phase === 'betting_flop') {
    return {
      phase: 'betting_turn',
      communityCardsToDeal: 1
    };
  }

  if (phase === 'betting_turn') {
    return {
      phase: 'betting_river',
      communityCardsToDeal: 1
    };
  }

  return null;
}

function advanceStreet(previous: HandState, players: HandInitPlayerState[]): HandState | null {
  if (previous.phase === 'betting_river') {
    return {
      ...previous,
      phase: 'hand_end',
      players,
      currentActorSeat: null,
      pendingActorIds: [],
      pots: buildSidePots(players)
    };
  }

  const nextStreet = getNextBettingStreet(previous.phase);
  if (!nextStreet) {
    return null;
  }

  const deck = [...previous.deck];
  const communityCards = [...previous.communityCards];
  for (let i = 0; i < nextStreet.communityCardsToDeal; i += 1) {
    const nextCard = deck.shift();
    if (!nextCard) {
      break;
    }
    communityCards.push(nextCard);
  }

  for (const player of players) {
    if (player.status === 'folded') {
      continue;
    }
    player.streetCommitted = 0;
    player.hasActedThisStreet = false;
    player.matchedBetToMatchAtLastAction = 0;
  }

  const pendingActorIds = getPendingActorIds(players);
  const currentActorSeat = determineNextActorSeat(players, previous.buttonMarkerSeat, pendingActorIds);

  return {
    ...previous,
    phase: currentActorSeat === null ? 'street_complete' : nextStreet.phase,
    players,
    communityCards,
    deck,
    currentActorSeat,
    pendingActorIds: currentActorSeat === null ? [] : pendingActorIds,
    betting: {
      currentBetToMatch: 0,
      lastFullRaiseSize: previous.blinds.bigBlind,
      lastAggressorId: null
    }
  };
}

function applyRaiseTo(
  state: HandState,
  players: HandInitPlayerState[],
  actor: HandInitPlayerState,
  toAmount: number
):
  | EngineResult<
      {
        players: HandInitPlayerState[];
        pendingActorIds: string[];
        betting: HandState['betting'];
      },
      'invalid_action'
    >
  | EngineResult<
      {
        players: HandInitPlayerState[];
        pendingActorIds: string[];
        betting: HandState['betting'];
      },
      never
    > {
  const currentBetToMatch = state.betting.currentBetToMatch;
  const maxRaiseTo = actor.streetCommitted + actor.stack;
  const minRaiseTo = currentBetToMatch + state.betting.lastFullRaiseSize;

  if (toAmount <= currentBetToMatch || toAmount > maxRaiseTo) {
    return err('invalid_action');
  }

  const isAllInRaise = toAmount === maxRaiseTo;
  if (toAmount < minRaiseTo && !isAllInRaise) {
    return err('invalid_action');
  }

  const additional = toAmount - actor.streetCommitted;
  actor.stack -= additional;
  actor.streetCommitted = toAmount;
  actor.handCommitted += additional;
  actor.hasActedThisStreet = true;
  actor.matchedBetToMatchAtLastAction = toAmount;
  if (actor.stack === 0) {
    actor.status = 'all_in';
  }

  const raiseSize = toAmount - currentBetToMatch;
  const isFullRaise = raiseSize >= state.betting.lastFullRaiseSize;

  return ok({
    players,
    pendingActorIds: resetPendingActors(players, actor.id),
    betting: {
      currentBetToMatch: toAmount,
      lastFullRaiseSize: isFullRaise ? raiseSize : state.betting.lastFullRaiseSize,
      lastAggressorId: actor.id
    }
  });
}

export function applyAction(state: HandState, action: PlayerActionInput): EngineResult<HandState, ApplyActionError> {
  if (state.currentActorSeat === null || !isBettingPhase(state.phase)) {
    return err('hand_not_actionable');
  }

  const players = state.players.map((player) => ({ ...player }));
  const actor = getPlayerById(players, action.playerId);
  if (!actor || actor.seatIndex !== state.currentActorSeat || !isPlayerEligibleToAct(actor)) {
    return err('not_current_actor');
  }

  let pendingActorIds = [...state.pendingActorIds];
  let betting = { ...state.betting };
  const toCall = Math.max(0, state.betting.currentBetToMatch - actor.streetCommitted);

  if (action.type === 'fold') {
    actor.status = 'folded';
    actor.hasActedThisStreet = true;
    pendingActorIds = pendingActorIds.filter((playerId) => playerId !== actor.id);
    return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
  }

  if (action.type === 'check') {
    if (toCall !== 0) {
      return err('invalid_action');
    }
    actor.hasActedThisStreet = true;
    actor.matchedBetToMatchAtLastAction = state.betting.currentBetToMatch;
    pendingActorIds = pendingActorIds.filter((playerId) => playerId !== actor.id);
    return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
  }

  if (action.type === 'call') {
    if (toCall <= 0) {
      return err('invalid_action');
    }

    const contribution = Math.min(toCall, actor.stack);
    actor.stack -= contribution;
    actor.streetCommitted += contribution;
    actor.handCommitted += contribution;
    actor.hasActedThisStreet = true;
    actor.matchedBetToMatchAtLastAction = state.betting.currentBetToMatch;
    if (actor.stack === 0) {
      actor.status = 'all_in';
    }

    pendingActorIds = pendingActorIds.filter((playerId) => playerId !== actor.id);
    return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
  }

  if (action.type === 'raise_to') {
    if (!Number.isInteger(action.amount)) {
      return err('invalid_action');
    }

    const raised = applyRaiseTo(state, players, actor, action.amount ?? 0);
    if (!raised.ok) {
      return raised;
    }

    pendingActorIds = raised.value.pendingActorIds;
    betting = raised.value.betting;
    return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
  }

  if (action.type === 'all_in') {
    if (actor.stack <= 0) {
      return err('invalid_action');
    }

    const allInTo = actor.streetCommitted + actor.stack;
    if (allInTo <= state.betting.currentBetToMatch) {
      const contribution = actor.stack;
      actor.stack = 0;
      actor.streetCommitted += contribution;
      actor.handCommitted += contribution;
      actor.status = 'all_in';
      actor.hasActedThisStreet = true;
      actor.matchedBetToMatchAtLastAction = state.betting.currentBetToMatch;
      pendingActorIds = pendingActorIds.filter((playerId) => playerId !== actor.id);
      return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
    }

    const raised = applyRaiseTo(state, players, actor, allInTo);
    if (!raised.ok) {
      return raised;
    }
    pendingActorIds = raised.value.pendingActorIds;
    betting = raised.value.betting;
    return ok(finalizeActionResult(state, players, actor.seatIndex, pendingActorIds, betting));
  }

  return err('invalid_action');
}
