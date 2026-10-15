import type { Card } from '@aipoker/shared';

import { baseFold, foldLine, lineKey, SIZE_BUCKET_EDGES, sizeBucket, type LineBucket } from './exploit.ts';
import { categoryOf, eventsFor, ownLine, replay, shownCards, type HandCategory, type HandEndInput, type NotableEvent } from './memory.ts';

/**
 * The opponent ledger (`llm-bots.md`, "Opponent ledger"): what a table's players have been seen to do,
 * kept by the room, from public information only. Players' VPIP, PFR, aggression and fold-to-bet
 * counts stay in `room.playerStats`; the ledger adds what the fold estimates and reads need on top:
 * how each player responded to bets of each size, how often they saw a showdown, and what they showed.
 * Plain JSON, keyed by player id, rendered by seat; a new occupant is a new id, so it starts empty.
 */
export interface ShownHand {
  hand: number;
  cards: [Card, Card];
  made: HandCategory;
  /** The player's own actions, e.g. "raise 2.5 bb, flop bet 33% pot, turn check". */
  line: string;
  result: 'won' | 'lost' | 'split';
}

export interface PlayerLedger {
  /** Bets faced after the flop and folded to, by size bucket (`SIZE_BUCKET_EDGES`). */
  buckets: Array<{ faced: number; folded: number }>;
  /** The sum over those bets of the fold rate a rational defender would have shown (`baseFold`). */
  sumBase: number;
  /** The bets of those into an unopened pot, by the player's line this hand (`lineKey`), then by size bucket (prompt v1.2). */
  byLine: Record<string, LineBucket[]>;
  /** Hands that reached the flop with the player still in, and how many of those they took to a showdown. */
  sawFlop: number;
  showdowns: number;
  /** Showdowns where they called the river with no pair at all (the board playing is no pair). Needs shown cards. */
  lightCalldowns: number;
  /** The last 3 hands shown at a showdown, newest first. Needs shown cards. */
  shown: ShownHand[];
  /** The last 3 notable events, newest first. */
  notable: NotableEvent[];
}

export interface Ledger {
  players: Record<string, PlayerLedger>;
}

const MAX_SHOWN = 3;
const MAX_NOTABLE = 3;
const FLOP_ON = ['betting_flop', 'betting_turn', 'betting_river'];

export const emptyPlayerLedger = (): PlayerLedger => ({
  buckets: Array.from({ length: SIZE_BUCKET_EDGES.length + 1 }, () => ({ faced: 0, folded: 0 })),
  sumBase: 0,
  byLine: {},
  sawFlop: 0,
  showdowns: 0,
  lightCalldowns: 0,
  shown: [],
  notable: [],
});

export const emptyLedger = (): Ledger => ({ players: {} });

export const ledgerOf = (ledger: Ledger, playerId: string): PlayerLedger => ledger.players[playerId] ?? emptyPlayerLedger();

/**
 * Folds one finished hand into the ledger. Pure: returns a new ledger. Everything is public: the
 * actions and the pot sizes, who reached the flop and the showdown, and, only with `cards`, the hands
 * shown at a showdown and what they imply. A run that deals the same cards both ways round passes
 * `cards: false` for halves that can see each other (the default runner), and merges the two hands of
 * a pair after it with `cards: true` (snapshot mode), so no half reads what the other showed.
 */
export function updateLedger(ledger: Ledger, input: HandEndInput, options: { cards: boolean }): Ledger {
  const { view } = input;
  const next: Ledger = structuredClone(ledger);
  const actions = replay(view);
  const seated = view.players.filter((player) => player.status !== 'out' && player.status !== 'sitting_out');
  const reachedShowdown = seated.filter((player) => player.status !== 'folded').length >= 2 && view.communityCards.length === 5;
  const shown = options.cards ? shownCards(view) : new Map<string, [Card, Card]>();

  // Bets faced after the flop, from the price and the pot at the time; a bet into an unopened pot also keeps the line it came on.
  const facing = new Map<string, Array<{ x: number; folded: boolean; line: string | null }>>();
  let street = '';
  let currentMax = 0;
  let raises = 0;
  const committed = new Map<string, number>();
  for (const [index, action] of view.actions.entries()) {
    if (action.phase !== street) {
      street = action.phase;
      currentMax = street === 'betting_preflop' ? view.bigBlind : 0;
      raises = 0;
      committed.clear();
    }
    const before = committed.get(action.playerId) ?? 0;
    if (FLOP_ON.includes(street) && currentMax > before) {
      const toCall = currentMax - before;
      const line = raises === 1 && before === 0 ? lineKey(foldLine(view.actions.slice(0, index), action.playerId, street)) : null;
      facing.set(action.playerId, [...(facing.get(action.playerId) ?? []), { x: toCall / Math.max(1, action.potTotalBefore - toCall), folded: action.type === 'fold', line }]);
    }
    if ((action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax) {
      currentMax = action.toAmount;
      raises += 1;
      committed.set(action.playerId, action.toAmount);
    } else if (action.type === 'call') {
      committed.set(action.playerId, currentMax);
    } else if (action.type === 'all_in') {
      committed.set(action.playerId, action.toAmount);
    }
  }

  for (const player of seated) {
    const entry = next.players[player.id] ?? emptyPlayerLedger();
    entry.byLine ??= {};
    for (const { x, folded, line } of facing.get(player.id) ?? []) {
      const bucket = entry.buckets[sizeBucket(x)]!;
      bucket.faced += 1;
      bucket.folded += folded ? 1 : 0;
      entry.sumBase += baseFold(x);
      if (line !== null) {
        const cell = (entry.byLine[line] ??= entry.buckets.map(() => ({ faced: 0, folded: 0, sumBase: 0 })))[sizeBucket(x)]!;
        cell.faced += 1;
        cell.folded += folded ? 1 : 0;
        cell.sumBase += baseFold(x);
      }
    }
    const sawFlop = view.communityCards.length >= 3 && !view.actions.some((action) => action.playerId === player.id && action.phase === 'betting_preflop' && action.type === 'fold');
    entry.sawFlop += sawFlop ? 1 : 0;
    entry.showdowns += sawFlop && reachedShowdown && player.status !== 'folded' ? 1 : 0;

    const cards = shown.get(player.id);
    const fresh = eventsFor(player.id, actions, input.handNumber, view.bigBlind, cards, view.communityCards).reverse();
    entry.lightCalldowns += cards && fresh.some((event) => event.kind === 'called_down_light') && categoryOf(cards, view.communityCards).owned === 0 ? 1 : 0;
    entry.notable = [...fresh, ...entry.notable].slice(0, MAX_NOTABLE);
    if (cards) {
      const won = input.payouts.filter((payout) => payout.playerId === player.id).reduce((sum, payout) => sum + payout.amount, 0);
      const net = won - player.handCommitted;
      const result: ShownHand['result'] = net > 0 ? 'won' : net < 0 ? 'lost' : 'split';
      entry.shown = [{
        hand: input.handNumber,
        cards,
        made: categoryOf(cards, view.communityCards).category,
        line: ownLine(actions.filter((action) => action.playerId === player.id), view.bigBlind),
        result,
      }, ...entry.shown].slice(0, MAX_SHOWN);
    }
    next.players[player.id] = entry;
  }
  return next;
}
