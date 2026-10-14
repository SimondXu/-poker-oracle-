import type { BotDecisionContext, BotOpponentView, BotPlayerStats } from '@aipoker/shared';
import {
  analyzePostflop,
  createStableAnalysisRng,
  once,
  preflopEquityVsCallers,
  type DecisionHand,
  type Equities,
} from '@aipoker/strategy-engine';

import type { Ledger } from '../ledger.ts';
import type { BotSessionMemory } from '../memory.ts';

/** Iterations per equity estimate, as the coach runs them (standard error about 0.02). */
export const EQUITY_ITERATIONS = 512;

/**
 * Everything one bot decision may read, frozen when its turn starts. Built from the bot's own
 * viewer hand, so it holds no one else's hole cards, no deck and no coach data.
 */
export interface BotTurnInput {
  roomId: string;
  handNumber: number;
  actionIndex: number;
  stateVersion: number;
  botId: string;
  view: DecisionHand;
  context: BotDecisionContext;
  /** Player id to seat number (1-6). Server-side only: prompts and tool outputs name seats, never ids. */
  seats: ReadonlyMap<string, number>;
  stats: ReadonlyMap<string, BotPlayerStats>;
  memory: BotSessionMemory;
  /** The room's public opponent ledger as of the start of this hand (or pair), keyed by player id. */
  ledger: Ledger;
  /** `${room}:${hand}:${bot}:${actionIndex}`; each tool seeds from it. */
  seedBase: string;
}

/** What a tool can read. No room, so a tool cannot reach hidden cards even by mistake. */
export interface ToolContext {
  /** The bot's own id, to tell its actions apart; never rendered. */
  selfId: string;
  view: DecisionHand;
  context: BotDecisionContext;
  seatOf: (playerId: string) => number;
  stats: ReadonlyMap<string, BotPlayerStats>;
  memory: BotSessionMemory;
  ledger: Ledger;
  seedBase: string;
  /** Equity against every live opponent, computed at most once and shared by the brief and the advisor. */
  equities: Equities;
}

export class ToolArgumentError extends Error {}

export function toolSeed(seedBase: string, tool: string, seat: number | null): string {
  return `${seedBase}:${tool}:${seat ?? 'all'}`;
}

export function createToolContext(input: BotTurnInput): ToolContext {
  const { context, seats } = input;
  const rng = () => createStableAnalysisRng(toolSeed(input.seedBase, 'equity', null));
  return {
    selfId: input.botId,
    view: input.view,
    context,
    seatOf: (playerId) => {
      const seat = seats.get(playerId);
      if (seat === undefined) {
        throw new Error('player without a seat');
      }
      return seat;
    },
    stats: input.stats,
    memory: input.memory,
    ledger: input.ledger,
    seedBase: input.seedBase,
    equities: {
      postflop: once(() => analyzePostflop(context, rng(), {
        forceSimulation: true,
        flopIterations: EQUITY_ITERATIONS,
        turnIterations: EQUITY_ITERATIONS,
        riverIterations: EQUITY_ITERATIONS,
        preferExactRiverHeadsUp: true,
      })),
      preflopVsCallers: once(() => preflopEquityVsCallers(context, rng(), EQUITY_ITERATIONS)),
    },
  };
}

/** The live opponent in this seat, or an argument error. */
export function liveOpponent(ctx: ToolContext, seat: number | null): BotOpponentView {
  const opponent = ctx.context.opponents?.find((candidate) => ctx.seatOf(candidate.id) === seat);
  if (!opponent) {
    throw new ToolArgumentError(`seat ${seat} is not a live opponent`);
  }
  return opponent;
}

/** Live opponents in seat order. */
export function liveOpponents(ctx: ToolContext): BotOpponentView[] {
  return [...(ctx.context.opponents ?? [])].sort((left, right) => ctx.seatOf(left.id) - ctx.seatOf(right.id));
}
