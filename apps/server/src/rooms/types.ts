import type { HandState } from '@aipoker/game-engine';

export interface RoomMembership {
  roomId: string;
  playerId: string;
}

export interface RuntimePlayer {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  isBot: boolean;
  botStrategy?: 'fish' | 'tag' | 'lag';
}

export interface RuntimeRoom {
  id: string;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  actionTimeoutMs: number;
  players: Map<string, RuntimePlayer>;
  readyPlayerIds: Set<string>;
  pendingDisconnectPlayerIds: Set<string>;
  hand: HandState | null;
  lastActionSeqByPlayer: Map<string, number>;
  lastBroadcastActionCount: number;
}
