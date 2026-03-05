export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export type BotPersonality = 'fish' | 'tag' | 'lag';

export interface BotValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  // Decision context
  potTotal: number;
  myStack: number;
  holeCards: Card[];
  communityCards: Card[];
}

export type BotAction =
  | { type: 'fold';     thinkingDelayMs: number }
  | { type: 'check';    thinkingDelayMs: number }
  | { type: 'call';     amount: number; thinkingDelayMs: number }
  | { type: 'raise_to'; amount: number; thinkingDelayMs: number }
  | { type: 'all_in';   thinkingDelayMs: number };

// ─────────────────────────────────────────────
// Client-facing types (shared between web + server)
// Aligned with data-models.md
// ─────────────────────────────────────────────

export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'T'|'J'|'Q'|'K'|'A';
export type Card = `${Rank}${Suit}`;
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise_to' | 'all_in';
export type PlayerStatus = 'active' | 'folded' | 'all_in' | 'out' | 'sitting_out';
export type Phase =
  | 'hand_init' | 'post_forced_bets'
  | 'deal_hole' | 'betting_preflop'
  | 'deal_flop' | 'betting_flop'
  | 'deal_turn' | 'betting_turn'
  | 'deal_river'| 'betting_river'
  | 'showdown'  | 'settle_pots' | 'hand_end';

export interface PlayerState {
  id: string;
  name: string;
  seatIndex: number;
  stack: number;
  streetCommitted: number;
  handCommitted: number;
  status: PlayerStatus;
  holeCards: Card[];
  isBot: boolean;
  botStrategy?: string;
  hasActedThisStreet: boolean;
  matchedBetToMatchAtLastAction: number;
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface HandState {
  id: string;
  roomId: string;
  handNumber: number;
  phase: Phase;
  maxSeats: number;
  smallBlind: number;
  bigBlind: number;
  buttonMarkerSeat: number;
  sbSeat: number | null;
  bbSeat: number;
  players: PlayerState[];
  communityCards: Card[];
  pots: Pot[];
  betting: {
    currentBetToMatch: number;
    lastFullRaiseSize: number;
    lastAggressorId: string | null;
  };
  currentActorSeat: number | null;
  actions: GameAction[];
}

export interface GameAction {
  playerId: string;
  playerName: string;
  seatIndex: number;
  phase: Phase;
  type: ActionType;
  amount: number;
  stackBefore: number;
  potTotalBefore: number;
  sequenceNum: number;
  timestamp: number;
}

export interface ValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canBet: boolean;
  canRaise: boolean;
  minBetOrRaiseTo: number;
  maxBetOrRaiseTo: number;
  canAllIn: boolean;
}

export interface TableLifecycleSnapshot {
  activeStackPlayerCount: number;
  activeHumanStackPlayerCount: number;
  activeBotStackPlayerCount: number;
  isTableFinished: boolean;
  canStartNextHand: boolean;
  isBotsOnlyContinuation: boolean;
  championPlayerId: string | null;
  championPlayerName: string | null;
}

export interface RoomStateEvent {
  roomId: string;
  stateVersion: number;
  players: Array<{
    id: string;
    name: string;
    seatIndex: number;
    stack: number;
    isBot: boolean;
    botStrategy: BotPersonality | null;
    isReady: boolean;
  }>;
  playerCount: number;
  readyCount: number;
  isPlaying: boolean;
  table: TableLifecycleSnapshot;
}

export type RoomState = RoomStateEvent;

export interface GameStateEvent {
  roomId: string;
  stateVersion: number;
  hand: HandState;
}

export interface GameActionRequiredEvent {
  roomId: string;
  playerId: string;
  stateVersion: number;
  validActions: ValidActions;
  timeoutMs: number;
}

export interface HandResultPayout {
  potIndex: number;
  playerId: string;
  amount: number;
}

export interface HandResultPlayerSnapshot {
  id: string;
  name: string;
  stack: number;
  status: PlayerStatus;
  holeCards: Card[];
}

export interface HandResultEvent {
  roomId: string;
  phase: 'hand_end';
  potTotal: number;
  pots: Pot[];
  payouts: HandResultPayout[];
  players: HandResultPlayerSnapshot[];
  table: TableLifecycleSnapshot;
  stateVersion: number;
}

export interface GameActionAppliedEvent {
  roomId: string;
  stateVersion: number;
  type: 'action_applied';
  action: {
    playerId: string;
    type: ActionType;
    amount: number;
    phase: Phase;
  };
}

export type GameEvent = GameActionAppliedEvent;
