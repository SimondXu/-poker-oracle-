import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildBrief,
  buildMenu,
  hashJson,
  buildSystemPrompt,
  createToolContext,
  DEFAULT_PROMPT_VERSION,
  PROMPTS,
  REALTIME_RESPONSE_SCHEMA,
  renderUserMessage,
  validateRealtime,
  type AgentDecision,
  type Bilingual,
  type BotTurnInput,
  type Ledger,
  type MenuOption,
  type PromptVersion,
} from '@aipoker/agent-engine';
import {
  classifyAction,
  gradeDecision,
  type AgentPersonaId,
  type BotAction,
  type BotDecisionContext,
  type Card,
  type CoachActionKind,
  type CoachVerdict,
} from '@aipoker/shared';
import { adviseFromEquities, chooseBotAction } from '@aipoker/strategy-engine';

import type { AsyncPolicy } from './duplicate-hu-async.ts';
import { buildClaudeArgs, childEnv, parseClaudeOutput, runClaude, type ClaudeCallMeta, type ClaudeOutcome, type RunFn, type RunResult } from './claude-cli.ts';

/** Results under this label join later tables only if the prompt digests match (`llm-bots.md`, "CLI players"). */
export const CLI_PROTO_PROMPT_VERSION = 'cli-proto-0';
/** The label a prompt version's runs carry. */
export const CLI_PROTO_LABELS: Record<PromptVersion, string> = { v0: CLI_PROTO_PROMPT_VERSION, 'v1.1': 'cli-proto-1.1', 'v1.2': 'cli-proto-1.2' };
/** The deep-mode eval deadline (`LLM_AGENT_EVAL_TIMEOUT_MS`). */
export const DEADLINE_MS = 45_000;
/**
 * Two turns with `--json-schema`, three when the structured output is retried once (the smoke saw
 * 3 in 18 Haiku calls, 2026-10-14). More stops the run.
 */
export const MAX_TURNS = 3;
/** An arm with more fallbacks than this is contaminated: the TAG fallback inflates measured strength. */
export const FALLBACK_LIMIT = 0.02;
const FALLBACK_CHECK_AFTER = 100;
const UNCLASSIFIED_IN_A_ROW = 3;
const PRICE_BLUNDER_GAP = 0.15;
const RAW_LIMIT = 4_096;

/** A prompt version's system prompt for a persona (the version's own by default; the Analyst for v0): B2a's assembler, whole. */
export function cliSystemPrompt(version: PromptVersion = DEFAULT_PROMPT_VERSION, persona: AgentPersonaId = PROMPTS[version].defaultPersona): { text: string; sha256: string } {
  const text = buildSystemPrompt(persona, { deep: false }, version);
  return { text, sha256: createHash('sha256').update(text).digest('hex') };
}

export interface CliRow {
  /** `cli-claude/<model>/<effort>/<prompt version>`, with `+<persona>` unless it is the version's own persona. */
  id: string;
  model: string;
  effort: string;
  prompt: PromptVersion;
  persona: AgentPersonaId;
}

export const cliRowId = (model: string, effort: string, prompt: PromptVersion = DEFAULT_PROMPT_VERSION, persona: AgentPersonaId = PROMPTS[prompt].defaultPersona) =>
  `cli-claude/${model}/${effort}/${prompt}${persona === PROMPTS[prompt].defaultPersona ? '' : `+${persona}`}`;

/** The run ends here: a stop rule tripped. The checkpoint holds everything finished before it. */
export class StopRun extends Error {}

export interface ControlSnapshot {
  invocations: Record<string, number>;
  decisions: Record<string, number>;
  fallbacks: Record<string, number>;
}

/** Counts calls and decisions across the run's rows and decides when to stop. */
export class RunControl {
  stopReason: string | null = null;
  readonly invocations = new Map<string, number>();
  readonly decisions = new Map<string, number>();
  readonly fallbacks = new Map<string, number>();
  private unclassified = 0;

  readonly maxCallsPerRow: number;

  constructor(maxCallsPerRow: number) {
    this.maxCallsPerRow = maxCallsPerRow;
  }

  stop(reason: string): void {
    this.stopReason ??= reason;
  }

  /** Counts one invocation before it starts; throws when the run is stopped or the row is at its cap. */
  beginCall(rowId: string): void {
    const used = this.invocations.get(rowId) ?? 0;
    if (!this.stopReason && used >= this.maxCallsPerRow) {
      this.stop(`invocation cap: ${used} calls on ${rowId}`);
    }
    if (this.stopReason) {
      throw new StopRun(this.stopReason);
    }
    this.invocations.set(rowId, used + 1);
  }

  /** Stops the run on a failure that must not be retried; the rest only count. Throws StopRun when it stops here. */
  endCall(rowId: string, outcome: ClaudeOutcome): void {
    switch (outcome.kind) {
      case 'auth':
      case 'usage_limit':
      case 'rate_limit':
        this.stop(`${outcome.kind} on ${rowId}: ${outcome.detail}`);
        throw new StopRun(this.stopReason!);
      case 'violation':
        this.stop(`${outcome.reason} on ${rowId}: ${outcome.detail}`);
        throw new StopRun(this.stopReason!);
      case 'error':
      case 'bad_json':
      case 'spawn_error':
        this.unclassified += 1;
        if (this.unclassified >= UNCLASSIFIED_IN_A_ROW) {
          this.stop(`${UNCLASSIFIED_IN_A_ROW} unclassified errors in a row on ${rowId}: ${outcome.detail}`);
        }
        break;
      default:
        this.unclassified = 0;
    }
  }

  /** What a resumed run needs to keep counting where this one stopped. */
  snapshot(): ControlSnapshot {
    return { invocations: Object.fromEntries(this.invocations), decisions: Object.fromEntries(this.decisions), fallbacks: Object.fromEntries(this.fallbacks) };
  }

  restore(snapshot: ControlSnapshot): void {
    for (const [counts, saved] of [[this.invocations, snapshot.invocations], [this.decisions, snapshot.decisions], [this.fallbacks, snapshot.fallbacks]] as const) {
      Object.entries(saved).forEach(([rowId, count]) => counts.set(rowId, count));
    }
  }

  recordDecision(rowId: string, fellBack: boolean): void {
    const decisions = (this.decisions.get(rowId) ?? 0) + 1;
    const fallbacks = (this.fallbacks.get(rowId) ?? 0) + (fellBack ? 1 : 0);
    this.decisions.set(rowId, decisions);
    this.fallbacks.set(rowId, fallbacks);
    if (decisions >= FALLBACK_CHECK_AFTER && fallbacks / decisions > FALLBACK_LIMIT) {
      this.stop(`fallbacks ${fallbacks}/${decisions} on ${rowId}, over ${FALLBACK_LIMIT * 100}%`);
    }
  }
}

export type CliFallbackReason = 'timeout' | 'cli_error' | 'invalid_json' | 'invalid_choice';

/** One CLI decision, with what the report needs. The user message is kept, so a trace can be replayed. */
export interface CliDecisionTrace {
  traceId: string;
  at: string;
  promptVersion: string;
  /** The prompt version (`PROMPTS`), which also fixes the brief format. Traces from before it hold v0. */
  prompt: PromptVersion;
  persona: AgentPersonaId;
  botPromptVersion: string;
  promptSha256: string;
  model: string;
  effort: string;
  claudeVersion: string;
  handNumber: number;
  actionIndex: number;
  phase: BotDecisionContext['phase'];
  /** 0 is the button (small blind), 1 the big blind. */
  seat: 0 | 1;
  hole: Card[];
  board: Card[];
  briefMs: number;
  menu: MenuOption[];
  userMessage: string;
  call: {
    outcome: ClaudeOutcome['kind'];
    detail: string | null;
    wallMs: number;
    exitCode: number | null;
    meta: ClaudeCallMeta | null;
  };
  /** The structured answer, or the start of what came back. */
  raw: string;
  validation: { ok: boolean; errors: string[] } | null;
  decision: {
    source: 'llm' | 'fallback';
    fallbackReason: CliFallbackReason | null;
    choice: string | null;
    action: BotAction;
    kind: CoachActionKind;
  };
  note: Bilingual | null;
  talk: Bilingual | null;
  /** brief-1 only: the room's opponent ledger the brief was built from, with its hash; null for brief-0. */
  ledger: { hash: string; json: Ledger } | null;
  /** brief-1 only: the reads and the per-size estimates the model was shown (what the report scores). */
  exploit: ExploitTrace | null;
  /** The TAG advice built from the brief's memoised equities, never shown to the model. */
  advice: { equity: number | null; potOdds: number | null; stable: boolean; topKind: CoachActionKind | null };
  verdict: CoachVerdict;
  blunder: 'fold' | 'call' | null;
}

export interface ExploitTrace {
  reads: string[];
  /** The bets the menu priced: option letter, size as a share of the pot, estimated fold, what a bluff needs, river gain in bb. */
  estimates: Array<{ option: string; share: number; fold: number; bluffNeeds: number; gainBb: number | null }>;
}

/** What brief-1 showed, read back from the brief's tool runs. */
function exploitTrace(brief: ReturnType<typeof prepareDecision>['brief']): ExploitTrace | null {
  const read = brief.tools.find((run) => run.tool === 'opponent_read' && run.ok);
  const estimates = brief.tools.find((run) => run.tool === 'bet_estimates' && run.ok);
  if (!read && !estimates) {
    return null;
  }
  return {
    reads: ((read?.result as { reads: Array<{ label: string }> } | undefined)?.reads ?? []).map((entry) => entry.label),
    estimates: (estimates?.result as { options: ExploitTrace['estimates'] } | undefined)?.options ?? [],
  };
}

function toBotAction(decision: AgentDecision, context: BotDecisionContext): BotAction {
  switch (decision.type) {
    case 'call':
      return { type: 'call', amount: context.callAmount, thinkingDelayMs: 0 };
    case 'raise_to':
      return { type: 'raise_to', amount: decision.amount, thinkingDelayMs: 0 };
    default:
      return { type: decision.type, thinkingDelayMs: 0 };
  }
}

/** The action as the coach grades it: a raise to everything behind is the all-in. */
function heroAction(action: BotAction, context: BotDecisionContext): { kind: CoachActionKind; to?: number } {
  const allInTo = context.myStreetCommitted + context.myStack;
  const allIn = action.type === 'all_in' || (action.type === 'raise_to' && action.amount === allInTo);
  const kind = classifyAction(allIn ? { type: 'all_in' } : action, context);
  if (kind === 'all_in') {
    return { kind, to: allInTo };
  }
  return action.type === 'raise_to' ? { kind, to: action.amount } : { kind };
}

/**
 * Folding when equity beats the pot odds by 0.15 or more and the advice is stable; calling on the
 * river or for the whole stack when the pot odds beat equity by 0.15 or more.
 */
function priceBlunder(kind: CoachActionKind, context: BotDecisionContext, equity: number | null, potOdds: number | null, stable: boolean): 'fold' | 'call' | null {
  if (equity === null || potOdds === null) {
    return null;
  }
  if (kind === 'fold' && stable && equity - potOdds >= PRICE_BLUNDER_GAP) {
    return 'fold';
  }
  const forStack = context.callAmount >= context.myStack;
  if (kind === 'call' && (context.phase === 'river' || forStack) && potOdds - equity >= PRICE_BLUNDER_GAP) {
    return 'call';
  }
  return null;
}

/** Arm A1 for one decision: the full brief of the prompt version with empty NOTES, then the menu. */
export function prepareDecision(input: BotTurnInput, version: PromptVersion = DEFAULT_PROMPT_VERSION) {
  const format = PROMPTS[version].brief;
  const ctx = createToolContext(input, { foldModel: PROMPTS[version].foldModel });
  const brief = buildBrief(ctx, 'full', format);
  const userMessage = renderUserMessage({ ctx, brief, handNumber: input.handNumber, notes: [], format });
  return { ctx, brief, userMessage, menu: buildMenu(input.context) };
}

/**
 * One isolated call: a fresh empty working directory, the allow-listed environment, the deadline,
 * and the output checked against the model it was asked for. Shared by the eval policy and live play.
 */
export async function callClaude(
  args: string[],
  userMessage: string,
  options: { model: string; run?: RunFn; deadlineMs?: number },
): Promise<{ outcome: ClaudeOutcome; result: RunResult }> {
  const cwd = await mkdtemp(join(tmpdir(), 'holdem-cli-'));
  let result;
  try {
    result = await (options.run ?? runClaude)(args, { cwd, env: childEnv(), stdin: userMessage, deadlineMs: options.deadlineMs ?? DEADLINE_MS });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
  return { outcome: parseClaudeOutput(result.stdout, result.exitCode, result.timedOut, { model: options.model, maxTurns: MAX_TURNS }), result };
}

/** What a call's outcome means for this menu: the action to play, or `null` and the reason to play the fallback. */
export function interpretOutcome(outcome: ClaudeOutcome, menu: MenuOption[], context: BotDecisionContext) {
  let action: BotAction | null = null;
  let choice: string | null = null;
  let fallbackReason: CliFallbackReason | null = null;
  let validation: CliDecisionTrace['validation'] = null;
  let note: Bilingual | null = null;
  let talk: Bilingual | null = null;
  if (outcome.kind === 'ok') {
    const checked = validateRealtime(outcome.structured, menu, context.phase);
    validation = { ok: checked.ok, errors: checked.errors };
    if (checked.ok) {
      action = toBotAction(checked.action, context);
      choice = checked.choice;
      note = checked.note;
      talk = checked.talk;
    } else {
      fallbackReason = checked.reason;
    }
  } else {
    fallbackReason = outcome.kind === 'timeout' ? 'timeout' : 'cli_error';
  }
  return { action, choice, fallbackReason, validation, note, talk };
}

export interface CliPolicyDeps {
  row: CliRow;
  control: RunControl;
  system: { text: string; sha256: string };
  claudeVersion: string;
  run?: RunFn;
  deadlineMs?: number;
}

/**
 * One isolated `claude -p` per decision, on arm A1: the full brief, empty NOTES, the menu, then the
 * validator. A timeout, a CLI error or an invalid letter plays TAG, with the reason in the trace.
 */
export function createCliPolicy(deps: CliPolicyDeps): AsyncPolicy<CliDecisionTrace> {
  const { row, control, system } = deps;
  const run = deps.run ?? runClaude;
  const args = buildClaudeArgs({ model: row.model, effort: row.effort, systemPrompt: system.text, schema: REALTIME_RESPONSE_SCHEMA });

  return async (input: BotTurnInput, { rng, seat }) => {
    const { context } = input;
    const { ctx, brief, userMessage, menu } = prepareDecision(input, row.prompt);

    control.beginCall(row.id);
    const { outcome, result } = await callClaude(args, userMessage, { model: row.model, run, deadlineMs: deps.deadlineMs ?? DEADLINE_MS });
    control.endCall(row.id, outcome);

    const { action: chosen, choice, fallbackReason, validation, note, talk } = interpretOutcome(outcome, menu, context);
    const action = chosen ?? chooseBotAction(context, 'tag', rng);
    control.recordDecision(row.id, fallbackReason !== null);

    const hero = heroAction(action, context);
    const advice = adviseFromEquities(context, ctx.equities, { handId: '', actionIndex: input.actionIndex, stateVersion: input.stateVersion });
    const equity = advice.equity ?? null;
    const potOdds = advice.potOdds ?? null;
    const trace: CliDecisionTrace = {
      traceId: randomUUID(),
      at: new Date().toISOString(),
      promptVersion: CLI_PROTO_LABELS[row.prompt],
      prompt: row.prompt,
      persona: row.persona,
      botPromptVersion: PROMPTS[row.prompt].botVersion,
      promptSha256: system.sha256,
      model: row.model,
      effort: row.effort,
      claudeVersion: deps.claudeVersion,
      handNumber: input.handNumber,
      actionIndex: input.actionIndex,
      phase: context.phase,
      seat,
      hole: [...context.holeCards],
      board: [...context.communityCards],
      briefMs: brief.ms,
      menu,
      userMessage,
      call: {
        outcome: outcome.kind,
        detail: outcome.kind === 'ok' ? null : outcome.detail,
        wallMs: result.ms,
        exitCode: result.exitCode,
        meta: 'meta' in outcome ? outcome.meta : null,
      },
      raw: (outcome.kind === 'ok' ? JSON.stringify(outcome.structured) : result.stdout || result.stderr).slice(0, RAW_LIMIT),
      validation,
      decision: { source: fallbackReason === null ? 'llm' : 'fallback', fallbackReason, choice, action, kind: hero.kind },
      note,
      talk,
      ledger: PROMPTS[row.prompt].brief === 'brief-0' ? null : { hash: hashJson(input.ledger), json: input.ledger },
      exploit: exploitTrace(brief),
      advice: { equity, potOdds, stable: advice.stable, topKind: advice.options[0]?.kind ?? null },
      verdict: gradeDecision(advice, hero),
      blunder: priceBlunder(hero.kind, context, equity, potOdds, advice.stable),
    };
    return { action, trace };
  };
}
