/**
 * Pure builder for the side-panel hand log. It returns structured data only
 * (action types, chip numbers, bet-to-pot ratios); the panel translates verbs
 * and formats numbers, so nothing here depends on the locale.
 * No React; `hand-log-model.test.ts` covers it.
 */
import type { ActionType, GameAction, HandState, Phase } from '@aipoker/shared';

export type HandLogStreetName = 'preflop' | 'flop' | 'turn' | 'river';
export type HandLogTone = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface HandLogHeader {
  handNumber: number;
  smallBlind: number;
  bigBlind: number;
  /** Name of the player on the button, if seated. */
  buttonName: string | null;
}

export interface HandLogStreetEntry {
  kind: 'street';
  key: string;
  street: HandLogStreetName;
  /** Cumulative board as of this street (empty preflop). */
  board: string[];
}

export interface HandLogBlindEntry {
  kind: 'blind';
  key: string;
  playerId: string;
  playerName: string;
  blind: 'sb' | 'bb';
  amount: number;
}

export interface HandLogActionEntry {
  kind: 'action';
  key: string;
  playerId: string;
  playerName: string;
  type: ActionType;
  tone: HandLogTone;
  /** Chips shown next to the verb ("to" amount for bets and raises, added chips for calls); `null` for fold / check. */
  amount: number | null;
  /** Chips this bet, raise or call put in, divided by the pot before it; `null` for folds, checks and an unknown pot. */
  betRatio: number | null;
}

export type HandLogEntry = HandLogStreetEntry | HandLogBlindEntry | HandLogActionEntry;

export interface HandLogResultLine {
  playerId: string;
  playerName: string;
  amount: number;
  /** Server hand name as received (e.g. "两对"); `null` when the pot was won without showdown. Use `handRankKey` to translate. */
  handRankName: string | null;
  /** Best five cards, when known. */
  cards: string[];
}

/** The slice of the store's `HandResult` this module needs (structural, so tests need no store). */
export interface HandLogResultInput {
  potTotal: number;
  payouts: ReadonlyArray<{
    playerId: string;
    playerName: string;
    amount: number;
    handRankName?: string | undefined;
    bestCards?: readonly string[] | undefined;
  }>;
}

export interface HandLog {
  header: HandLogHeader;
  entries: HandLogEntry[];
  results: HandLogResultLine[];
  potTotal: number | null;
}

const STREET_ORDER: readonly HandLogStreetName[] = ['preflop', 'flop', 'turn', 'river'];
const STREET_BOARD_SIZE: Record<HandLogStreetName, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };

export function streetFromPhase(phase: Phase): HandLogStreetName | null {
  switch (phase) {
    case 'betting_preflop':
      return 'preflop';
    case 'betting_flop':
      return 'flop';
    case 'betting_turn':
      return 'turn';
    case 'betting_river':
      return 'river';
    default:
      return null;
  }
}

const ACTION_TONE: Record<ActionType, HandLogTone> = {
  fold: 'fold',
  check: 'check',
  call: 'call',
  bet: 'raise',
  raise_to: 'raise',
  all_in: 'allin',
};

/** Hand names the client attaches to payouts (`HAND_RANK_NAMES` in lib/hand-evaluator), keyed for i18n. */
const HAND_RANK_KEY: Record<string, HandRankKey> = {
  高牌: 'high_card',
  一对: 'one_pair',
  两对: 'two_pair',
  三条: 'three_kind',
  顺子: 'straight',
  同花: 'flush',
  葫芦: 'full_house',
  四条: 'four_kind',
  同花顺: 'straight_flush',
};

export type HandRankKey =
  | 'high_card'
  | 'one_pair'
  | 'two_pair'
  | 'three_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_kind'
  | 'straight_flush';

/** i18n key suffix for a server hand name, or `null` for an unknown / empty name. */
export function handRankKey(name: string | null | undefined): HandRankKey | null {
  return name ? (HAND_RANK_KEY[name] ?? null) : null;
}

/** Tone, amount and bet-to-pot ratio for one action. */
export function describeAction(
  action: Pick<GameAction, 'type' | 'amount' | 'addedAmount' | 'toAmount'> & Partial<Pick<GameAction, 'potTotalBefore'>>,
): { type: ActionType; tone: HandLogTone; amount: number | null; betRatio: number | null } {
  const tone = ACTION_TONE[action.type];
  switch (action.type) {
    case 'fold':
    case 'check':
      return { type: action.type, tone, amount: null, betRatio: null };
    case 'call':
      return { type: action.type, tone, amount: action.addedAmount || action.amount, betRatio: potRatio(action) };
    case 'all_in':
      return {
        type: action.type,
        tone,
        amount: action.toAmount || action.addedAmount || action.amount,
        betRatio: potRatio(action),
      };
    default:
      return { type: action.type, tone, amount: action.toAmount || action.amount, betRatio: potRatio(action) };
  }
}

function potRatio(action: Pick<GameAction, 'amount' | 'addedAmount'> & Partial<Pick<GameAction, 'potTotalBefore'>>): number | null {
  const added = action.addedAmount || action.amount;
  const pot = action.potTotalBefore ?? 0;
  if (added <= 0 || pot <= 0) return null;
  return added / pot;
}

/** One result line per winner (payouts of the same player are merged), biggest first. */
export function summarizeResult(result: HandLogResultInput): HandLogResultLine[] {
  const byPlayer = new Map<string, HandLogResultLine>();
  for (const payout of result.payouts) {
    const existing = byPlayer.get(payout.playerId);
    if (existing) {
      existing.amount += payout.amount;
      if (!existing.handRankName && payout.handRankName) existing.handRankName = payout.handRankName;
      if (existing.cards.length === 0 && payout.bestCards?.length) existing.cards = [...payout.bestCards];
      continue;
    }
    byPlayer.set(payout.playerId, {
      playerId: payout.playerId,
      playerName: payout.playerName,
      amount: payout.amount,
      handRankName: payout.handRankName ? payout.handRankName : null,
      cards: payout.bestCards ? [...payout.bestCards] : [],
    });
  }
  return [...byPlayer.values()].sort((a, b) => b.amount - a.amount);
}

function blindEntries(hand: HandState): HandLogBlindEntry[] {
  const entries: HandLogBlindEntry[] = [];
  const sb = hand.sbSeat === null ? undefined : hand.players.find((p) => p.seatIndex === hand.sbSeat);
  const bb = hand.players.find((p) => p.seatIndex === hand.bbSeat);
  if (sb) {
    entries.push({ kind: 'blind', key: 'blind-sb', playerId: sb.id, playerName: sb.name, blind: 'sb', amount: hand.smallBlind });
  }
  if (bb) {
    entries.push({ kind: 'blind', key: 'blind-bb', playerId: bb.id, playerName: bb.name, blind: 'bb', amount: hand.bigBlind });
  }
  return entries;
}

/**
 * Build the log of the current hand. A street separator appears for every
 * street that has actions or whose board cards are dealt (all-in run-outs have
 * no actions on later streets).
 */
export function buildHandLog(hand: HandState, result?: HandLogResultInput | null): HandLog {
  const button = hand.players.find((p) => p.seatIndex === hand.buttonMarkerSeat);
  const actionsByStreet = new Map<HandLogStreetName, GameAction[]>();
  let lastStreet: HandLogStreetName = 'preflop';
  const orderedActions = [...hand.actions].sort((a, b) => a.sequenceNum - b.sequenceNum);
  for (const action of orderedActions) {
    // Actions outside a betting phase (showdown bookkeeping) stay with the last known street.
    const street: HandLogStreetName = streetFromPhase(action.phase) ?? lastStreet;
    lastStreet = street;
    const bucket = actionsByStreet.get(street);
    if (bucket) bucket.push(action);
    else actionsByStreet.set(street, [action]);
  }

  const entries: HandLogEntry[] = [];
  for (const street of STREET_ORDER) {
    const boardSize = STREET_BOARD_SIZE[street];
    const hasBoard = boardSize > 0 && hand.communityCards.length >= boardSize;
    const streetActions = actionsByStreet.get(street) ?? [];
    if (street !== 'preflop' && !hasBoard && streetActions.length === 0) continue;

    entries.push({
      kind: 'street',
      key: `street-${street}`,
      street,
      board: hand.communityCards.slice(0, boardSize),
    });
    if (street === 'preflop') entries.push(...blindEntries(hand));
    for (const action of streetActions) {
      entries.push({
        kind: 'action',
        key: `action-${action.sequenceNum}`,
        playerId: action.playerId,
        playerName: action.playerName,
        ...describeAction(action),
      });
    }
  }

  return {
    header: {
      handNumber: hand.handNumber,
      smallBlind: hand.smallBlind,
      bigBlind: hand.bigBlind,
      buttonName: button?.name ?? null,
    },
    entries,
    results: result ? summarizeResult(result) : [],
    potTotal: result ? result.potTotal : null,
  };
}
