import type { RuntimeRoom } from './types.ts';

const DEFAULT_SMALL_BLIND = 10;
const DEFAULT_BIG_BLIND = 20;
const DEFAULT_ACTION_TIMEOUT_MS = 30000;

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
  config?: { smallBlind?: number; bigBlind?: number; actionTimeoutMs?: number }
): RuntimeRoom {
  const existing = rooms.get(roomId);
  if (existing) {
    if (config) {
      if (config.smallBlind !== undefined) {
        existing.smallBlind = config.smallBlind;
      }
      if (config.bigBlind !== undefined) {
        existing.bigBlind = config.bigBlind;
      }
      if (config.actionTimeoutMs !== undefined) {
        existing.actionTimeoutMs = config.actionTimeoutMs;
      }
    }
    return existing;
  }

  const room: RuntimeRoom = {
    id: roomId,
    handNumber: 0,
    smallBlind: config?.smallBlind ?? DEFAULT_SMALL_BLIND,
    bigBlind: config?.bigBlind ?? DEFAULT_BIG_BLIND,
    actionTimeoutMs: config?.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS,
    players: new Map(),
    readyPlayerIds: new Set(),
    pendingDisconnectPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0
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
