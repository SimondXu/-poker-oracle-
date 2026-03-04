export type Suit = 'h' | 'd' | 'c' | 's';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${Rank}${Suit}`;
export type Rng = () => number;

export type EngineResult<T, E> = { ok: true; value: T } | { ok: false; error: E };
export type PlayerStatus = 'active' | 'folded' | 'all_in';
export type HandPhase =
  | 'betting_preflop'
  | 'betting_flop'
  | 'betting_turn'
  | 'betting_river'
  | 'street_complete'
  | 'hand_end';
export type ActionType = 'fold' | 'check' | 'call' | 'raise_to' | 'all_in';

export interface HandInitPlayerInput {
  id: string;
  seatIndex: number;
  stack: number;
}

export interface HandInitPlayerState extends HandInitPlayerInput {
  streetCommitted: number;
  handCommitted: number;
  status: PlayerStatus;
  hasActedThisStreet: boolean;
  matchedBetToMatchAtLastAction: number;
}

export interface HandState {
  phase: HandPhase;
  blinds: {
    smallBlind: number;
    bigBlind: number;
  };
  players: HandInitPlayerState[];
  buttonMarkerSeat: number;
  sbSeat: number;
  bbSeat: number;
  currentActorSeat: number | null;
  pendingActorIds: string[];
  communityCards: Card[];
  deck: Card[];
  potTotal: number;
  pots: Pot[];
  betting: {
    currentBetToMatch: number;
    lastFullRaiseSize: number;
    lastAggressorId: string | null;
  };
}

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface InitializeHandInput {
  players: HandInitPlayerInput[];
  buttonMarkerSeat: number;
  smallBlind: number;
  bigBlind: number;
  rng: Rng;
}

export interface ValidActions {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
}

export interface PlayerActionInput {
  playerId: string;
  type: ActionType;
  amount?: number;
}

export type InitializeHandError = 'not_enough_players' | 'invalid_blind_structure';
export type ApplyActionError = 'hand_not_actionable' | 'not_current_actor' | 'invalid_action';
