import { emptyLedger, REALTIME_RESPONSE_SCHEMA, updateLedger, type Ledger } from '@aipoker/agent-engine';
import type { HandState } from '@aipoker/game-engine';
import { chooseBotAction } from '@aipoker/strategy-engine';
import { cliModelId, getCliBotModel, type BotDecisionContext, type CliAgentModel } from '@aipoker/shared';

import type { RuntimeRoom } from '../rooms/types.ts';
import { assertCanary, buildClaudeArgs, forbiddenEnvNames, preflight, type RunFn } from '../tools/claude-cli.ts';
import { callClaude, cliRowId, cliSystemPrompt, interpretOutcome, prepareDecision, RunControl, StopRun } from '../tools/llm-cli-policy.ts';
import { buildBotHandEnd, buildBotTurnInput } from './bot-view.ts';
import { botActionToDecision, type RealtimeFallbackReason, type RealtimeLlmDecisionResult } from './llm-agent-runtime.ts';

/** Table play uses the prompt version the evals last measured, and the Analyst: the Exploiter is eval-only. */
const TABLE_PROMPT = 'v1.2';
const TABLE_PERSONA = 'analyst';
const TABLE_EFFORT = 'low';
const DEFAULT_MAX_CONCURRENT = 2;

export interface CliBotRuntime {
  /** False when the flag is off, the startup checks failed, or a stop rule tripped. */
  readonly enabled: boolean;
  /** The deadline of one `claude -p` call. */
  readonly timeoutMs: number;
  decide: (input: {
    room: RuntimeRoom;
    botId: string;
    model: CliAgentModel;
    /** The decision context the caller already holds: what the TAG fallback plays. */
    context: BotDecisionContext;
    signal?: AbortSignal;
  }) => Promise<RealtimeLlmDecisionResult>;
  /** Folds a finished hand into the room's opponent ledger, once per hand. */
  recordHandEnd: (room: RuntimeRoom) => void;
  /** The room's opponent ledger so far. */
  ledgerOf: (room: RuntimeRoom) => Ledger;
}

export interface CliBotRuntimeOptions {
  timeoutMs: number;
  rng?: () => number;
  run?: RunFn;
  maxConcurrent?: number;
  log?: (message: string) => void;
}

export const DISABLED_CLI_BOTS: CliBotRuntime = {
  enabled: false,
  timeoutMs: 0,
  decide: async ({ context }) => ({ action: botActionToDecision(chooseBotAction(context, 'tag', Math.random)), fallbackReason: 'cli_unavailable' }),
  recordHandEnd: () => undefined,
  ledgerOf: () => emptyLedger(),
};

function createLimiter(max: number): () => Promise<() => void> {
  let active = 0;
  const waiting: Array<() => void> = [];
  return () =>
    new Promise((resolve) => {
      const grant = () => {
        active += 1;
        resolve(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < max) {
        grant();
      } else {
        waiting.push(grant);
      }
    });
}

const FALLBACK_REASONS = { timeout: 'timeout', cli_error: 'llm_error', invalid_json: 'invalid_output', invalid_choice: 'invalid_output' } as const;

/**
 * Claude Code bots for live tables: per decision, the same brief, menu and validator as the evals
 * (prompt v1.2, Analyst) through one isolated `claude -p`, on the user's subscription. A timeout, a CLI
 * error or an invalid letter plays TAG for that decision. A sign-in, usage-limit or rate-limit error,
 * or an isolation violation, trips the eval's stop rule: the bots play TAG for the rest of the process
 * and nothing retries. At most `maxConcurrent` calls run at once, across rooms.
 */
export function createCliBotRuntime(options: CliBotRuntimeOptions): CliBotRuntime {
  const rng = options.rng ?? Math.random;
  const run = options.run;
  const log = options.log ?? ((message: string) => console.log(`[cli-bots] ${message}`));
  const acquire = createLimiter(options.maxConcurrent ?? DEFAULT_MAX_CONCURRENT);
  const control = new RunControl(Number.POSITIVE_INFINITY);
  const system = cliSystemPrompt(TABLE_PROMPT, TABLE_PERSONA);
  const argsByModel = new Map<CliAgentModel, string[]>();
  const ledgers = new WeakMap<RuntimeRoom, Ledger>();
  const countedHands = new WeakSet<HandState>();
  let announced = false;

  const argsFor = (model: CliAgentModel): string[] => {
    const cached = argsByModel.get(model);
    if (cached) {
      return cached;
    }
    const args = buildClaudeArgs({ model: cliModelId(model), effort: TABLE_EFFORT, systemPrompt: system.text, schema: REALTIME_RESPONSE_SCHEMA });
    argsByModel.set(model, args);
    return args;
  };

  const announceStop = () => {
    if (!announced && control.stopReason) {
      announced = true;
      log(`disabled for this process, bots play TAG from now on: ${control.stopReason}`);
    }
  };

  return {
    get enabled() {
      return control.stopReason === null;
    },
    timeoutMs: options.timeoutMs,

    async decide({ room, botId, model, context, signal }) {
      const fallback = (fallbackReason: RealtimeFallbackReason): RealtimeLlmDecisionResult => ({
        action: botActionToDecision(chooseBotAction(context, 'tag', rng)),
        fallbackReason,
      });
      if (control.stopReason) {
        return fallback('cli_unavailable');
      }
      // Built before the first await: the input is frozen as this turn begins.
      const turn = buildBotTurnInput(room, botId, undefined, ledgers.get(room));
      if (!turn) {
        return fallback('invalid_output');
      }
      const { userMessage, menu } = prepareDecision(turn, TABLE_PROMPT);
      const rowId = cliRowId(cliModelId(model), TABLE_EFFORT, TABLE_PROMPT, TABLE_PERSONA);

      const release = await acquire();
      try {
        if (signal?.aborted) {
          return fallback('timeout');
        }
        control.beginCall(rowId);
        const { outcome, result } = await callClaude(argsFor(model), userMessage, { model: cliModelId(model), ...(run ? { run } : {}), deadlineMs: options.timeoutMs });
        control.endCall(rowId, outcome);

        const decided = interpretOutcome(outcome, menu, context);
        log(`${room.id} hand ${room.handNumber} ${context.phase} ${cliModelId(model)} ${Math.round(result.ms)} ms: ${outcome.kind === 'ok' ? `choice ${decided.choice ?? 'invalid'}` : `${outcome.kind}: ${outcome.detail}`}${decided.fallbackReason ? `, TAG (${decided.fallbackReason})` : ''}`);
        announceStop();
        if (decided.action) {
          return { action: botActionToDecision(decided.action) };
        }
        return fallback(control.stopReason ? 'cli_unavailable' : FALLBACK_REASONS[decided.fallbackReason!]);
      } catch (error) {
        if (error instanceof StopRun) {
          announceStop();
          return fallback('cli_unavailable');
        }
        throw error;
      } finally {
        release();
      }
    },

    ledgerOf: (room) => ledgers.get(room) ?? emptyLedger(),

    recordHandEnd(room) {
      const hand = room.hand;
      if (!hand || hand.phase !== 'hand_end' || countedHands.has(hand)) {
        return;
      }
      const bot = [...room.players.values()].find((player) => getCliBotModel(player.botConfig));
      const handEnd = bot ? buildBotHandEnd(room, bot.id) : null;
      if (!handEnd) {
        return;
      }
      countedHands.add(hand);
      // A live table is not a duplicate deal, so what the showdown made public goes in at once.
      ledgers.set(room, updateLedger(ledgers.get(room) ?? emptyLedger(), handEnd, { cards: true }));
    },
  };
}

export interface StartCliBotsInput {
  enabled: boolean;
  timeoutMs: number;
  rng?: () => number;
  run?: RunFn;
  log?: (message: string) => void;
  /** The checks `claude-cli.ts` provides; injectable so tests need no `claude`. */
  preflight?: typeof preflight;
  assertCanary?: typeof assertCanary;
}

/**
 * Startup for `LLM_CLI_BOTS_ENABLED`: the eval's preflight (subscription sign-in, no key or base-URL
 * variable) and canary gate. If either fails the bots stay off and the log says why.
 */
export function startCliBots(input: StartCliBotsInput): CliBotRuntime {
  if (!input.enabled) {
    return DISABLED_CLI_BOTS;
  }
  const log = input.log ?? ((message: string) => console.log(`[cli-bots] ${message}`));
  try {
    const { version, subscriptionType } = (input.preflight ?? preflight)();
    (input.assertCanary ?? assertCanary)(version);
    log(`enabled on ${version}${subscriptionType ? `, ${subscriptionType} plan` : ''}`);
    return createCliBotRuntime({
      timeoutMs: input.timeoutMs,
      log,
      ...(input.rng ? { rng: input.rng } : {}),
      ...(input.run ? { run: input.run } : {}),
    });
  } catch (error) {
    const hint = forbiddenEnvNames().includes('ANTHROPIC_BASE_URL')
      ? ' Start the server with `pnpm --filter @aipoker/server dev:claude-bots`, which unsets ANTHROPIC_BASE_URL.'
      : '';
    log(`LLM_CLI_BOTS_ENABLED is set but the Claude bots are NOT enabled: ${error instanceof Error ? error.message : String(error)}.${hint}`);
    return DISABLED_CLI_BOTS;
  }
}
