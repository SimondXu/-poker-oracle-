import type { HandResultEvent } from '@aipoker/shared';

import { getTableLifecycleSnapshot } from '../../rooms/table-lifecycle.ts';
import type { RuntimeRoom } from '../../rooms/types.ts';

export function buildHandResultPayload(room: RuntimeRoom): Omit<HandResultEvent, 'stateVersion'> | null {
  if (!room.hand || room.hand.phase !== 'hand_end') {
    return null;
  }

  return {
    roomId: room.id,
    phase: room.hand.phase,
    potTotal: room.hand.potTotal,
    pots: room.hand.pots,
    payouts: room.hand.payouts,
    table: getTableLifecycleSnapshot(room),
    players: room.hand.players.map((player) => ({
      id: player.id,
      name: room.players.get(player.id)?.name ?? player.id,
      stack: player.stack,
      status: player.status,
      holeCards: player.holeCards,
    }))
  };
}
