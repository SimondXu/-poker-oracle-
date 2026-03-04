import type { RuntimeRoom } from '../../rooms/types.ts';

export function buildHandResultPayload(room: RuntimeRoom) {
  if (!room.hand || room.hand.phase !== 'hand_end') {
    return null;
  }

  return {
    roomId: room.id,
    phase: room.hand.phase,
    potTotal: room.hand.potTotal,
    pots: room.hand.pots,
    payouts: room.hand.payouts,
    players: room.hand.players.map((player) => ({
      id: player.id,
      stack: player.stack,
      status: player.status
    }))
  };
}
