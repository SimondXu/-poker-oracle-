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
}

export interface RuntimeRoom {
  id: string;
  smallBlind: number;
  bigBlind: number;
  players: Map<string, RuntimePlayer>;
  hand: HandState | null;
  lastActionSeqByPlayer: Map<string, number>;
}
