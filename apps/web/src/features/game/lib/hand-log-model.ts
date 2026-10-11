/**
 * Pure builder for the side-panel hand log (PokerNow-style text lines).
 * No React; `hand-log-model.test.ts` covers it.
 */
import type { ActionType, GameAction, HandState, Phase } from '@aipoker/shared';

import { formatChips } from '../../../lib/utils.ts';

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
  label: string;
  /** Cumulative board as of this street (empty preflop). */
  board: string[];
}

export interface HandLogBlindEntry {
  kind: 'blind';
  key: string;
  playerName: string;
  label: string;
  amount: string;
}

export interface HandLogActionEntry {
  kind: 'action';
  key: string;
  playerId: string;
  playerName: string;
  verb: string;
  tone: HandLogTone;
  /** Already formatted, `null` for fold / check. */
  amount: string | null;
}

export type HandLogEntry = HandLogStreetEntry | HandLogBlindEntry | HandLogActionEntry;

export interface HandLogResultLine {
  playerId: string;
  playerName: string;
  amount: number;
  /** e.g. "两对"; `null` when the pot was won without showdown. */
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
const STREET_LABEL: Record<HandLogStreetName, string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};
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

const ACTION_VERB: Record<ActionType, { verb: string; tone: HandLogTone }> = {
  fold: { verb: '弃牌', tone: 'fold' },
  check: { verb: '过牌', tone: 'check' },
  call: { verb: '跟注', tone: 'call' },
  bet: { verb: '下注', tone: 'raise' },
  raise_to: { verb: '加注到', tone: 'raise' },
  all_in: { verb: '全压', tone: 'allin' },
};

/** Verb, tone and formatted amount for one action ("加注到 60"). */
export function describeAction(
  action: Pick<GameAction, 'type' | 'amount' | 'addedAmount' | 'toAmount'>,
): { verb: string; tone: HandLogTone; amount: string | null } {
  const { verb, tone } = ACTION_VERB[action.type];
  switch (action.type) {
    case 'fold':
    case 'check':
      return { verb, tone, amount: null };
    case 'call':
      return { verb, tone, amount: formatChips(action.addedAmount || action.amount) };
    case 'all_in':
      return { verb, tone, amount: formatChips(action.toAmount || action.addedAmount || action.amount) };
    default:
      return { verb, tone, amount: formatChips(action.toAmount || action.amount) };
  }
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

export function formatResultLine(line: Pick<HandLogResultLine, 'playerName' | 'amount' | 'handRankName'>): string {
  const base = `${line.playerName} 赢得 ${formatChips(line.amount)}`;
  return line.handRankName ? `${base} · ${line.handRankName}` : base;
}

function blindEntries(hand: HandState): HandLogBlindEntry[] {
  const entries: HandLogBlindEntry[] = [];
  const sb = hand.sbSeat === null ? undefined : hand.players.find((p) => p.seatIndex === hand.sbSeat);
  const bb = hand.players.find((p) => p.seatIndex === hand.bbSeat);
  if (sb) {
    entries.push({ kind: 'blind', key: 'blind-sb', playerName: sb.name, label: '下小盲', amount: formatChips(hand.smallBlind) });
  }
  if (bb) {
    entries.push({ kind: 'blind', key: 'blind-bb', playerName: bb.name, label: '下大盲', amount: formatChips(hand.bigBlind) });
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
      label: STREET_LABEL[street],
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

export function formatHandHeader(header: HandLogHeader): string {
  const parts = [`第 ${header.handNumber} 手`, `盲注 ${formatChips(header.smallBlind)}/${formatChips(header.bigBlind)}`];
  if (header.buttonName) parts.push(`庄位 ${header.buttonName}`);
  return parts.join(' · ');
}
