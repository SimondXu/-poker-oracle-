import type { ActionType, BotPersonality, GameAction, HandState, Phase, PlayerStatus } from '@aipoker/shared';
import { describeBestHand, getBestHandCategory, type HandCategoryKey } from '../../../components/poker/hand-name.ts';
import type { ActionTagKind } from '../../../components/poker/types.ts';
import { formatChips } from '../../../lib/utils.ts';
import { getHandPotTotal } from './game-screen-state.ts';
import { getSeatLayouts, type LayoutPoint, type SeatLayout } from './seat-layout.ts';
import {
  getDisplayedSeatStack,
  getHoleCardSecondPassDelay,
  getSeatDealOrderIndex,
  shouldAnimatePotAward,
  shouldDimLosingSeat,
  shouldRevealShowdownCards,
  shouldShowWinnerIdentity,
  type ResultAnimationPhase,
} from './table-animation.ts';

// ─────────────────────────────────────────────
// Types (hand-off contract for table / action-bar / panel agents)
// ─────────────────────────────────────────────

export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export type { ActionTagKind };

export interface SeatLastAction {
  kind: ActionTagKind;
  /** Short pill text, e.g. "check", "call 40", "raise 120", "all-in 980". */
  label: string;
  /** Chip amount shown in the label (call = added, bet/raise/all-in = to-amount); null for fold/check. */
  amount: number | null;
}

export interface SeatTimer {
  startedAt: number;
  durationMs: number;
}

interface SeatViewModelBase {
  seatIndex: number;
  layout: SeatLayout;
}

export interface EmptySeatViewModel extends SeatViewModelBase {
  kind: 'empty';
}

export interface OccupiedSeatViewModel extends SeatViewModelBase {
  kind: 'player';
  id: string;
  name: string;
  isBot: boolean;
  /** Rule-bot personality (stamped on the plate), null for humans / unknown bots. */
  personality: BotPersonality | null;
  /** Stack to display (during announcing/revealing the payout is held back so it can "arrive"). */
  stack: number;
  status: PlayerStatus;
  isHero: boolean;
  /** This seat is the one to act now. */
  isActor: boolean;
  isButton: boolean;
  isSB: boolean;
  isBB: boolean;
  /** Only true once the result phase allows revealing the winner (showing/done). */
  isWinner: boolean;
  isFolded: boolean;
  /** Folded/out, or a loser after the winner is revealed. */
  isDimmed: boolean;
  /** Amount won this hand, or null. */
  payout: number | null;
  /** Bet in front of the player on the current street (chip bubble); 0 for players who folded on an earlier street. */
  streetCommitted: number;
  /**
   * Hole card slots to render: [] = render nothing, otherwise 2 entries where
   * a string is a face-up card and null is a face-down back.
   */
  holeCards: readonly (string | null)[];
  /** At least one hole card is face-up (hero, or showdown reveal). */
  showCards: boolean;
  /** Winner's best five (empty unless isWinner). Highlight cards in this set, dim the rest at showdown. */
  bestCards: readonly string[];
  /** Showdown reveal only: English name of the shown hand ("Two Pair, Kings and Sevens"), else null. */
  handName: string | null;
  /** Same hand as `handName`, as a category key for the translated label. */
  handCategory: HandCategoryKey | null;
  /** Last action on the current street, cleared when the street changes; null at showdown/hand end. */
  lastAction: SeatLastAction | null;
  /** Turn timer for the acting human seat, else null. */
  timer: SeatTimer | null;
  /** 0-based order this seat receives cards (left of button first), for staggered deal animation. */
  dealOrder: number;
}

export type SeatViewModel = EmptySeatViewModel | OccupiedSeatViewModel;

export interface PotAwardTarget {
  playerId: string;
  position: LayoutPoint;
}

export interface TablePotViewModel {
  /** See getHandPotTotal: max(settled pots, Σ handCommitted). Includes live street bets. */
  total: number;
  /** Every pot amount (index 0 = main) when there is more than one pot, else []. */
  sidePots: readonly number[];
  /** Pot-to-winner animation should run now. */
  isAwarding: boolean;
  /** Changes whenever a new award animation should replay. */
  awardKey: string;
  awardTargets: readonly PotAwardTarget[];
}

export interface TableBoardViewModel {
  cards: readonly string[];
  /** Board cards that are part of any winner's best five (empty until winners are revealed). */
  winnerCards: readonly string[];
}

export interface FoldViewModel {
  /** Stable per hand: `${handNumber}-${sequenceNum}-${playerId}`. */
  id: string;
  seatIndex: number;
  position: LayoutPoint;
  /** Cards to show while mucking (hero only), else []. */
  cards: readonly string[];
  faceDown: boolean;
}

export interface TableViewModel {
  handId: string;
  handNumber: number;
  phase: Phase;
  /** Betting street of `phase`; null at showdown/settle/hand_end. */
  street: Street | null;
  resultPhase: ResultAnimationPhase;
  blinds: { small: number; big: number };
  /** Number of seat slots (= seats.length). */
  seatCount: number;
  heroSeatIndex: number | null;
  actorSeatIndex: number | null;
  /** Dealer button seat; TableSeat draws the disc beside that plate (layout.buttonSide). */
  buttonSeatIndex: number;
  /** One entry per seat index (array index === seatIndex). */
  seats: readonly SeatViewModel[];
  board: TableBoardViewModel;
  pot: TablePotViewModel;
  deal: {
    /** Hole cards should play the deal-in animation when they mount. */
    isDealing: boolean;
    /** Delay between the first and second card pass, seconds. */
    secondPassDelaySec: number;
  };
  /** Every fold this hand, in action order. Animate ids you have not seen yet. */
  folds: readonly FoldViewModel[];
}

export interface TableViewModelInput {
  hand: HandState;
  currentUserId: string;
  timerStartedAt: number | null;
  timerDurationMs: number;
  /**
   * Winner data straight from the store. The builder gates it on `handResultPhase`
   * (shouldShowWinnerIdentity), so callers do not need to pre-filter.
   */
  winnerIds: readonly string[];
  winnerCards: readonly string[];
  winnerBestCardsByPlayer: Readonly<Record<string, readonly string[]>>;
  payoutAmountsByPlayer: Readonly<Record<string, number>>;
  handResultPhase: ResultAnimationPhase;
  /** Store flag; combined with shouldAnimatePotAward(handResultPhase). */
  isWinning: boolean;
}

// ─────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────

const EMPTY_STRINGS: readonly string[] = Object.freeze([]);
const EMPTY_SLOTS: readonly (string | null)[] = Object.freeze([]);
const EMPTY_NUMBERS: readonly number[] = Object.freeze([]);
const HOLE_CARD_COUNT = 2;

const STREET_BY_PHASE: Readonly<Record<Phase, Street | null>> = {
  hand_init: 'preflop',
  post_forced_bets: 'preflop',
  deal_hole: 'preflop',
  betting_preflop: 'preflop',
  deal_flop: 'flop',
  betting_flop: 'flop',
  deal_turn: 'turn',
  betting_turn: 'turn',
  deal_river: 'river',
  betting_river: 'river',
  showdown: null,
  settle_pots: null,
  hand_end: null,
};

const ACTION_KIND_BY_TYPE: Readonly<Record<ActionType, ActionTagKind>> = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  bet: 'bet',
  raise_to: 'raise',
  all_in: 'all_in',
};

export function getStreetForPhase(phase: Phase): Street | null {
  return STREET_BY_PHASE[phase];
}

export function toSeatLastAction(
  action: Pick<GameAction, 'type' | 'amount' | 'addedAmount' | 'toAmount'>,
): SeatLastAction {
  const kind = ACTION_KIND_BY_TYPE[action.type];
  switch (kind) {
    case 'fold':
    case 'check':
      return { kind, label: kind, amount: null };
    case 'call':
      return { kind, label: `call ${formatChips(action.addedAmount)}`, amount: action.addedAmount };
    case 'all_in':
      return { kind, label: `all-in ${formatChips(action.toAmount)}`, amount: action.toAmount };
    case 'bet':
    case 'raise': {
      const amount = action.toAmount || action.amount;
      return { kind, label: `${kind} ${formatChips(amount)}`, amount };
    }
  }
}

/** Latest action per player on `street` (actions are in sequence order). */
export function getLastActionsForStreet(
  actions: readonly GameAction[],
  street: Street | null,
): Map<string, SeatLastAction> {
  const byPlayer = new Map<string, SeatLastAction>();
  if (street === null) {
    return byPlayer;
  }
  for (const action of actions) {
    if (getStreetForPhase(action.phase) === street) {
      byPlayer.set(action.playerId, toSeatLastAction(action));
    }
  }
  return byPlayer;
}

/**
 * Hole card visibility (unchanged from the v1 Seat):
 * - hero with known cards: face-up (also after folding);
 * - showdown reveal (hand_end + revealing/showing/done): known cards of players still in the hand face-up;
 * - other seats still in the hand: two face-down backs;
 * - everyone else (folded/out opponents): nothing.
 */
export function getVisibleHoleCards(input: {
  holeCards: readonly string[];
  status: PlayerStatus;
  isHero: boolean;
  isShowdownReveal: boolean;
}): readonly (string | null)[] {
  const hasKnownCards = input.holeCards.length > 0;
  const isActiveInHand = input.status !== 'folded' && input.status !== 'out';
  const showFaceDown = !input.isHero && isActiveInHand && !input.isShowdownReveal;
  // Folded opponents stay mucked at showdown even if the server sent their cards.
  const showFaceUp = (input.isHero || (input.isShowdownReveal && isActiveInHand)) && hasKnownCards;

  if (!showFaceUp && !showFaceDown) {
    return EMPTY_SLOTS;
  }

  return Array.from({ length: HOLE_CARD_COUNT }, (_, index) => {
    const card = input.holeCards[index];
    return showFaceUp && card ? card : null;
  });
}

/** Name of a face-up hand at showdown (both hole cards known, at least a flop), else null. */
export function getShownHandName(
  holeCards: readonly (string | null)[],
  communityCards: readonly string[],
  isShown: boolean,
): string | null {
  if (!isShown || holeCards.length !== HOLE_CARD_COUNT || holeCards.some((card) => card === null)) {
    return null;
  }
  return describeBestHand(holeCards as readonly string[], communityCards);
}

const PERSONALITIES: readonly BotPersonality[] = ['fish', 'tag', 'lag'];

export function toBotPersonality(value: string | undefined): BotPersonality | null {
  return PERSONALITIES.find((personality) => personality === value) ?? null;
}

/** Category of a face-up hand at showdown (same gating as getShownHandName). */
export function getShownHandCategory(
  holeCards: readonly (string | null)[],
  communityCards: readonly string[],
  isShown: boolean,
): HandCategoryKey | null {
  if (!isShown || holeCards.length !== HOLE_CARD_COUNT || holeCards.some((card) => card === null)) {
    return null;
  }
  return getBestHandCategory(holeCards as readonly string[], communityCards);
}

export function buildTableViewModel(input: TableViewModelInput): TableViewModel {
  const { hand, currentUserId } = input;
  const resultPhase = input.handResultPhase;
  const revealWinners = shouldShowWinnerIdentity(resultPhase);
  const winnerIds = revealWinners ? input.winnerIds : EMPTY_STRINGS;
  const winnerIdSet = new Set(winnerIds);
  const isShowdownReveal = hand.phase === 'hand_end' && shouldRevealShowdownCards(resultPhase);

  const heroPlayer = hand.players.find((player) => player.id === currentUserId);
  const heroSeatIndex = heroPlayer?.seatIndex ?? null;
  const seatCount = Math.max(hand.maxSeats, ...hand.players.map((player) => player.seatIndex + 1));
  const layouts = getSeatLayouts(seatCount, heroSeatIndex);
  const playerBySeat = new Map(hand.players.map((player) => [player.seatIndex, player]));
  const occupiedSeatIndices = hand.players.map((player) => player.seatIndex);
  const street = getStreetForPhase(hand.phase);
  const lastActions = getLastActionsForStreet(hand.actions, street);

  const seats: SeatViewModel[] = layouts.map((layout, seatIndex) => {
    const player = playerBySeat.get(seatIndex);
    if (!player) {
      return { kind: 'empty', seatIndex, layout };
    }

    const isHero = player.id === currentUserId;
    const isActor = hand.currentActorSeat === seatIndex;
    const isWinner = winnerIdSet.has(player.id);
    const isFolded = player.status === 'folded';
    const payoutAmount = input.payoutAmountsByPlayer[player.id];
    const holeCards = getVisibleHoleCards({
      holeCards: player.holeCards,
      status: player.status,
      isHero,
      isShowdownReveal,
    });

    return {
      kind: 'player',
      seatIndex,
      layout,
      id: player.id,
      name: player.name,
      isBot: player.isBot,
      personality: player.isBot ? toBotPersonality(player.botStrategy) : null,
      stack: getDisplayedSeatStack(player.stack, payoutAmount, resultPhase),
      status: player.status,
      isHero,
      isActor,
      isButton: hand.buttonMarkerSeat === seatIndex,
      isSB: hand.sbSeat === seatIndex,
      isBB: hand.bbSeat === seatIndex,
      isWinner,
      isFolded,
      isDimmed:
        isFolded ||
        player.status === 'out' ||
        shouldDimLosingSeat({ phase: hand.phase, resultPhase, isWinner, status: player.status }),
      payout: payoutAmount ?? null,
      // The engine does not reset streetCommitted for folded players at a new street; their
      // chips only stay in front of them on the street they folded.
      // No bets once betting is over (showdown / hand end): the chips are in the pot.
      streetCommitted: street === null || (isFolded && !lastActions.has(player.id)) ? 0 : player.streetCommitted,
      holeCards,
      showCards: holeCards.some((card) => card !== null),
      bestCards: isWinner ? (input.winnerBestCardsByPlayer[player.id] ?? EMPTY_STRINGS) : EMPTY_STRINGS,
      handName: getShownHandName(holeCards, hand.communityCards, isShowdownReveal && !isFolded),
      handCategory: getShownHandCategory(holeCards, hand.communityCards, isShowdownReveal && !isFolded),
      lastAction: lastActions.get(player.id) ?? null,
      timer:
        isActor && !player.isBot && input.timerStartedAt !== null
          ? { startedAt: input.timerStartedAt, durationMs: input.timerDurationMs }
          : null,
      dealOrder: getSeatDealOrderIndex(occupiedSeatIndices, hand.buttonMarkerSeat ?? null, seatIndex),
    };
  });

  const awardTargets: PotAwardTarget[] = [];
  for (const winnerId of winnerIds) {
    const winner = hand.players.find((player) => player.id === winnerId);
    const layout = winner ? layouts[winner.seatIndex] : undefined;
    if (winner && layout) {
      awardTargets.push({ playerId: winnerId, position: layout.seat });
    }
  }

  const folds: FoldViewModel[] = [];
  for (const action of hand.actions) {
    if (action.type !== 'fold') continue;
    const player = hand.players.find((candidate) => candidate.id === action.playerId);
    const layout = player ? layouts[player.seatIndex] : undefined;
    if (!player || !layout) continue;
    const cards = player.id === currentUserId ? player.holeCards.slice(0, HOLE_CARD_COUNT) : EMPTY_STRINGS;
    folds.push({
      id: `${hand.handNumber}-${action.sequenceNum}-${player.id}`,
      seatIndex: player.seatIndex,
      position: layout.seat,
      cards,
      faceDown: cards.length < HOLE_CARD_COUNT,
    });
  }

  return {
    handId: hand.id,
    handNumber: hand.handNumber,
    phase: hand.phase,
    street,
    resultPhase,
    blinds: { small: hand.smallBlind, big: hand.bigBlind },
    seatCount: layouts.length,
    heroSeatIndex,
    actorSeatIndex: hand.currentActorSeat,
    buttonSeatIndex: hand.buttonMarkerSeat,
    seats,
    board: {
      cards: hand.communityCards,
      winnerCards: revealWinners ? input.winnerCards : EMPTY_STRINGS,
    },
    pot: {
      total: getHandPotTotal(hand),
      sidePots: hand.pots.length > 1 ? hand.pots.map((pot) => pot.amount) : EMPTY_NUMBERS,
      isAwarding: input.isWinning && shouldAnimatePotAward(resultPhase) && awardTargets.length > 0,
      awardKey: `${hand.id}-${hand.handNumber}-${resultPhase ?? 'idle'}-${winnerIds.join(',')}`,
      awardTargets,
    },
    deal: {
      isDealing: hand.phase === 'betting_preflop',
      secondPassDelaySec: getHoleCardSecondPassDelay(occupiedSeatIndices.length),
    },
    folds,
  };
}

// ─────────────────────────────────────────────
// Structural sharing (keeps memoized children from re-rendering)
// ─────────────────────────────────────────────

/** Deep equality for plain view-model data (primitives, arrays, plain objects). */
export function isSameViewData(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => isSameViewData(item, right[index]));
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  if (leftKeys.length !== Object.keys(rightRecord).length) return false;
  return leftKeys.every((key) => key in rightRecord && isSameViewData(leftRecord[key], rightRecord[key]));
}

function reuse<T>(previous: T | undefined, next: T): T {
  return previous !== undefined && isSameViewData(previous, next) ? previous : next;
}

/**
 * Returns `next`, but with every seat / board / pot / folds value that is
 * structurally unchanged replaced by the previous reference. If nothing
 * changed at all, returns `previous` itself.
 */
export function shareTableViewModel(previous: TableViewModel | null, next: TableViewModel): TableViewModel {
  if (!previous) return next;

  const seats = next.seats.map((seat, index) => reuse(previous.seats[index], seat));
  const shared: TableViewModel = {
    ...next,
    blinds: reuse(previous.blinds, next.blinds),
    seats: seats.every((seat, index) => seat === previous.seats[index]) && seats.length === previous.seats.length
      ? previous.seats
      : seats,
    board: reuse(previous.board, next.board),
    pot: reuse(previous.pot, next.pot),
    deal: reuse(previous.deal, next.deal),
    folds: reuse(previous.folds, next.folds),
  };

  return isSameViewData(previous, shared) ? previous : shared;
}
