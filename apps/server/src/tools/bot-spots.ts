import { baseFold, emptyLedger, HAND_CATEGORIES, type Ledger, type PlayerLedger } from '@aipoker/agent-engine';
import { applyAction, getValidActions, initializeHand, type HandState, type PlayerActionInput } from '@aipoker/game-engine';
import type { BotPlayerStats, Card } from '@aipoker/shared';
import { createStableAnalysisRng } from '@aipoker/strategy-engine';

import type { RuntimePlayer, RuntimeRoom } from '../rooms/types.ts';

type Rng = () => number;

export interface BotSpot {
  room: RuntimeRoom;
  botId: string;
  /** Random public ledger for the room's players: counts by bet size, showdowns and a few shown hands. */
  ledger: Ledger;
}

const DECK: Card[] = [...'23456789TJQKA'].flatMap((rank) => [...'hdcs'].map((suit) => `${rank}${suit}` as Card));
const SHOWN_LINES = ['raise 2.5 bb, flop bet 33% pot, turn check, river call', 'call 2.0 bb, flop check, turn bet 75% pot', 'raise 3.0 bb, flop bet 50% pot, turn bet 75% pot, river bet 66% pot', 'raise 2.2 bb, flop check, turn call, river call'];

function randomPlayerLedger(rng: Rng): PlayerLedger {
  const buckets = [0.33, 0.6, 1, 2].map(() => {
    const faced = Math.floor(rng() * 9);
    return { faced, folded: Math.floor(rng() * (faced + 1)) };
  });
  const sawFlop = Math.floor(rng() * 40);
  const shown = Array.from({ length: Math.floor(rng() * 4) }, (_, index) => {
    const first = Math.floor(rng() * DECK.length);
    const second = (first + 1 + Math.floor(rng() * (DECK.length - 1))) % DECK.length;
    return {
      hand: 40 - index * 7,
      cards: [DECK[first]!, DECK[second]!] as [Card, Card],
      made: HAND_CATEGORIES[Math.floor(rng() * 4)]!,
      line: SHOWN_LINES[Math.floor(rng() * SHOWN_LINES.length)]!,
      result: (['won', 'lost', 'split'] as const)[Math.floor(rng() * 3)]!,
    };
  });
  return {
    buckets,
    sumBase: buckets.reduce((sum, bucket, index) => sum + bucket.faced * baseFold([0.33, 0.6, 1, 2][index]!), 0),
    sawFlop,
    showdowns: Math.floor(rng() * (sawFlop + 1)),
    lightCalldowns: Math.floor(rng() * 4),
    shown,
    notable: [],
  };
}

/** A ledger for these players with no relation to the hand: the check that nothing in it is ever rendered by id, or confused with hidden cards. */
export function randomLedger(playerIds: readonly string[], seed: string): Ledger {
  const rng = createStableAnalysisRng(seed);
  const ledger = emptyLedger();
  for (const id of playerIds) {
    if (rng() < 0.85) {
      ledger.players[id] = randomPlayerLedger(rng);
    }
  }
  return ledger;
}

/** A random legal action, biased toward calls so hands reach later streets. */
function randomAction(hand: HandState, rng: Rng): PlayerActionInput {
  const actor = hand.players.find((player) => player.seatIndex === hand.currentActorSeat)!;
  const valid = getValidActions(hand, actor.id);
  const roll = rng();
  if (roll < 0.12) {
    return { playerId: actor.id, type: valid.canCheck ? 'check' : 'fold' };
  }
  if (roll < 0.62 || (!valid.canRaise && !valid.canAllIn)) {
    return { playerId: actor.id, type: valid.canCheck ? 'check' : 'call' };
  }
  if (roll < 0.94 && valid.canRaise && valid.minRaiseTo < valid.maxRaiseTo) {
    const amount = valid.minRaiseTo + Math.floor(rng() * Math.min(valid.maxRaiseTo - valid.minRaiseTo, valid.minRaiseTo * 3));
    return { playerId: actor.id, type: 'raise_to', amount };
  }
  return { playerId: actor.id, type: valid.canAllIn ? 'all_in' : 'call' };
}

function randomStats(rng: Rng): BotPlayerStats {
  const hands = Math.floor(rng() * 90);
  const preflopVoluntary = Math.floor(rng() * hands * 0.6);
  const postflopActions = Math.floor(rng() * hands * 1.5);
  const postflopFacingBets = Math.floor(rng() * postflopActions * 0.5);
  return {
    hands,
    preflopVoluntary,
    preflopRaises: Math.floor(rng() * preflopVoluntary),
    preflopOversizedRaises: Math.floor(rng() * 2),
    postflopActions,
    postflopAggressive: Math.floor(rng() * postflopActions * 0.5),
    postflopFacingBets,
    postflopFoldsToBets: Math.floor(rng() * postflopFacingBets),
  };
}

/** Player ids and names that can't occur by accident in a prompt, so a substring check means a leak. */
export function playerIdFor(seed: string, seatIndex: number): string {
  return `uid-${seed.replace(/[^a-z0-9]/gi, '')}-${seatIndex}-xq`;
}
export function playerNameFor(seatIndex: number): string {
  return `Zorblax${'ABCDEF'[seatIndex]}Quine`;
}

/**
 * Seeded rooms stopped at a decision: 2-6 players, 3-250 bb stacks, random public stats, a random
 * number of random actions in. The actor is the bot under test.
 */
export function seededBotSpots(count: number, seed: string): BotSpot[] {
  const rng = createStableAnalysisRng(seed);
  const spots: BotSpot[] = [];
  while (spots.length < count) {
    const playerCount = 2 + Math.floor(rng() * 5);
    const players = Array.from({ length: playerCount }, (_, seatIndex): RuntimePlayer => ({
      id: playerIdFor(`${seed}${spots.length}`, seatIndex),
      name: playerNameFor(seatIndex),
      seatIndex,
      stack: Math.round(20 * (3 + rng() * 247)),
      isBot: true,
      botConfig: { kind: 'llm', model: 'gpt', personaId: 'analyst' },
    }));
    const initialized = initializeHand({
      players: players.map(({ id, seatIndex, stack }) => ({ id, seatIndex, stack })),
      buttonMarkerSeat: Math.floor(rng() * playerCount),
      smallBlind: 10,
      bigBlind: 20,
      rng,
    });
    if (!initialized.ok) {
      throw new Error(initialized.error);
    }
    let hand = initialized.value;
    const steps = Math.floor(rng() * 14);
    for (let step = 0; step < steps && hand.currentActorSeat !== null; step += 1) {
      const applied = applyAction(hand, randomAction(hand, rng), { timestamp: 0 });
      if (!applied.ok) {
        throw new Error(applied.error);
      }
      hand = applied.value;
    }
    const actor = hand.players.find((player) => player.seatIndex === hand.currentActorSeat);
    if (!actor) {
      continue;
    }

    const spotIndex = spots.length;
    spots.push({
      botId: actor.id,
      ledger: randomLedger(players.map((player) => player.id), `${seed}:ledger:${spotIndex}`),
      room: {
        ...emptyRoom(players),
        stateVersion: 1 + Math.floor(rng() * 400),
        handNumber: 1 + Math.floor(rng() * 200),
        hand,
        lastButtonMarkerSeat: hand.buttonMarkerSeat,
        playerStats: new Map(players.filter(() => rng() < 0.8).map((player) => [player.id, randomStats(rng)])),
      },
    });
  }
  return spots;
}

/**
 * One room playing `hands` seeded hands of random actions to the end, at stacks reset each hand.
 * Returns a copy of the room at each hand end, for the memory reducer.
 */
export function seededFinishedHands(hands: number, seed: string, playerCount = 6): RuntimeRoom[] {
  const rng = createStableAnalysisRng(seed);
  const players = Array.from({ length: playerCount }, (_, seatIndex): RuntimePlayer => ({
    id: playerIdFor(seed, seatIndex),
    name: playerNameFor(seatIndex),
    seatIndex,
    stack: 2_000,
    isBot: true,
    botConfig: { kind: 'llm', model: 'gpt', personaId: 'analyst' },
  }));
  const finished: RuntimeRoom[] = [];
  for (let handNumber = 1; handNumber <= hands; handNumber += 1) {
    const initialized = initializeHand({
      players: players.map(({ id, seatIndex }) => ({ id, seatIndex, stack: 20 * (20 + Math.floor(rng() * 180)) })),
      buttonMarkerSeat: handNumber % playerCount,
      smallBlind: 10,
      bigBlind: 20,
      rng,
    });
    if (!initialized.ok) {
      throw new Error(initialized.error);
    }
    let hand = initialized.value;
    while (hand.currentActorSeat !== null) {
      const applied = applyAction(hand, randomAction(hand, rng), { timestamp: 0 });
      if (!applied.ok) {
        throw new Error(applied.error);
      }
      hand = applied.value;
    }
    finished.push({
      ...emptyRoom(players),
      handNumber,
      hand,
      lastButtonMarkerSeat: hand.buttonMarkerSeat,
    });
  }
  return finished;
}

function emptyRoom(players: RuntimePlayer[]): RuntimeRoom {
  return {
    id: 'BQTSPT',
    stateVersion: 1,
    handNumber: 0,
    smallBlind: 10,
    bigBlind: 20,
    actionTimeoutMs: 30_000,
    players: new Map(players.map((player) => [player.id, { ...player }])),
    readyPlayerIds: new Set(players.map((player) => player.id)),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
    hostPlayerId: null,
    playerStats: new Map(),
    coachAdvice: new Map(),
    coachRecords: new Map(),
    coachSessions: new Map(),
    coachReviews: new Map(),
  };
}
