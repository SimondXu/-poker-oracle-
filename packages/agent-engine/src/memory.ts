import { buildBotPositionMap, type BotDecisionPhase, type BotPlayerStats, type BotPosition, type Card } from '@aipoker/shared';
import { describeHand, type DecisionHand } from '@aipoker/strategy-engine';

import type { Band, PersonaBands } from './personas.ts';

export const HAND_CATEGORIES = [
  'high_card',
  'pair',
  'two_pair',
  'trips',
  'straight',
  'flush',
  'full_house',
  'quads',
  'straight_flush',
] as const;
export type HandCategory = (typeof HAND_CATEGORIES)[number];

/** Something an opponent did in public that is worth remembering: no names, no unshown cards. */
export type NotableEvent =
  | { kind: 'showed_bluff' | 'showed_value'; hand: number; street: BotDecisionPhase; betPotShare: number; made: HandCategory }
  | { kind: 'big_preflop_shove'; hand: number; bb: number }
  | { kind: 'check_raise' | 'overbet'; hand: number; street: BotDecisionPhase }
  | { kind: 'called_down_light'; hand: number; made: HandCategory };

/** One of the bot's own recent hands, as the table saw it. */
export interface OwnHandLine {
  hand: number;
  position: BotPosition;
  /** For example "raise 2.5 bb, flop bet 1/3 pot". */
  line: string;
  netBb: number;
  showdown: boolean;
  /** Only when shown at a showdown. */
  shownCards: [Card, Card] | null;
}

export interface OpponentImpressions {
  /** Server-only hash of the seat's occupant, so a new occupant starts fresh; never rendered. */
  occupantKey: string;
  handsTogether: number;
  /** At most 3, newest first. */
  notable: NotableEvent[];
}

/** One bot's memory of this session, built only from public information. */
export interface BotSessionMemory {
  handsSeen: number;
  /** The last hands with a decision beyond a preflop fold, newest first. */
  own: OwnHandLine[];
  ownPreflopFolds: number;
  /** By seat number. */
  opponents: Map<number, OpponentImpressions>;
}

export function emptyBotMemory(): BotSessionMemory {
  return { handsSeen: 0, own: [], ownPreflopFolds: 0, opponents: new Map() };
}

/** The bot's view of a finished hand, and the public facts about it that its viewer hand lacks. */
export interface HandEndInput {
  /** The bot's viewer hand at hand end: other players' cards only where shown at the showdown. */
  view: DecisionHand;
  botId: string;
  handNumber: number;
  seats: ReadonlyMap<string, number>;
  /** Who won what; public. */
  payouts: ReadonlyArray<{ playerId: string; amount: number }>;
  /** Server-only key per occupant, so a seat's impressions reset when someone new sits there. */
  occupantKeys: ReadonlyMap<string, string>;
}

const MAX_OWN_LINES = 5;
const MAX_NOTABLE = 3;
const BIG_SHOVE_BB = 25;
const STREETS: Record<string, BotDecisionPhase> = {
  betting_preflop: 'preflop',
  betting_flop: 'flop',
  betting_turn: 'turn',
  betting_river: 'river',
};

export interface PublicAction {
  playerId: string;
  street: BotDecisionPhase;
  type: string;
  isRaise: boolean;
  /** A raise on a street nobody had bet yet: a bet. */
  isBet: boolean;
  /** The street total it matched or raised to. */
  to: number;
  /** Bets and raises: chips over the price before it, as a share of the pot before it. */
  potShare: number;
}

export function replay(view: DecisionHand): PublicAction[] {
  let street = '';
  let currentMax = 0;
  return view.actions.flatMap((action) => {
    if (action.phase !== street) {
      street = action.phase;
      currentMax = street === 'betting_preflop' ? view.bigBlind : 0;
    }
    const phase = STREETS[action.phase];
    if (!phase) {
      return [];
    }
    const isRaise = (action.type === 'raise_to' || action.type === 'all_in') && action.toAmount > currentMax;
    const replayed: PublicAction = {
      playerId: action.playerId,
      street: phase,
      type: action.type,
      isRaise,
      isBet: isRaise && currentMax === 0,
      to: isRaise ? action.toAmount : currentMax,
      potShare: isRaise ? (action.toAmount - currentMax) / Math.max(1, action.potTotalBefore) : 0,
    };
    currentMax = isRaise ? action.toAmount : currentMax;
    return [replayed];
  });
}

/** Hole cards shown at the showdown (two or more players still in); everyone else's, the bot's own included, are dropped. */
export function shownCards(view: DecisionHand): Map<string, [Card, Card]> {
  const stillIn = view.players.filter((player) => player.status !== 'folded');
  const shown = new Map<string, [Card, Card]>();
  if (stillIn.length >= 2) {
    for (const player of stillIn) {
      if (player.holeCards.length === 2) {
        shown.set(player.id, [player.holeCards[0]!, player.holeCards[1]!]);
      }
    }
  }
  return shown;
}

export function categoryOf(cards: readonly Card[], board: readonly Card[]): { category: HandCategory; owned: number } {
  const { rank, madeHandRank } = describeHand({ holeCards: [...cards], communityCards: [...board] });
  return { category: HAND_CATEGORIES[rank[0] ?? 0]!, owned: madeHandRank };
}

export function eventsFor(
  playerId: string,
  actions: readonly PublicAction[],
  hand: number,
  bigBlind: number,
  cards: readonly Card[] | undefined,
  board: readonly Card[],
): NotableEvent[] {
  const own = actions.filter((action) => action.playerId === playerId);
  const events: NotableEvent[] = [];
  for (const [index, action] of own.entries()) {
    if (action.street === 'preflop') {
      if (action.type === 'all_in' && action.isRaise && action.to / bigBlind >= BIG_SHOVE_BB) {
        events.push({ kind: 'big_preflop_shove', hand, bb: Math.round(action.to / bigBlind) });
      }
      continue;
    }
    if (action.isRaise && own.slice(0, index).some((earlier) => earlier.street === action.street && earlier.type === 'check')) {
      events.push({ kind: 'check_raise', hand, street: action.street });
    }
    if (action.isBet && action.potShare > 1) {
      events.push({ kind: 'overbet', hand, street: action.street });
    }
  }

  if (cards && board.length >= 3) {
    const { category, owned } = categoryOf(cards, board);
    const riverAggressor = actions.filter((action) => action.street === 'river' && action.isRaise).at(-1);
    const lastAggression = own.filter((action) => action.street !== 'preflop' && action.isRaise).at(-1);
    if (riverAggressor?.playerId === playerId && owned === 0) {
      events.push({ kind: 'showed_bluff', hand, street: 'river', betPotShare: riverAggressor.potShare, made: category });
    } else if (owned >= 2) {
      events.push({ kind: 'showed_value', hand, street: lastAggression?.street ?? 'river', betPotShare: lastAggression?.potShare ?? 0, made: category });
    }
    if (owned <= 1 && own.some((action) => action.street === 'river' && action.type === 'call')) {
      events.push({ kind: 'called_down_light', hand, made: category });
    }
  }
  return events;
}

/** The bot's own actions in a few words, e.g. "raise 2.5 bb, flop bet 33% pot, turn check". */
export function ownLine(actions: readonly PublicAction[], bigBlind: number): string {
  const bb = (chips: number) => `${(chips / bigBlind).toFixed(1)} bb`;
  return actions.map((action) => {
    let verb: string;
    if (action.type === 'fold' || action.type === 'check') {
      verb = action.type;
    } else if (!action.isRaise) {
      verb = action.type === 'all_in' ? 'call all-in' : action.street === 'preflop' ? `call ${bb(action.to)}` : 'call';
    } else if (action.type === 'all_in') {
      verb = `all-in ${bb(action.to)}`;
    } else if (action.street === 'preflop') {
      verb = `raise ${bb(action.to)}`;
    } else {
      verb = action.isBet ? `bet ${Math.round(action.potShare * 100)}% pot` : `raise to ${bb(action.to)}`;
    }
    return action.street === 'preflop' ? verb : `${action.street} ${verb}`;
  }).join(', ');
}

/**
 * Folds one finished hand into the bot's memory, from public information only: the bot's own cards
 * count only if shown at the showdown, like anyone else's. Pure: returns a new memory.
 */
export function updateBotMemory(memory: BotSessionMemory, input: HandEndInput): BotSessionMemory {
  const { view, botId, handNumber } = input;
  const actions = replay(view);
  const shown = shownCards(view);
  const board = view.communityCards;
  const self = view.players.find((player) => player.id === botId);
  if (!self) {
    return memory;
  }

  const opponents = new Map(memory.opponents);
  for (const player of view.players) {
    const seat = input.seats.get(player.id);
    if (player.id === botId || seat === undefined) {
      continue;
    }
    const occupantKey = input.occupantKeys.get(player.id) ?? '';
    const known = opponents.get(seat);
    const previous = known && known.occupantKey === occupantKey ? known : { occupantKey, handsTogether: 0, notable: [] };
    const fresh = eventsFor(player.id, actions, handNumber, view.bigBlind, shown.get(player.id), board).reverse();
    opponents.set(seat, {
      occupantKey,
      handsTogether: previous.handsTogether + 1,
      notable: [...fresh, ...previous.notable].slice(0, MAX_NOTABLE),
    });
  }

  const mine = actions.filter((action) => action.playerId === botId);
  const preflopFoldOnly = mine.length === 1 && mine[0]!.street === 'preflop' && mine[0]!.type === 'fold';
  const won = input.payouts.filter((payout) => payout.playerId === botId).reduce((sum, payout) => sum + payout.amount, 0);
  const ownCards = shown.get(botId) ?? null;
  const own = mine.length === 0 || preflopFoldOnly
    ? memory.own
    : [{
        hand: handNumber,
        position: buildBotPositionMap(view.players.map((player) => player.seatIndex), view.buttonMarkerSeat).get(self.seatIndex) ?? 'utg',
        line: ownLine(mine, view.bigBlind),
        netBb: Math.round(((won - self.handCommitted) / view.bigBlind) * 10) / 10,
        showdown: ownCards !== null,
        shownCards: ownCards,
      }, ...memory.own].slice(0, MAX_OWN_LINES);

  return {
    handsSeen: memory.handsSeen + 1,
    own,
    ownPreflopFolds: memory.ownPreflopFolds + (preflopFoldOnly ? 1 : 0),
    opponents,
  };
}

// ---- the NOTES section

const CATEGORY_WORDS: Record<HandCategory, string> = {
  high_card: 'no pair',
  pair: 'one pair',
  two_pair: 'two pair',
  trips: 'three of a kind',
  straight: 'a straight',
  flush: 'a flush',
  full_house: 'a full house',
  quads: 'four of a kind',
  straight_flush: 'a straight flush',
};

function describeEvent(event: NotableEvent): string {
  switch (event.kind) {
    case 'showed_bluff':
      return `showed a ${event.street} bluff with ${CATEGORY_WORDS[event.made]} in hand ${event.hand}`;
    case 'showed_value':
      return event.betPotShare > 0
        ? `showed ${CATEGORY_WORDS[event.made]} after betting ${Math.round(event.betPotShare * 100)}% of the pot on the ${event.street} in hand ${event.hand}`
        : `showed ${CATEGORY_WORDS[event.made]} at a showdown in hand ${event.hand}`;
    case 'big_preflop_shove':
      return `moved all-in for ${event.bb} bb before the flop in hand ${event.hand}`;
    case 'check_raise':
      return `check-raised the ${event.street} in hand ${event.hand}`;
    case 'overbet':
      return `bet more than the pot on the ${event.street} in hand ${event.hand}`;
    case 'called_down_light':
      return `called the river with ${CATEGORY_WORDS[event.made]} in hand ${event.hand}`;
  }
}

const pct = (share: number) => `${Math.round(share * 100)}%`;
const bandLabel = (band: Band) => (band.max >= 1 ? `at least ${pct(band.min)}` : band.min <= 0 ? `at most ${pct(band.max)}` : `${Math.round(band.min * 100)}-${pct(band.max)}`);

/**
 * The NOTES lines: impressions of the opponents in this hand (seats only), the bot's own session
 * statistics against its persona's targets, and its last hands. Lives in the user message, so the
 * cached system prefix stays stable.
 */
export function renderNotes(memory: BotSessionMemory, input: {
  opponentSeats: readonly number[];
  self: BotPlayerStats | undefined;
  bands: PersonaBands;
}): string[] {
  const lines = [...input.opponentSeats].sort((left, right) => left - right).slice(0, 5).flatMap((seat) => {
    const notable = memory.opponents.get(seat)?.notable ?? [];
    return notable.length > 0 ? [`Seat ${seat}: ${notable.map(describeEvent).join('; ')}.`] : [];
  });

  const { self, bands } = input;
  if (self && self.hands > 0) {
    const vpip = self.preflopVoluntary / self.hands;
    const pfrTarget = 'minShareOfVpip' in bands.pfr ? `at least ${pct(bands.pfr.minShareOfVpip)} of your VPIP` : bandLabel(bands.pfr);
    lines.push(`You this session: ${self.hands} hands · VPIP ${pct(vpip)} (target ${bandLabel(bands.vpip)}) · PFR ${pct(self.preflopRaises / self.hands)} (target ${pfrTarget}).`);
  }

  if (memory.own.length > 0) {
    const hands = memory.own.map((line) => {
      const result = line.netBb > 0 ? `won ${line.netBb} bb` : line.netBb < 0 ? `lost ${-line.netBb} bb` : 'broke even';
      const showdown = line.shownCards ? `at a showdown with ${line.shownCards.join(' ')}` : 'without showdown';
      return `${line.hand} ${line.position.toUpperCase()} ${line.line}, ${result} ${showdown}`;
    });
    const folds = memory.ownPreflopFolds > 0 ? `; besides these, ${memory.ownPreflopFolds} preflop folds` : '';
    lines.push(`Your last hands: ${hands.join(' · ')}${folds}`);
  }
  return lines;
}
