import type { BotConfig, BotPlayerStats, CoachAdvice, CoachReviewRecord, CoachSessionTally, GameReviewEvent } from '@aipoker/shared';
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
  botConfig?: BotConfig;
}

export interface RuntimeRoom {
  id: string;
  stateVersion: number;
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  actionTimeoutMs: number;
  players: Map<string, RuntimePlayer>;
  readyPlayerIds: Set<string>;
  pendingDisconnectPlayerIds: Set<string>;
  spectatingPlayerIds: Set<string>;
  hand: HandState | null;
  lastActionSeqByPlayer: Map<string, number>;
  lastBroadcastActionCount: number;
  lastButtonMarkerSeat: number | null;
  // Seated human who can remove bots and pick the first-hand button; null until a human sits.
  hostPlayerId: string | null;
  // Everyone's tendencies over the hands played here; the bots' opponent model reads them.
  playerStats: Map<string, BotPlayerStats>;
  // Coach review, by human player id: the advice built for their open decision (its stateVersion says
  // which), their graded decisions this hand, verdict counts over the session, and the last review sent.
  coachAdvice: Map<string, CoachAdvice>;
  coachRecords: Map<string, CoachReviewRecord[]>;
  coachSessions: Map<string, CoachSessionTally>;
  coachReviews: Map<string, CoachHandReview>;
}

/** A review as the server keeps it, each decision with its betting line; clientReview() is what is sent. */
export interface CoachHandReview extends Omit<GameReviewEvent, 'decisions'> {
  decisions: CoachReviewRecord[];
}
