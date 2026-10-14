import { randomInt } from 'node:crypto';

import type { BotTurnInput } from '@aipoker/agent-engine';
import { applyAction, initializeHand, type HandState } from '@aipoker/game-engine';
import type { BotAction, BotDecisionContext, BotPlayerStats, Card } from '@aipoker/shared';

import { buildBotTurnInput } from '../game-loop/bot-view.ts';
import { recordFinishedHandStats } from '../game-loop/bot-support.ts';
import type { RuntimeRoom } from '../rooms/types.ts';
import { createHeadsUpRoom, SMALL_BLIND_RATIO, type HalfDealResult } from './duplicate-hu.ts';
import type { Policy } from './eval-policies.ts';
import { mixSeed, mulberry32 } from './eval-utils.ts';

/**
 * The duplicate heads-up runner for players that take time (a model behind a CLI). `Policy` is
 * synchronous, so this is a separate loop with the same room, deck and decision stream as
 * `playHalfDeal`; with rule bots it reproduces `runDuplicateHu` deal by deal.
 */
export interface AsyncPolicyExtra {
  /** The half-deal's decision stream, for a fallback rule bot. */
  rng: () => number;
  seat: 0 | 1;
  half: 1 | 2;
}

export interface AsyncDecision<T> {
  action: BotAction;
  trace?: T;
}

/** Reads only the bot's own view, as a live bot would. */
export type AsyncPolicy<T = never> = (input: BotTurnInput, extra: AsyncPolicyExtra) => Promise<AsyncDecision<T>>;

export function ruleBotPolicy(policy: Policy): AsyncPolicy {
  return async (input, { rng }) => ({ action: policy(input.context, rng) });
}

export interface HalfDealAsyncResult<T> extends HalfDealResult {
  traces: T[];
}

export async function playHalfDealAsync<T>(input: {
  policiesBySeat: readonly [AsyncPolicy<T>, AsyncPolicy<T>];
  dealSeed: number;
  decisionSalt: number;
  stackBb: number;
  bigBlind: number;
  idsBySeat?: readonly [string, string];
  playerStats?: RuntimeRoom['playerStats'];
  onDecision?: (context: BotDecisionContext, action: BotAction) => void;
}): Promise<HalfDealAsyncResult<T>> {
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
  const traces: T[] = [];
  room.hand = dealt;

  while (room.hand.currentActorSeat !== null) {
    const seat = room.hand.currentActorSeat as 0 | 1;
    const actor = room.hand.players.find((player) => player.seatIndex === seat);
    const turn = actor ? buildBotTurnInput(room, actor.id) : null;
    if (!actor || !turn) {
      throw new Error(`No decision context for seat ${seat} in phase ${room.hand.phase}`);
    }

    const { action, trace } = await policiesBySeat[seat](turn, { rng: decisionRng, seat, half: input.decisionSalt === 1 ? 1 : 2 });
    if (trace !== undefined) {
      traces.push(trace);
    }
    input.onDecision?.(turn.context, action);
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
  return { netBbBySeat: [net(0), net(1)], deal, traces };
}

export interface DealPairAsyncResult<T> {
  /** A's total over both halves, in big blinds. */
  aBb: number;
  /** Traces by half: 1 is A on the button, 2 is A in the big blind. */
  traces: Array<{ half: 1 | 2; trace: T }>;
}

/** Plays deal `index` twice with the same deck: A on seat 0 then A on seat 1. */
export async function playDealPairAsync<T>(input: {
  a: AsyncPolicy<T>;
  b: AsyncPolicy<T>;
  seed: number;
  index: number;
  stackBb: number;
  bigBlind: number;
  playerStats: RuntimeRoom['playerStats'];
}): Promise<DealPairAsyncResult<T>> {
  const dealSeed = mixSeed(input.seed, input.index);
  const shared = { dealSeed, stackBb: input.stackBb, bigBlind: input.bigBlind, playerStats: input.playerStats };
  const first = await playHalfDealAsync({ ...shared, policiesBySeat: [input.a, input.b], idsBySeat: ['a', 'b'], decisionSalt: 1 });
  const second = await playHalfDealAsync({ ...shared, policiesBySeat: [input.b, input.a], idsBySeat: ['b', 'a'], decisionSalt: 2 });
  return {
    aBb: first.netBbBySeat[0] + second.netBbBySeat[1],
    traces: [
      ...first.traces.map((trace) => ({ half: 1 as const, trace })),
      ...second.traces.map((trace) => ({ half: 2 as const, trace })),
    ],
  };
}

// ---- matches

/** What a match needs to continue after a restart: where it is and each side's tendencies so far. */
export interface MatchState {
  nextDeal: number;
  playerStats: Array<[string, BotPlayerStats]>;
}

export interface PairRecord<T> extends DealPairAsyncResult<T> {
  deal: number;
  /** A's cumulative statistics after this pair. */
  aStats: BotPlayerStats | null;
}

export interface MatchRun<T> {
  seed: number;
  a: AsyncPolicy<T>;
  b: AsyncPolicy<T>;
  stackBb: number;
  bigBlind: number;
}

/**
 * One match: deal pairs in order, each side's tendencies building up as they would at a table.
 * A pair that does not finish (the policy throws) leaves the state as it was, so a resume replays it.
 * `onPair` runs before the state moves on, so a record is on disk before the checkpoint passes it.
 */
export async function playMatchAsync<T>(
  run: MatchRun<T>,
  state: MatchState,
  untilDeal: number,
  onPair: (record: PairRecord<T>, next: MatchState) => Promise<void> | void,
): Promise<MatchState> {
  let current = state;
  while (current.nextDeal < untilDeal) {
    const playerStats: RuntimeRoom['playerStats'] = new Map(current.playerStats.map(([id, stats]) => [id, { ...stats }]));
    const pair = await playDealPairAsync({ ...run, index: current.nextDeal, playerStats });
    const next: MatchState = { nextDeal: current.nextDeal + 1, playerStats: [...playerStats].map(([id, stats]) => [id, { ...stats }]) };
    await onPair({ ...pair, deal: current.nextDeal, aStats: playerStats.get('a') ? { ...playerStats.get('a')! } : null }, next);
    current = next;
  }
  return current;
}

/** Runs `worker` over `jobs`, at most `concurrency` at a time. After a failure nothing new starts; the first error is rethrown. */
export async function runQueue<J>(jobs: readonly J[], concurrency: number, worker: (job: J) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const lane = async () => {
    while (!failure && next < jobs.length) {
      try {
        await worker(jobs[next++]!);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, lane));
  if (failure) {
    throw (failure as { error: unknown }).error;
  }
}

/** The run's seed: from the OS, never on a command line or in the environment, and written only when the run stops. */
export function secretSeed(): number {
  return randomInt(1, 2 ** 32);
}
