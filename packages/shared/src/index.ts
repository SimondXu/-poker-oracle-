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
export type AgentModel = 'claude' | 'gpt' | 'gemini' | 'grok' | 'minimax';
export type AgentPersonaId = 'analyst' | 'bully' | 'chaos' | 'nit' | 'showman';
export type BotDecisionPhase = 'preflop' | 'flop' | 'turn' | 'river';
export type BotPosition = 'sb' | 'bb' | 'btn' | 'co' | 'hj' | 'utg';
export type BotBettingState = 'unopened' | 'facing_limpers' | 'facing_open' | 'facing_raise' | 'facing_3bet_plus';
export type BotConfig =
  | { kind: 'rule'; personality: BotPersonality }
  | { kind: 'llm'; model: AgentModel; personaId: AgentPersonaId };

const BOT_POSITION_LAYOUTS: Record<number, BotPosition[]> = {
  2: ['btn', 'bb'],
  3: ['btn', 'sb', 'bb'],
  4: ['btn', 'sb', 'bb', 'utg'],
  5: ['btn', 'sb', 'bb', 'utg', 'co'],
  6: ['btn', 'sb', 'bb', 'utg', 'hj', 'co'],
};

const BOT_POSITION_LABELS: Record<BotPosition, string> = {
  utg: 'UTG',
  hj: 'HJ',
  co: 'CO',
  btn: 'BTN',
  sb: 'SB',
  bb: 'BB',
};

export function sortSeatsClockwise(seats: readonly number[], startSeat: number): number[] {
  const sorted = [...seats].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return sorted;
  }

  const exactStartIndex = sorted.indexOf(startSeat);
  if (exactStartIndex >= 0) {
    return [...sorted.slice(exactStartIndex), ...sorted.slice(0, exactStartIndex)];
  }

  const firstHigherIndex = sorted.findIndex((seat) => seat > startSeat);
  if (firstHigherIndex >= 0) {
    return [...sorted.slice(firstHigherIndex), ...sorted.slice(0, firstHigherIndex)];
  }

  return sorted;
}

export function buildBotPositionMap(seats: readonly number[], buttonSeat: number): Map<number, BotPosition> {
  const orderedSeats = sortSeatsClockwise(seats, buttonSeat);
  const playerCount = Math.max(2, Math.min(6, orderedSeats.length));
  const layout = BOT_POSITION_LAYOUTS[playerCount] ?? BOT_POSITION_LAYOUTS[6]!;
  const positionMap = new Map<number, BotPosition>();

  orderedSeats.forEach((seat, index) => {
    const position = layout[Math.min(index, layout.length - 1)];
    if (position) {
      positionMap.set(seat, position);
    }
  });

  return positionMap;
}

export function formatBotPositionLabel(position: BotPosition): string {
  return BOT_POSITION_LABELS[position];
}

export function hasPreflopLimpers(
  actions: ReadonlyArray<{ phase: string; type: string; toAmount: number }>,
  phase: string,
  bigBlind: number,
): boolean {
  if (phase !== 'betting_preflop') {
    return false;
  }

  let currentMax = bigBlind;
  for (const action of actions) {
    if (action.phase !== phase) {
      continue;
    }

    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      currentMax = action.toAmount;
      continue;
    }

    if (currentMax === bigBlind && action.type === 'call') {
      return true;
    }
  }

  return false;
}

export function deriveBotBettingState(aggressiveActionCount: number, hasPassiveEntry = false): BotBettingState {
  if (aggressiveActionCount === 0) {
    return hasPassiveEntry ? 'facing_limpers' : 'unopened';
  }
  if (aggressiveActionCount === 1) {
    return 'facing_open';
  }
  if (aggressiveActionCount === 2) {
    return 'facing_raise';
  }
  return 'facing_3bet_plus';
}

export function getRuleBotPersonality(botConfig: BotConfig | undefined): BotPersonality | null {
  if (!botConfig || botConfig.kind !== 'rule') {
    return null;
  }

  return botConfig.personality;
}

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function sanitizeRoomCodeInput(input: string): string {
  return input.toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');
}

export function normalizeRoomCode(input: string): string {
  return sanitizeRoomCodeInput(input).slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(input: string): boolean {
  const code = normalizeRoomCode(input);
  if (code.length !== ROOM_CODE_LENGTH) {
    return false;
  }

  for (const char of code) {
    if (!ROOM_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }

  return true;
}

export function generateRoomCode(): string {
  let code = '';

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[randomIndex];
  }

  return code;
}

export interface BotDecisionContext {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
  canAllIn: boolean;
  phase: BotDecisionPhase;
  potTotal: number;
  myStack: number;
  myStreetCommitted: number;
  currentBetToMatch: number;
  lastFullRaiseSize: number;
  bigBlind: number;
  smallBlind: number;
  preflopLimpersCount: number;
  streetActionCount: number;
  holeCards: Card[];
  communityCards: Card[];
  // Players originally dealt into the current hand, including folded/all-in seats.
  activePlayerCount: number;
  // Opponents still contesting the pot at this decision point.
  opponentCount: number;
  position: BotPosition;
  effectiveStack: number;
  effectiveStackBb: number;
  spr: number;
  bettingState: BotBettingState;
  isPreflopAggressor: boolean;
  isLastStreetAggressor: boolean;
}

export type BotValidActions = BotDecisionContext;

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
  addedAmount: number;
  toAmount: number;
  stackBefore: number;
  potTotalBefore: number;
  sequenceNum: number;
  timestamp: number;
}

export type BotStatusKind = 'thinking' | 'acted' | 'error';
export type BotReasoningVisibility = 'private' | 'table_after_hand' | 'table_live';

export interface BotStatusEvent {
  roomId: string;
  playerId: string;
  stateVersion: number;
  status: BotStatusKind;
  turnToken?: string;
  message?: string;
}

export interface BotReasoningEvent {
  roomId: string;
  playerId: string;
  stateVersion: number;
  visibility: BotReasoningVisibility;
  summary: string;
  detail?: string;
}

export interface TableChatEvent {
  roomId: string;
  playerId: string;
  stateVersion: number;
  message: string;
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
  action: GameAction;
}

export type GameEvent = GameActionAppliedEvent;
