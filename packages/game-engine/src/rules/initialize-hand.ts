import type { EngineResult, HandState, InitializeHandError, InitializeHandInput } from '../state/types.ts';
import { advanceStreet } from './actions.ts';
import { createDeck } from './deck.ts';
import { err, ok } from './result.ts';
import {
  computePotTotal,
  determineNextActorSeat,
  findNextOccupiedSeat,
  getPendingActorIds,
  isRunoutRequired,
  toSettledPlayer
} from './shared.ts';

const MAX_DEAL_CARDS = 52;
const BOARD_CARDS = 5;

function orderedDealingSeats(seats: number[], firstSeat: number): number[] {
  const ordered = [...seats].sort((a, b) => a - b);
  const startIndex = ordered.indexOf(firstSeat);
  if (startIndex === -1) {
    return ordered;
  }

  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

export function initializeHand(input: InitializeHandInput): EngineResult<HandState, InitializeHandError> {
  const players = input.players.filter((player) => player.stack > 0);
  if (players.length < 2) {
    return err('not_enough_players');
  }

  if (input.smallBlind <= 0 || input.bigBlind < input.smallBlind) {
    return err('invalid_blind_structure');
  }

  if (players.length * 2 + BOARD_CARDS > MAX_DEAL_CARDS) {
    return err('too_many_players');
  }

  let sbSeat = findNextOccupiedSeat(players, input.buttonMarkerSeat);
  if (players.length === 2) {
    const buttonPlayer = players.find((player) => player.seatIndex === input.buttonMarkerSeat);
    if (buttonPlayer) {
      sbSeat = buttonPlayer.seatIndex;
    }
  }

  const bbSeat = findNextOccupiedSeat(players, sbSeat);
  const deck = createDeck(input.rng);
  const settledPlayers = players.map((player) => {
    if (player.seatIndex === sbSeat) {
      const sbCommitted = Math.min(input.smallBlind, player.stack);
      return toSettledPlayer(player, sbCommitted, 0);
    }

    if (player.seatIndex === bbSeat) {
      const bbCommitted = Math.min(input.bigBlind, player.stack);
      return toSettledPlayer(player, bbCommitted, 0);
    }

    return toSettledPlayer(player, 0, 0);
  });
  const playerBySeat = new Map(settledPlayers.map((player) => [player.seatIndex, player] as const));
  const dealOrder = orderedDealingSeats(
    settledPlayers.map((player) => player.seatIndex),
    sbSeat
  );
  for (let round = 0; round < 2; round += 1) {
    for (const seat of dealOrder) {
      const player = playerBySeat.get(seat);
      const nextCard = deck.shift();
      if (!player || !nextCard) {
        continue;
      }
      player.holeCards.push(nextCard);
    }
  }

  const bbPlayer = settledPlayers.find((player) => player.seatIndex === bbSeat) ?? null;
  // A short big blind still sets the full bet to match; side pots absorb the shortfall.
  const currentBetToMatch = input.bigBlind;

  for (const player of settledPlayers) {
    player.matchedBetToMatchAtLastAction = currentBetToMatch;
  }

  const pendingActorIds = getPendingActorIds(settledPlayers);
  const currentActorSeat = determineNextActorSeat(settledPlayers, bbSeat, pendingActorIds);

  const initialState: HandState = {
    phase: 'betting_preflop',
    blinds: {
      smallBlind: input.smallBlind,
      bigBlind: input.bigBlind
    },
    players: settledPlayers,
    buttonMarkerSeat: input.buttonMarkerSeat,
    sbSeat,
    bbSeat,
    currentActorSeat,
    pendingActorIds,
    communityCards: [],
    deck,
    potTotal: computePotTotal(settledPlayers),
    pots: [],
    payouts: [],
    actions: [],
    betting: {
      currentBetToMatch,
      lastFullRaiseSize: currentBetToMatch,
      lastAggressorId: bbPlayer?.id ?? null
    }
  };

  if (isRunoutRequired(settledPlayers, currentBetToMatch)) {
    return ok(advanceStreet(initialState, settledPlayers) ?? initialState);
  }

  return ok(initialState);
}
