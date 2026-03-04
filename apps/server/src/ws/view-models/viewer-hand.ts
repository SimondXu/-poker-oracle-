import type { HandPhase, HandState as EngineHandState } from '@aipoker/game-engine';
import type { Card, GameAction, HandState as ClientHandState, Phase } from '@aipoker/shared';

import type { RuntimeRoom } from '../../rooms/types.ts';

function mapPhase(phase: HandPhase): Phase {
  switch (phase) {
    case 'betting_preflop':
      return 'betting_preflop';
    case 'betting_flop':
      return 'betting_flop';
    case 'betting_turn':
      return 'betting_turn';
    case 'betting_river':
      return 'betting_river';
    case 'street_complete':
      return 'settle_pots';
    case 'hand_end':
      return 'hand_end';
  }
}

function inferMaxSeats(room: RuntimeRoom): number {
  const seatIndexes = [...room.players.values()].map((player) => player.seatIndex);
  if (seatIndexes.length === 0) {
    return 2;
  }

  const highestSeat = Math.max(...seatIndexes);
  return Math.max(2, highestSeat + 1);
}

function buildActions(hand: EngineHandState, room: RuntimeRoom): GameAction[] {
  return hand.actions.map((action, index) => {
    const roomPlayer = room.players.get(action.playerId);
    const handPlayer = hand.players.find((player) => player.id === action.playerId);

    return {
      playerId: action.playerId,
      playerName: roomPlayer?.name ?? action.playerId,
      seatIndex: roomPlayer?.seatIndex ?? handPlayer?.seatIndex ?? -1,
      phase: mapPhase(action.phase),
      type: action.type,
      amount: action.amount,
      stackBefore: 0,
      potTotalBefore: 0,
      sequenceNum: index + 1,
      timestamp: index + 1
    };
  });
}

function visibleHoleCards(
  hand: EngineHandState,
  playerId: string,
  viewerPlayerId: string | null,
  holeCards: Card[]
): Card[] {
  const revealAll = hand.phase === 'hand_end';
  if (revealAll || playerId === viewerPlayerId) {
    return holeCards;
  }

  return [];
}

export function buildViewerHand(room: RuntimeRoom, viewerPlayerId: string | null): ClientHandState {
  const hand = room.hand;
  if (!hand) {
    throw new Error('buildViewerHand requires room.hand to exist');
  }

  return {
    id: `${room.id}:${room.handNumber}`,
    roomId: room.id,
    handNumber: room.handNumber,
    phase: mapPhase(hand.phase),
    maxSeats: inferMaxSeats(room),
    smallBlind: room.smallBlind,
    bigBlind: room.bigBlind,
    buttonMarkerSeat: hand.buttonMarkerSeat,
    sbSeat: hand.sbSeat,
    bbSeat: hand.bbSeat,
    players: hand.players.map((player) => {
      const roomPlayer = room.players.get(player.id);

      return {
        id: player.id,
        name: roomPlayer?.name ?? player.id,
        seatIndex: player.seatIndex,
        stack: player.stack,
        streetCommitted: player.streetCommitted,
        handCommitted: player.handCommitted,
        status: player.status,
        holeCards: visibleHoleCards(hand, player.id, viewerPlayerId, player.holeCards),
        isBot: roomPlayer?.isBot ?? false,
        hasActedThisStreet: player.hasActedThisStreet,
        matchedBetToMatchAtLastAction: player.matchedBetToMatchAtLastAction
      };
    }),
    communityCards: hand.communityCards,
    pots: hand.pots,
    betting: hand.betting,
    currentActorSeat: hand.currentActorSeat,
    actions: buildActions(hand, room)
  };
}
