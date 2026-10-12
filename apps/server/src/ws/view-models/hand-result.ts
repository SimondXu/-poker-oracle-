import type { HandResultEvent } from '@aipoker/shared';

import { getTableLifecycleSnapshot } from '../../rooms/table-lifecycle.ts';
import type { RuntimeRoom } from '../../rooms/types.ts';
import { isShownAtShowdown } from './viewer-hand.ts';

export function buildHandResultPayload(room: RuntimeRoom): Omit<HandResultEvent, 'stateVersion'> | null {
  if (!room.hand || room.hand.phase !== 'hand_end') {
    return null;
  }

  const hand = room.hand;
  return {
    roomId: room.id,
    phase: room.hand.phase,
    potTotal: room.hand.potTotal,
    pots: room.hand.pots,
    payouts: room.hand.payouts,
    table: getTableLifecycleSnapshot(room),
    players: hand.players.map((player) => ({
      id: player.id,
      name: room.players.get(player.id)?.name ?? player.id,
      stack: player.stack,
      status: player.status,
      // The room-wide result never carries mucked or uncontested hands; each viewer gets their own cards in game:state.
      holeCards: isShownAtShowdown(hand, player.id) ? player.holeCards : [],
    }))
  };
}
