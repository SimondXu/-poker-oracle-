import type { EngineResult, HandPhase, HandState, InitializeHandError, InitializeHandInput } from '../state/types.ts';
import { createDeck } from './deck.ts';
import { err, ok } from './result.ts';
import {
  computePotTotal,
  determineNextActorSeat,
  findNextOccupiedSeat,
  getPendingActorIds,
  toSettledPlayer
} from './shared.ts';

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

  const sbPlayer = settledPlayers.find((player) => player.seatIndex === sbSeat) ?? null;
  const bbPlayer = settledPlayers.find((player) => player.seatIndex === bbSeat) ?? null;
  const currentBetToMatch = Math.max(sbPlayer?.streetCommitted ?? 0, bbPlayer?.streetCommitted ?? 0);

  for (const player of settledPlayers) {
    player.matchedBetToMatchAtLastAction = currentBetToMatch;
  }

  const pendingActorIds = getPendingActorIds(settledPlayers);
  const currentActorSeat = determineNextActorSeat(settledPlayers, bbSeat, pendingActorIds);
  const phase: HandPhase = currentActorSeat === null ? 'street_complete' : 'betting_preflop';

  return ok({
    phase,
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
    betting: {
      currentBetToMatch,
      lastFullRaiseSize: currentBetToMatch,
      lastAggressorId: bbPlayer?.id ?? null
    }
  });
}
