import type { RuntimeRoom } from './types.ts';

const DEFAULT_SMALL_BLIND = 10;
const DEFAULT_BIG_BLIND = 20;

export function pickSeatIndex(room: RuntimeRoom): number {
  const occupied = new Set([...room.players.values()].map((player) => player.seatIndex));
  let seatIndex = 0;
  while (occupied.has(seatIndex)) {
    seatIndex += 1;
  }
  return seatIndex;
}

export function getOrCreateRoom(
  rooms: Map<string, RuntimeRoom>,
  roomId: string,
  config?: { smallBlind: number; bigBlind: number }
): RuntimeRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    if (config) {
      existing.smallBlind = config.smallBlind;
      existing.bigBlind = config.bigBlind;
    }
    return existing;
  }

  const room: RuntimeRoom = {
    id: roomId,
    smallBlind: config?.smallBlind ?? DEFAULT_SMALL_BLIND,
    bigBlind: config?.bigBlind ?? DEFAULT_BIG_BLIND,
    players: new Map(),
    hand: null,
    lastActionSeqByPlayer: new Map()
  };
  rooms.set(roomId, room);
  return room;
}

export function syncRoomPlayersFromHand(room: RuntimeRoom): void {
  if (!room.hand) {
    return;
  }

  for (const handPlayer of room.hand.players) {
    const roomPlayer = room.players.get(handPlayer.id);
    if (!roomPlayer) {
      continue;
    }
    roomPlayer.stack = handPlayer.stack;
  }
}
