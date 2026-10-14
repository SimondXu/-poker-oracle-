import { applyAction, initializeHand, type HandState } from '@aipoker/game-engine';
import type { BotAction, BotDecisionContext, Card } from '@aipoker/shared';

import { buildBotDecisionContext, recordFinishedHandStats } from '../game-loop/bot-support.ts';
import type { RuntimePlayer, RuntimeRoom } from '../rooms/types.ts';
import { POLICIES, type Policy, type PolicyName } from './eval-policies.ts';
import { addToSample, createSample, mixSeed, mulberry32, summarizeSample, type WinRateSummary } from './eval-utils.ts';

export interface DuplicateHuOptions {
  a: PolicyName;
  b: PolicyName;
  deals?: number | undefined;
  seed?: number | undefined;
  stackBb?: number | undefined;
  bigBlind?: number | undefined;
}

export interface DuplicateHuReport {
  mode: 'duplicate-hu';
  a: PolicyName;
  b: PolicyName;
  seed: number;
  stackBb: number;
  deals: number;
  hands: number;
  /** A's win rate over deal pairs; B's is the exact negative. */
  aWinRate: WinRateSummary;
}

export interface HalfDealResult {
  /** Net chips in big blinds by seat (seat 0 is the button / small blind). */
  netBbBySeat: [number, number];
  /** Dealt state before any action, so tests can prove two halves share one deck. */
  deal: { holeCardsBySeat: [Card[], Card[]]; deck: Card[] };
}

const DEFAULT_SEED = 20260307;
export const SMALL_BLIND_RATIO = 2;

export function createHeadsUpRoom(idsBySeat: readonly [string, string], playerStats: RuntimeRoom['playerStats']): RuntimeRoom {
  const players = new Map<string, RuntimePlayer>(
    idsBySeat.map((id, seatIndex) => [id, { id, name: `Seat ${seatIndex}`, seatIndex, stack: 0, isBot: true }])
  );

  return {
    id: 'duplicate-hu',
    stateVersion: 0,
    handNumber: 0,
    smallBlind: 0,
    bigBlind: 0,
    actionTimeoutMs: 0,
    players,
    readyPlayerIds: new Set(players.keys()),
    pendingDisconnectPlayerIds: new Set(),
    spectatingPlayerIds: new Set(),
    hand: null,
    lastActionSeqByPlayer: new Map(),
    lastBroadcastActionCount: 0,
    lastButtonMarkerSeat: null,
    hostPlayerId: null,
    playerStats,
    coachAdvice: new Map(),
    coachRecords: new Map(),
    coachSessions: new Map(),
    coachReviews: new Map(),
  };
}

/**
 * Plays one heads-up hand. The deck depends only on `dealSeed`; bot decisions use their own
 * stream derived from `dealSeed` and `decisionSalt`, so a swapped replay sees the same cards.
 */
export function playHalfDeal(input: {
  policiesBySeat: readonly [Policy, Policy];
  dealSeed: number;
  decisionSalt: number;
  stackBb: number;
  bigBlind: number;
  /** Player ids by seat; give each policy the same id in both halves so its stats follow it. */
  idsBySeat?: readonly [string, string];
  /** Tendencies carried from earlier hands of the match, updated with this one. */
  playerStats?: RuntimeRoom['playerStats'];
  onDecision?: (context: BotDecisionContext, action: BotAction) => void;
}): HalfDealResult {
  const { policiesBySeat, bigBlind } = input;
  const idsBySeat = input.idsBySeat ?? ['seat-0', 'seat-1'];
  const smallBlind = Math.max(1, Math.floor(bigBlind / SMALL_BLIND_RATIO));
  const stack = Math.round(bigBlind * input.stackBb);
  const room = createHeadsUpRoom(idsBySeat, input.playerStats ?? new Map());
  room.smallBlind = smallBlind;
  room.bigBlind = bigBlind;

  const initialized = initializeHand({
    players: idsBySeat.map((id, seatIndex) => ({ id, seatIndex, stack })),
    buttonMarkerSeat: 0,
    smallBlind,
    bigBlind,
    rng: mulberry32(input.dealSeed),
  });
  if (!initialized.ok) {
    throw new Error(`Failed to initialize duplicate hand: ${initialized.error}`);
  }

  const dealt: HandState = initialized.value;
  const deal = {
    holeCardsBySeat: [0, 1].map((seat) => [...(dealt.players.find((player) => player.seatIndex === seat)?.holeCards ?? [])]) as [Card[], Card[]],
    deck: [...dealt.deck],
  };
  const decisionRng = mulberry32(mixSeed(input.dealSeed, input.decisionSalt));
  room.hand = dealt;

  while (room.hand.currentActorSeat !== null) {
    const seat = room.hand.currentActorSeat;
    const actor = room.hand.players.find((player) => player.seatIndex === seat);
    const context = actor ? buildBotDecisionContext(room, actor.id) : null;
    if (!actor || !context) {
      throw new Error(`No decision context for seat ${seat} in phase ${room.hand.phase}`);
    }

    const action = policiesBySeat[seat as 0 | 1](context, decisionRng);
    input.onDecision?.(context, action);
    const result = applyAction(
      room.hand,
      { playerId: actor.id, type: action.type, ...('amount' in action ? { amount: action.amount } : {}) },
      { timestamp: room.hand.actions.length + 1 }
    );
    if (!result.ok) {
      throw new Error(`Illegal ${action.type} from seat ${seat}: ${result.error}`);
    }
    room.hand = result.value;
  }
  recordFinishedHandStats(room);

  const net = (seat: number) => ((room.hand?.players.find((player) => player.seatIndex === seat)?.stack ?? stack) - stack) / bigBlind;
  return { netBbBySeat: [net(0), net(1)], deal };
}

/** Plays deal `index` twice with the same deck: A on seat 0 then A on seat 1. Returns A's total in bb. */
export function playDealPair(input: {
  a: PolicyName;
  b: PolicyName;
  seed: number;
  index: number;
  stackBb: number;
  bigBlind: number;
  playerStats?: RuntimeRoom['playerStats'];
}): number {
  const dealSeed = mixSeed(input.seed, input.index);
  const shared = { dealSeed, stackBb: input.stackBb, bigBlind: input.bigBlind, playerStats: input.playerStats ?? new Map() };
  const policyA = POLICIES[input.a];
  const policyB = POLICIES[input.b];
  const aOnButton = playHalfDeal({ ...shared, policiesBySeat: [policyA, policyB], idsBySeat: ['a', 'b'], decisionSalt: 1 });
  const aOnBigBlind = playHalfDeal({ ...shared, policiesBySeat: [policyB, policyA], idsBySeat: ['b', 'a'], decisionSalt: 2 });
  return aOnButton.netBbBySeat[0] + aOnBigBlind.netBbBySeat[1];
}

export function runDuplicateHu(options: DuplicateHuOptions): DuplicateHuReport {
  const deals = options.deals ?? 1000;
  const seed = options.seed ?? DEFAULT_SEED;
  const stackBb = options.stackBb ?? 100;
  const bigBlind = options.bigBlind ?? 20;
  const pairs = createSample();
  // One match: each side's tendencies build up over the deals, as they would at a real table.
  const playerStats: RuntimeRoom['playerStats'] = new Map();

  for (let index = 0; index < deals; index += 1) {
    addToSample(pairs, playDealPair({ a: options.a, b: options.b, seed, index, stackBb, bigBlind, playerStats }));
  }

  return {
    mode: 'duplicate-hu',
    a: options.a,
    b: options.b,
    seed,
    stackBb,
    deals,
    hands: deals * 2,
    aWinRate: summarizeSample(pairs, 2),
  };
}
