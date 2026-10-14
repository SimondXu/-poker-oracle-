import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { BotTurnInput } from '@aipoker/agent-engine';
import type { BotAction } from '@aipoker/shared';
import { chooseBotAction } from '@aipoker/strategy-engine';

import { playMatchAsync, ruleBotPolicy, type AsyncPolicy, type MatchState } from './duplicate-hu-async.ts';
import { parsePolicyName, POLICIES, type PolicyName } from './eval-policies.ts';
import { mixSeed } from './eval-utils.ts';
import type { Checkpoint } from './llm-hu.ts';
import { prepareDecision, type CliDecisionTrace } from './llm-cli-policy.ts';
import { loadDeals, type DealLine } from './llm-hu-report.ts';

/**
 * Rebuilds what the model saw in a finished run. A run's checkpoint holds its seed (revealed at the
 * end), `deals.jsonl` holds every decision the model made, and the rule bot opponent is
 * deterministic, so playing the match again with the recorded actions puts the game in the same
 * state at every decision. That gives two things: a gate (the user message of every decision comes
 * out byte for byte as it was sent, so a refactor cannot move the prompts of a finished run) and
 * the inputs of old decisions, for asking another prompt the same question (`llm-hu-spots.ts`).
 */
export const EVAL_DIR = fileURLToPath(new URL('../../.eval/llm-hu/', import.meta.url));

export interface RecordedRun {
  id: string;
  seed: number;
  config: Checkpoint['config'];
  /** Every pair of the CLI rows, by job key (`row|opponent|match`), in deal order. */
  jobs: Map<string, DealLine[]>;
}

export function loadRun(id: string, dir: string = `${EVAL_DIR}${id}`): RecordedRun {
  const checkpointPath = `${dir}/checkpoint.json`;
  if (!existsSync(checkpointPath)) {
    throw new Error(`No checkpoint for run ${id} in ${dir}`);
  }
  const checkpoint = JSON.parse(readFileSync(checkpointPath, 'utf8')) as Checkpoint;
  if (checkpoint.seed === null) {
    throw new Error(`Run ${id} has no seed on disk (it is still going, or crashed), so its deals cannot be replayed`);
  }
  const jobs = new Map<string, DealLine[]>();
  for (const line of loadDeals(`${dir}/deals.jsonl`).filter((candidate) => candidate.traces.length > 0)) {
    jobs.set(line.key, [...(jobs.get(line.key) ?? []), line]);
  }
  for (const [key, lines] of jobs) {
    lines.sort((left, right) => left.deal - right.deal);
    if (lines.some((line, index) => line.deal !== index)) {
      throw new Error(`Run ${id}: the pairs of ${key} are not contiguous from deal 0`);
    }
  }
  return { id, seed: checkpoint.seed, config: checkpoint.config, jobs };
}

/** One decision of a recorded run, with the input rebuilt for it. */
export interface WalkedDecision {
  key: string;
  row: string;
  opponent: PolicyName;
  match: number;
  deal: number;
  half: 1 | 2;
  /** Position among the model's decisions in the pair. */
  position: number;
  input: BotTurnInput;
  trace: CliDecisionTrace;
}

export interface WalkSummary {
  pairs: number;
  decisions: number;
  /** The game left the recorded path: a decision whose state differs, or a pair whose result differs. */
  problems: string[];
}

export interface WalkOptions {
  /** The deals to play of a job (default all); a job at 0 is skipped. */
  dealsOf?: (key: string, recorded: number) => number;
}

/**
 * Plays every CLI job of a run again, feeding the recorded actions to the model's seat and the rule
 * bot to the other. `visit` runs at each of the model's decisions, before its action is applied.
 */
export async function walkRun(run: RecordedRun, visit: (decision: WalkedDecision) => void | Promise<void>, options: WalkOptions = {}): Promise<WalkSummary> {
  const summary: WalkSummary = { pairs: 0, decisions: 0, problems: [] };
  for (const [key, lines] of run.jobs) {
    const [row, opponentName, matchText] = key.split('|') as [string, string, string];
    const opponent = parsePolicyName(opponentName);
    const match = Number(matchText);
    const until = options.dealsOf?.(key, lines.length) ?? lines.length;
    if (until <= 0) {
      continue;
    }

    const at = { pair: 0, position: 0 };
    const recordedPolicy: AsyncPolicy = async (input, { rng, half }) => {
      const line = lines[at.pair]!;
      const trace = line.traces[at.position]?.trace;
      if (!trace) {
        throw new Error(`${key} deal ${line.deal}: the game asks for decision ${at.position + 1}, the run recorded ${line.traces.length}`);
      }
      if (trace.actionIndex !== input.actionIndex || trace.phase !== input.context.phase || trace.hole.join() !== input.context.holeCards.join() || trace.board.join() !== input.context.communityCards.join()) {
        throw new Error(`${key} deal ${line.deal} decision ${at.position + 1}: the replayed game is in another state than the recorded one`);
      }
      const position = at.position;
      at.position += 1;
      summary.decisions += 1;
      await visit({ key, row, opponent, match, deal: line.deal, half, position, input, trace });
      // A fallback played TAG from the shared stream, so it must draw from it here too or the rule bot drifts.
      const action: BotAction = trace.decision.action;
      if (trace.decision.source === 'fallback') {
        chooseBotAction(input.context, 'tag', rng);
      }
      return { action };
    };

    const matchRun = {
      seed: mixSeed(run.seed, match),
      a: recordedPolicy,
      b: ruleBotPolicy(POLICIES[opponent]),
      stackBb: run.config.stackBb,
      bigBlind: run.config.bigBlind,
      snapshotPerPair: run.config.snapshotPerPair === true,
    };
    const start: MatchState = { nextDeal: 0, playerStats: [] };
    try {
      await playMatchAsync(matchRun, start, until, (record) => {
        const line = lines[at.pair]!;
        if (at.position !== line.traces.length) {
          summary.problems.push(`${key} deal ${line.deal}: the game asked for ${at.position} decisions, the run recorded ${line.traces.length}`);
        }
        if (record.aBb !== line.aBb) {
          summary.problems.push(`${key} deal ${line.deal}: result ${record.aBb} bb, recorded ${line.aBb} bb`);
        }
        summary.pairs += 1;
        at.pair += 1;
        at.position = 0;
      });
    } catch (error) {
      summary.problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return summary;
}

export interface GateMismatch {
  key: string;
  deal: number;
  half: 1 | 2;
  position: number;
  /** First differing character of the user message. */
  offset: number;
  recorded: string;
  rebuilt: string;
}

export interface GateResult extends WalkSummary {
  identical: number;
  mismatches: GateMismatch[];
}

function firstDifference(left: string, right: string): number {
  let offset = 0;
  while (offset < left.length && offset < right.length && left[offset] === right[offset]) {
    offset += 1;
  }
  return offset;
}

/** The gate: every decision's user message, rebuilt from the replayed state, is byte-identical to the one sent. */
export async function replayGate(run: RecordedRun, options: WalkOptions & { onProgress?: (decisions: number) => void } = {}): Promise<GateResult> {
  const mismatches: GateMismatch[] = [];
  let identical = 0;
  const summary = await walkRun(run, ({ key, deal, half, position, input, trace }) => {
    const rebuilt = prepareDecision(input, trace.prompt ?? 'v0').userMessage;
    if (rebuilt === trace.userMessage) {
      identical += 1;
    } else {
      const offset = firstDifference(rebuilt, trace.userMessage);
      mismatches.push({ key, deal, half, position, offset, recorded: trace.userMessage.slice(Math.max(0, offset - 40), offset + 60), rebuilt: rebuilt.slice(Math.max(0, offset - 40), offset + 60) });
    }
    if ((identical + mismatches.length) % 250 === 0) {
      options.onProgress?.(identical + mismatches.length);
    }
  }, options);
  return { ...summary, identical, mismatches };
}

export function formatGate(run: RecordedRun, result: GateResult): string {
  const lines = [`Run ${run.id}: ${result.pairs} pairs replayed, ${result.decisions} decisions, ${result.identical} user messages byte-identical, ${result.mismatches.length} different, ${result.problems.length} game-state problems`];
  for (const mismatch of result.mismatches.slice(0, 5)) {
    lines.push(`  ${mismatch.key} deal ${mismatch.deal} half ${mismatch.half} #${mismatch.position}: differs at character ${mismatch.offset}`, `    recorded ${JSON.stringify(mismatch.recorded)}`, `    rebuilt  ${JSON.stringify(mismatch.rebuilt)}`);
  }
  for (const problem of result.problems.slice(0, 5)) {
    lines.push(`  ${problem}`);
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const ids = process.argv.slice(2).filter((argument) => !argument.startsWith('--'));
  if (ids.length === 0) {
    throw new Error('usage: eval:llm-hu-replay <run id or run directory>...   (replays each finished run and checks every user message byte for byte)');
  }
  let failed = false;
  for (const id of ids) {
    const run = id.includes('/') ? loadRun(basename(id), id) : loadRun(id);
    const started = performance.now();
    const result = await replayGate(run, { onProgress: (decisions) => console.log(`  ${decisions} decisions checked`) });
    console.log(formatGate(run, result), `\n  ${((performance.now() - started) / 1000).toFixed(0)} s`);
    failed ||= result.mismatches.length > 0 || result.problems.length > 0;
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
