import type { RuntimeRoom } from '../rooms/types.ts';

const INITIAL_SEQ = -1;

export function resetActionSeqTracker(room: RuntimeRoom): void {
  room.lastActionSeqByPlayer = new Map([...room.players.keys()].map((playerId) => [playerId, INITIAL_SEQ]));
}

export function isDuplicateOrStaleActionSeq(room: RuntimeRoom, playerId: string, seq: number): boolean {
  const previousSeq = room.lastActionSeqByPlayer.get(playerId);
  if (previousSeq === undefined) {
    return false;
  }
  return seq <= previousSeq;
}

export function recordActionSeq(room: RuntimeRoom, playerId: string, seq: number): void {
  room.lastActionSeqByPlayer.set(playerId, seq);
}
