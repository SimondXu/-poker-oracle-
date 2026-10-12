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
  // Opponents still in the hand and what they did, so equity can be computed against their likely range.
  opponents?: BotOpponentView[];
  // The acting player's own actions this hand, read the same way, so it can reason about its own range.
  selfView?: BotOpponentView;
}

export interface BotOpponentAction {
  phase: BotDecisionPhase;
  type: 'check' | 'call' | 'raise_to' | 'all_in';
  // The betting state this player faced when acting (preflop: was the pot open, limped, raised...).
  facing: BotBettingState;
  // Bet or raise size as a fraction of the pot before it; 0 for checks and calls.
  sizeOfPot: number;
}

export interface BotOpponentView {
  id: string;
  position: BotPosition;
  actions: BotOpponentAction[];
  // What this player has done over earlier hands at the table, when anyone has been tracking it.
  stats?: BotPlayerStats;
}

/** Running counts of one player's tendencies, accumulated hand by hand. */
export interface BotPlayerStats {
  hands: number;
  // Hands where they put chips in preflop without being forced to (VPIP).
  preflopVoluntary: number;
  // Hands with a voluntary preflop raise, and the subset where the raise was far over a standard size.
  preflopRaises: number;
  preflopOversizedRaises: number;
  // Decisions after the flop, and how many of them were bets or raises.
  postflopActions: number;
  postflopAggressive: number;
  // Postflop decisions facing a bet or raise, and how many of them were folds.
  postflopFacingBets: number;
  postflopFoldsToBets: number;
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
  hostPlayerId: string | null;
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

/** The current human actor's coach advice, sent only to their own sockets right after game:action_required. */
export interface GameCoachEvent {
  roomId: string;
  playerId: string;
  stateVersion: number;
  advice: CoachAdvice;
}

/** A player's graded decisions in the hand just finished, sent only to their own sockets at hand end. */
export interface GameReviewEvent {
  roomId: string;
  playerId: string;
  handNumber: number;
  decisions: CoachReviewDecision[];
  /** Verdict counts over every hand this player has had reviewed at this table, this one included. */
  session: CoachSessionTally;
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

// ---- Coach advice: what the coach tells the hero, built by strategy-engine (see Docs/game-design/coach-advice.md).

export type HandClass = 'premium' | 'strong' | 'playable' | 'speculative' | 'marginal' | 'trash';

/** Bump when decide.ts behaviour changes, so stored advice and golden sets can tell which policy they came from. */
export const COACH_POLICY_VERSION = '2026-10-12.2';

/** Shared by advice options and the hero's recorded action, so the review compares like with like. */
export type CoachActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all_in';

/**
 * An action as the hero sees it: a raise on a street nobody has bet is a bet, and an all-in that
 * doesn't put in more than the bet to match is a call.
 */
export function classifyAction(
  action: { type: 'fold' | 'check' | 'call' | 'bet' | 'raise_to' | 'all_in' },
  spot: { currentBetToMatch: number; myStreetCommitted: number; myStack: number },
): CoachActionKind {
  switch (action.type) {
    case 'raise_to':
    case 'bet':
      return spot.currentBetToMatch === 0 ? 'bet' : 'raise';
    case 'all_in':
      return spot.myStreetCommitted + spot.myStack <= spot.currentBetToMatch ? 'call' : 'all_in';
    default:
      return action.type;
  }
}

/** Why the policy plays the spot as it does; each code is recorded at the decide.ts branch that uses the fact. */
export type CoachReason =
  | { code: 'preflop_chart'; params: { handClass: HandClass; scenario: BotBettingState; position: BotPosition; effStackBb: number } }
  /** Share of all starting hands the chart plays from this seat in this scenario, and from the button (null on the button). */
  | { code: 'position_range'; params: { position: BotPosition; scenario: BotBettingState; share: number; buttonShare: number | null } }
  | { code: 'price_ok'; params: { equity: number; required: number } }
  | { code: 'price_short'; params: { equity: number; required: number } }
  | { code: 'jam'; params: { trigger: 'short_stack' | 'low_spr' | 'near_lock'; effStackBb: number; spr: number } }
  | { code: 'value'; params: { equity: number } }
  | { code: 'slowplay'; params: { equity: number } }
  | { code: 'draw'; params: { draw: 'flush' | 'oesd' | 'pair_plus_draw' } }
  | { code: 'bluff_share'; params: { frequency: number } }
  | { code: 'cbet'; params: { frequency: number } }
  | { code: 'no_initiative'; params: Record<string, never> }
  | { code: 'checked_to_in_position'; params: Record<string, never> }
  | { code: 'sticky_opponent'; params: { playerId: string; foldToBet: number; facingBets: number } };

export interface CoachOption {
  kind: CoachActionKind;
  /** Street total for bet / raise / all_in, like raise_to. */
  to?: number;
  /** bet / raise only: big blinds before the flop; afterwards the chips added beyond a call as a share of the pot after calling. */
  size?: { unit: 'bb' | 'pot'; value: number };
  /** 0..1; the options sum to 1. */
  frequency: number;
  /** Reasons on the paths to this option that not every option shares, most important first. */
  reasons: CoachReason[];
}

export interface CoachAdvice {
  policyVersion: string;
  personality: 'tag';

  // Join keys for the post-hand review.
  handId: string;
  street: BotDecisionPhase;
  /** hand.actions.length when advised: the hero's action lands at this index. */
  actionIndex: number;
  stateVersion: number;

  /** What the hero saw, so a stored advice is a self-contained eval sample. */
  spot: { holeCards: Card[]; board: Card[]; pot: number; toCall: number; heroStack: number; bigBlind: number };

  /** Highest frequency first. */
  options: CoachOption[];
  /** False when equity moved by two standard errors changes the top option or shifts a frequency by more than 0.25. */
  stable: boolean;

  /** Postflop, and preflop when the price check ran (equityVs is then 'range'). */
  equity?: number;
  equityStdErr?: number;
  equityVs?: 'range' | 'random';
  /** How many opponents the equity is against: preflop, those who put chips in; postflop, everyone still in. */
  equityAgainst?: number;
  /** Preflop: share of starting hands this hand is in the top of (0.08 = top 8%). */
  handPercentile?: number;
  /** Only when there is a price to call; requiredEquity = clamp01(potOdds + callBuffer). */
  potOdds?: number;
  requiredEquity?: number;

  /** Postflop only: effective stack over the pot as the street began. */
  spr?: number;
  effStackBb: number;
  position: BotPosition;
  scenario: BotBettingState;
  /** Live opponents. */
  opponents: number;

  /** Reasons common to every option's path, most important first. */
  reasons: CoachReason[];
}

// ---- Coach review: the hero's decisions graded against the advice (see Docs/game-design/coach-review.md).

export type CoachVerdict = 'matched' | 'close' | 'off';

/** An action the policy takes at least this often counts as matched. */
export const COACH_MATCH_FREQUENCY = 0.25;
/** A bet or raise is the policy's size when its total is within this share of the policy's total. */
export const COACH_SIZE_TOLERANCE = 0.5;

export interface CoachHeroAction {
  /** From classifyAction on the state before the action, like the advice's options. */
  kind: CoachActionKind;
  /** Street total for bet / raise / all_in. */
  to?: number;
  /** A timeout's check or fold is graded like any action, and flagged. */
  source: 'player' | 'timeout';
}

export interface CoachReviewDecision {
  street: BotDecisionPhase;
  advice: CoachAdvice;
  heroAction: CoachHeroAction;
  verdict: CoachVerdict;
}

export type CoachSessionTally = Record<CoachVerdict, number>;

/**
 * Matched when the policy takes the hero's action at least COACH_MATCH_FREQUENCY of the time (for a
 * bet or raise, counting only its sizes near the hero's); close when it takes it less often or at
 * another size; off when it never takes it. Unstable advice could flip within its equity error, so
 * an action outside it is close, not off.
 */
export function gradeDecision(advice: CoachAdvice, hero: { kind: CoachActionKind; to?: number }): CoachVerdict {
  const sameKind = advice.options.filter((option) => option.kind === hero.kind);
  if (sameKind.length === 0) {
    return advice.stable ? 'off' : 'close';
  }
  const sized = hero.kind === 'bet' || hero.kind === 'raise';
  const frequency = sameKind
    .filter((option) => !sized || (hero.to !== undefined && option.to !== undefined && Math.abs(hero.to - option.to) <= COACH_SIZE_TOLERANCE * option.to))
    .reduce((sum, option) => sum + option.frequency, 0);
  return frequency >= COACH_MATCH_FREQUENCY ? 'matched' : 'close';
}
