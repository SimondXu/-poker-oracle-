import { randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { buildBotTurnInput } from '../game-loop/bot-view.ts';
import { seededBotSpots } from './bot-spots.ts';
import { assertCanary, preflight } from './claude-cli.ts';
import { playMatchAsync, ruleBotPolicy, runQueue, secretSeed, type AsyncPolicy, type MatchState } from './duplicate-hu-async.ts';
import { parsePolicyName, POLICIES, type PolicyName } from './eval-policies.ts';
import { mixSeed, mulberry32 } from './eval-utils.ts';
import {
  CLI_PROTO_PROMPT_VERSION,
  cliRowId,
  cliSystemPrompt,
  createCliPolicy,
  DEADLINE_MS,
  MAX_TURNS,
  RunControl,
  StopRun,
  type CliDecisionTrace,
  type ControlSnapshot,
} from './llm-cli-policy.ts';
import { buildReport, formatReport, loadDeals, percentiles, type DealLine, type Report, type RowMeta } from './llm-hu-report.ts';

/**
 * Duplicate heads-up matches for Claude models through `claude -p` (`llm-bots.md`, step L1), against
 * rule bots on the same deals as rule-bot baselines. Calls go to the subscription, so the run prints
 * its budget first, can pause after a pilot, and stops the whole run (checkpoint, nonzero exit, no
 * retry) on any stop rule.
 */
export interface RunConfig {
  runId: string;
  models: string[];
  effort: string;
  opponents: PolicyName[];
  baselines: PolicyName[];
  matches: number;
  dealsPerMatch: number;
  concurrency: number;
  /** Invocations per CLI row. */
  maxCalls: number;
  stackBb: number;
  bigBlind: number;
  claudeVersion: string | null;
  promptSha256: string;
}

export interface Checkpoint {
  config: RunConfig;
  /** Written only when the process stops, so it is off disk while the models are playing. */
  seed: number | null;
  status: 'running' | 'paused' | 'stopped' | 'done';
  stopReason: string | null;
  jobs: Record<string, MatchState>;
  control: ControlSnapshot;
}

export interface Row extends RowMeta {
  policy: PolicyName | null;
  model: string | null;
}

interface Job {
  key: string;
  row: Row;
  opponent: PolicyName;
  match: number;
}

export interface EvalDeps {
  dir: string;
  control: RunControl;
  /** The policy of a CLI row; the tests inject one that runs a fake `claude`. */
  cliPolicyOf: (row: Row) => AsyncPolicy<CliDecisionTrace>;
  /** Tests fix the seed; a real run draws it from the OS. */
  seed?: number;
  log?: (line: string) => void;
}

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const PILOT_SHARE = 0.1;
/** A's decisions per deal pair: about 750 per 100 deals against a station, 450 against TAG (`llm-bots.md`). */
const DECISIONS_PER_DEAL: Partial<Record<PolicyName, number>> = { station: 7.5, tag: 4.5 };
const OTHER_DECISIONS_PER_DEAL = 6;
const SECONDS_PER_DECISION = 8;

function rowsOf(config: RunConfig): Row[] {
  return [
    ...config.models.map((model): Row => ({ id: cliRowId(model, config.effort), kind: 'cli', policy: null, model })),
    ...config.baselines.map((policy): Row => ({ id: `rule/${policy}`, kind: 'rule', policy, model: null })),
  ];
}

export function budgetLines(config: RunConfig): string[] {
  const deals = config.matches * config.dealsPerMatch;
  const decisions = Math.round(deals * config.opponents.reduce((sum, opponent) => sum + (DECISIONS_PER_DEAL[opponent] ?? OTHER_DECISIONS_PER_DEAL), 0));
  const hours = (decisions * SECONDS_PER_DECISION) / config.concurrency / 3600;
  return [
    `Budget: ${config.models.length} CLI row(s) x ${config.opponents.join(', ')}, ${config.matches} matches x ${config.dealsPerMatch} deals = ${deals} deals per opponent`,
    `  per row about ${decisions} decisions = ${decisions} invocations (cap ${config.maxCalls}), about ${decisions * 2} model requests (2 turns each); at most ${config.concurrency} in flight`,
    `  about ${hours.toFixed(1)} h per row at ${SECONDS_PER_DECISION} s per decision (Haiku; assume 12-20 s for Sonnet)`,
    ...(decisions > config.maxCalls ? [`  WARNING: the estimate is over the cap of ${config.maxCalls}; the run will stop at the cap`] : []),
    `  baselines (rule bots, CPU only): ${config.baselines.join(', ') || 'none'}`,
  ];
}

const pilotDeals = (config: RunConfig) => Math.max(1, Math.ceil(config.dealsPerMatch * PILOT_SHARE));

/** Plays (or resumes) the matches. Returns when they are finished, the pilot is done, or a stop rule tripped. */
export async function runEval(
  config: RunConfig,
  deps: EvalDeps,
  options: { pilot?: boolean; resume?: Checkpoint },
): Promise<{ status: Checkpoint['status']; stopReason: string | null; report: Report }> {
  const log = deps.log ?? (() => undefined);
  const { control } = deps;
  const seed = options.resume?.seed ?? deps.seed ?? secretSeed();
  mkdirSync(deps.dir, { recursive: true });
  const dealsPath = `${deps.dir}/deals.jsonl`;
  const checkpointPath = `${deps.dir}/checkpoint.json`;
  appendFileSync(dealsPath, '');

  const rows = rowsOf(config);
  const system = cliSystemPrompt();
  const policyOf = (row: Row): AsyncPolicy<CliDecisionTrace> => (row.kind === 'cli' ? deps.cliPolicyOf(row) : ruleBotPolicy(POLICIES[row.policy!]));
  const jobs: Job[] = [...rows].sort((left, right) => Number(left.kind === 'rule') - Number(right.kind === 'rule')).flatMap((row) =>
    config.opponents.flatMap((opponent) => Array.from({ length: config.matches }, (_, match): Job => ({ key: `${row.id}|${opponent}|${match}`, row, opponent, match }))),
  );
  const states: Record<string, MatchState> = options.resume?.jobs ?? {};
  jobs.forEach((job) => (states[job.key] ??= { nextDeal: 0, playerStats: [] }));
  const until = options.pilot && !options.resume ? Math.min(pilotDeals(config), config.dealsPerMatch) : config.dealsPerMatch;

  const writeCheckpoint = (status: Checkpoint['status'], stopReason: string | null) => {
    const checkpoint: Checkpoint = {
      config,
      seed: status === 'running' ? null : seed,
      status,
      stopReason,
      jobs: states,
      control: control.snapshot(),
    };
    writeFileSync(`${checkpointPath}.tmp`, JSON.stringify(checkpoint));
    renameSync(`${checkpointPath}.tmp`, checkpointPath);
  };

  log(`Run ${config.runId}: ${jobs.length} matches, up to ${until} deals each${until < config.dealsPerMatch ? ' (pilot)' : ''}; prompt ${CLI_PROTO_PROMPT_VERSION} sha256 ${system.sha256.slice(0, 12)}`);
  let failure: unknown = null;
  try {
    await runQueue(jobs, config.concurrency, async (job) => {
      const run = { seed: mixSeed(seed, job.match), a: policyOf(job.row), b: ruleBotPolicy(POLICIES[job.opponent]), stackBb: config.stackBb, bigBlind: config.bigBlind };
      await playMatchAsync(run, states[job.key]!, until, (record, next) => {
        const line: DealLine = {
          key: job.key,
          row: job.row.id,
          opponent: job.opponent,
          match: job.match,
          deal: record.deal,
          aBb: record.aBb,
          aStats: record.aStats,
          traces: record.traces,
        };
        appendFileSync(dealsPath, `${JSON.stringify(line)}\n`);
        states[job.key] = next;
        writeCheckpoint('running', null);
        if (control.stopReason) {
          throw new StopRun(control.stopReason);
        }
      });
    });
  } catch (error) {
    failure = error;
  }

  const stopReason = control.stopReason ?? (failure instanceof Error ? `crash: ${failure.message}` : null);
  const status: Checkpoint['status'] = stopReason ? 'stopped' : until < config.dealsPerMatch ? 'paused' : 'done';
  writeCheckpoint(status, stopReason);
  const report = buildReport(loadDeals(dealsPath), rows, config.opponents, {
    runId: config.runId,
    seed: status === 'done' ? seed : null,
    status,
    claudeVersion: config.claudeVersion,
    promptVersion: CLI_PROTO_PROMPT_VERSION,
    promptSha256: system.sha256,
    effort: config.effort,
  });
  if (status === 'done') {
    writeFileSync(`${deps.dir}/results.json`, `${JSON.stringify(report, null, 1)}\n`);
  }
  if (failure && !(failure instanceof StopRun)) {
    throw failure;
  }
  return { status, stopReason, report };
}

// ---- smoke

/** Ten fixed spots, each played twice per CLI row: validity, latency, the turns seen, and the model's own noise. */
export async function runSmoke(config: RunConfig, deps: EvalDeps): Promise<string[]> {
  mkdirSync(deps.dir, { recursive: true });
  const spots = seededBotSpots(10, 'llm-hu-smoke').map(({ room, botId }) => buildBotTurnInput(room, botId)!);
  const out: string[] = [];
  for (const row of rowsOf(config).filter((candidate) => candidate.kind === 'cli')) {
    const policy = deps.cliPolicyOf(row);
    const traces: Array<{ spot: number; trace: CliDecisionTrace }> = [];
    const work = spots.flatMap((input, spot) => [0, 1].map((rep) => ({ input, spot, rep })));
    try {
      await runQueue(work, config.concurrency, async ({ input, spot }) => {
        const { trace } = await policy(input, { rng: mulberry32(spot + 1), seat: 0, half: 1 });
        traces.push({ spot, trace: trace! });
        appendFileSync(`${deps.dir}/smoke.jsonl`, `${JSON.stringify({ row: row.id, spot, trace })}\n`);
      });
    } catch (error) {
      if (!(error instanceof StopRun)) {
        throw error;
      }
    }
    const all = traces.map((entry) => entry.trace);
    const valid = all.filter((trace) => trace.validation?.ok).length;
    const bySpot = new Map<number, string[]>();
    traces.forEach(({ spot, trace }) => bySpot.set(spot, [...(bySpot.get(spot) ?? []), trace.decision.choice ?? '-']));
    const pairs = [...bySpot.values()].filter((choices) => choices.length === 2);
    const wall = percentiles(all.map((trace) => trace.call.wallMs));
    const turns = Math.max(0, ...all.map((trace) => trace.call.meta?.numTurns ?? 0));
    const validity = all.length === 0 ? 0 : valid / all.length;
    out.push(
      `${row.id}: ${all.length} calls · choice validity ${(validity * 100).toFixed(1)}% (gate 98%) ${validity >= 0.98 ? 'PASS' : 'FAIL'}`,
      `  wall p50 ${(wall.p50 / 1000).toFixed(1)} s · p95 ${(wall.p95 / 1000).toFixed(1)} s ${wall.p95 < DEADLINE_MS ? 'PASS' : 'FAIL'} (deadline ${DEADLINE_MS / 1000} s) · max ${(wall.max / 1000).toFixed(1)} s`,
      `  max turns seen ${turns} (run stops above ${MAX_TURNS}) · models ${[...new Set(all.flatMap((trace) => trace.call.meta?.models ?? []))].join(', ') || 'n/a'}`,
      `  self-agreement ${pairs.filter(([first, second]) => first === second).length}/${pairs.length} spots chose the same letter twice · fallbacks ${all.filter((trace) => trace.decision.source === 'fallback').length}`,
    );
  }
  if (deps.control.stopReason) {
    out.push(`STOPPED: ${deps.control.stopReason}`);
  }
  return out;
}

// ---- command line

function ints(value: string | undefined, fallback: number, name: string, max = Infinity): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`--${name} must be an integer from 1 to ${max}`);
  }
  return parsed;
}

const list = (value: string | undefined, fallback: string) => (value ?? fallback).split(',').map((item) => item.trim()).filter(Boolean);

export function parseConfig(argv: string[]): { config: RunConfig; smoke: boolean; pilot: boolean; resume: string | undefined } {
  const { values } = parseArgs({
    args: argv,
    options: {
      smoke: { type: 'boolean' },
      pilot: { type: 'boolean' },
      resume: { type: 'string' },
      models: { type: 'string' },
      effort: { type: 'string' },
      opponents: { type: 'string' },
      baselines: { type: 'string' },
      matches: { type: 'string' },
      'deals-per-match': { type: 'string' },
      concurrency: { type: 'string' },
      'max-calls': { type: 'string' },
    },
  });
  const models = list(values.models, 'claude-haiku-5-5');
  const bad = models.find((model) => !/^claude-[a-z0-9-]+$/.test(model));
  if (bad) {
    throw new Error(`--models takes full model ids such as claude-haiku-5-5, not "${bad}"`);
  }
  const effort = values.effort ?? 'low';
  if (!EFFORTS.includes(effort)) {
    throw new Error(`--effort must be one of ${EFFORTS.join(', ')}`);
  }
  return {
    smoke: values.smoke ?? false,
    pilot: values.pilot ?? false,
    resume: values.resume,
    config: {
      runId: `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}`,
      models,
      effort,
      opponents: list(values.opponents, 'station,tag').map(parsePolicyName),
      baselines: list(values.baselines, 'fish,tag,lag').map(parsePolicyName),
      matches: ints(values.matches, 4, 'matches'),
      dealsPerMatch: ints(values['deals-per-match'], 25, 'deals-per-match'),
      concurrency: ints(values.concurrency, 3, 'concurrency', 3),
      maxCalls: ints(values['max-calls'], 1350, 'max-calls'),
      stackBb: 100,
      bigBlind: 20,
      claudeVersion: null,
      promptSha256: cliSystemPrompt().sha256,
    },
  };
}

const EVAL_DIR = fileURLToPath(new URL('../../.eval/llm-hu/', import.meta.url));

async function main(): Promise<void> {
  const parsed = parseConfig(process.argv.slice(2));
  let { config } = parsed;
  let resume: Checkpoint | undefined;
  if (parsed.resume) {
    const path = `${EVAL_DIR}${parsed.resume}/checkpoint.json`;
    if (!existsSync(path)) {
      throw new Error(`No checkpoint for run ${parsed.resume}`);
    }
    resume = JSON.parse(readFileSync(path, 'utf8')) as Checkpoint;
    if (resume.seed === null || resume.status === 'done') {
      throw new Error(resume.status === 'done' ? `Run ${parsed.resume} is finished` : `Run ${parsed.resume} stopped without writing its seed (a crash), so its deals cannot be replayed`);
    }
    // The cap and the concurrency may change on a resume; nothing else may.
    const argv = process.argv.slice(2);
    config = { ...resume.config, maxCalls: argv.includes('--max-calls') ? parsed.config.maxCalls : resume.config.maxCalls, concurrency: argv.includes('--concurrency') ? parsed.config.concurrency : resume.config.concurrency };
  }

  const cliRows = config.models.length > 0;
  if (cliRows) {
    const { version, subscriptionType } = preflight();
    assertCanary(version);
    if (resume && resume.config.claudeVersion !== null && resume.config.claudeVersion !== version) {
      throw new Error(`Run ${config.runId} started on ${resume.config.claudeVersion}, claude is now ${version}`);
    }
    config = { ...config, claudeVersion: version };
    console.log(`claude ${version}, subscription ${subscriptionType ?? 'unknown'}, canary valid for this version and flag set`);
  }

  const dir = `${EVAL_DIR}${parsed.smoke ? `smoke-${config.runId}` : config.runId}`;
  const control = new RunControl(config.maxCalls);
  if (resume) {
    control.restore(resume.control);
  }
  process.once('SIGINT', () => control.stop('interrupted'));
  const system = cliSystemPrompt();
  const deps: EvalDeps = {
    dir,
    control,
    log: console.log,
    cliPolicyOf: (row) => createCliPolicy({ row: { id: row.id, model: row.model!, effort: config.effort }, control, system, claudeVersion: config.claudeVersion ?? 'unknown' }),
  };

  console.log(budgetLines(config).join('\n'));
  if (parsed.smoke) {
    console.log((await runSmoke(config, deps)).join('\n'));
    process.exitCode = control.stopReason ? 1 : 0;
    return;
  }

  const result = await runEval(config, deps, { pilot: parsed.pilot, ...(resume ? { resume } : {}) });
  console.log(formatReport(result.report));
  const used = [...control.invocations].map(([row, calls]) => `${row}: ${calls}`).join(', ');
  console.log(`\nInvocations so far: ${used || 'none'}. Output: ${dir}`);
  if (result.status === 'paused') {
    console.log(`Pilot done. Check the plan's usage, then continue with: pnpm --filter @aipoker/server eval:llm-hu --resume ${config.runId}`);
  } else if (result.status === 'stopped') {
    console.error(`STOPPED: ${result.stopReason}\nThe checkpoint is saved. Resume only after the cause is fixed (or the plan's window resets): --resume ${config.runId}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
