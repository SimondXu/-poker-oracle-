import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { BotTurnInput } from '@aipoker/agent-engine';

import { playMatchAsync, ruleBotPolicy, runQueue, type AsyncPolicy } from './duplicate-hu-async.ts';
import { parsePolicyName, POLICIES, type PolicyName } from './eval-policies.ts';
import { mixSeed, mulberry32 } from './eval-utils.ts';
import { StopRun, type CliDecisionTrace } from './llm-cli-policy.ts';
import { decisionMetrics, formatPlay } from './llm-hu-report.ts';
import { loadRun, walkRun, type WalkedDecision } from './llm-hu-replay.ts';

/**
 * Spot replay (`bot-eval.md`, prompt v1 stage B): asks a prompt the questions an earlier run asked,
 * in the same game states, so two prompts are compared decision by decision without 100 deals of
 * card luck. A spot file names the decisions; the states are rebuilt by replaying the source.
 */
export interface SpotRef {
  /** The job key of a run source (`row|opponent|match`), or `sim/<a>|<b>|<match>` for a simulated one. */
  key: string;
  deal: number;
  half: 1 | 2;
  actionIndex: number;
  /** Which selector chose it. */
  tag: string;
}

export type SpotSource =
  /** `dir` names the run's directory when it is not under the eval directory. */
  | { kind: 'run'; run: string; dir?: string }
  /** Rule bot `a` plays the model's seat against `b` for `matches` x `dealsPerMatch` deals; the spots are `a`'s decisions. */
  | { kind: 'sim'; a: PolicyName; b: PolicyName; seed: number; matches: number; dealsPerMatch: number; stackBb: number; bigBlind: number; snapshotPerPair: boolean };

export interface SpotFile {
  version: 1;
  source: SpotSource;
  spots: SpotRef[];
}

export interface SpotInput {
  spot: SpotRef;
  opponent: PolicyName;
  input: BotTurnInput;
  /** What the run's model did there; null for a simulated source. */
  original: { choice: string | null; kind: string; source: 'llm' | 'fallback' } | null;
}

const sameSpot = (left: SpotRef, right: SpotRef) => left.key === right.key && left.deal === right.deal && left.half === right.half && left.actionIndex === right.actionIndex;
const spotId = (spot: SpotRef) => `${spot.key}#${spot.deal}.${spot.half}.${spot.actionIndex}`;

// ---- building

const facingBet = (trace: CliDecisionTrace) => trace.menu.some((option) => option.kind === 'fold');
const canCheck = (trace: CliDecisionTrace) => trace.menu.some((option) => option.kind === 'check');
const equityOf = (trace: CliDecisionTrace) => trace.advice.equity;

/** Selectors over a run's recorded decisions; equity is the brief's. */
export const RUN_SELECTORS: Record<string, (decision: WalkedDecision) => boolean> = {
  'river-value': ({ opponent, trace }) => opponent === 'station' && trace.phase === 'river' && canCheck(trace) && (equityOf(trace) ?? 0) > 0.5,
  'flop-turn-value': ({ opponent, trace }) => opponent === 'station' && (trace.phase === 'flop' || trace.phase === 'turn') && canCheck(trace) && (equityOf(trace) ?? 0) >= 0.62,
  'weak-vs-tag': ({ opponent, trace }) => opponent === 'tag' && trace.phase !== 'preflop' && canCheck(trace) && (equityOf(trace) ?? 1) < 0.35,
  'facing-vs-tag': ({ opponent, trace }) => opponent === 'tag' && trace.phase !== 'preflop' && facingBet(trace),
  'any': () => true,
};

/** Selectors over a simulated source, where the rule bot has no trace. */
export const SIM_SELECTORS: Record<string, (input: BotTurnInput) => boolean> = {
  postflop: (input) => input.context.phase !== 'preflop',
  'postflop-unbet': (input) => input.context.phase !== 'preflop' && input.context.canCheck,
  'postflop-facing': (input) => input.context.phase !== 'preflop' && input.context.callAmount > 0,
  any: () => true,
};

export function parseSelect(text: string): Array<{ name: string; count: number }> {
  return text.split(',').map((part) => {
    const [name, count] = part.split('=');
    if (!name || !count || !Number.isInteger(Number(count)) || Number(count) < 1) {
      throw new Error(`--select takes name=count pairs such as river-value=96, not "${part}"`);
    }
    return { name, count: Number(count) };
  });
}

/** Seeded Fisher-Yates over the candidates of one selector, skipping spots an earlier selector took. */
function pick<T>(candidates: readonly T[], count: number, seed: number): T[] {
  const rng = mulberry32(seed);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other]!, shuffled[index]!];
  }
  return shuffled.slice(0, count);
}

function choose(candidatesBySelector: Map<string, Array<Omit<SpotRef, 'tag'>>>, select: Array<{ name: string; count: number }>, seed: number, log: (line: string) => void): SpotRef[] {
  const taken = new Set<string>();
  const spots: SpotRef[] = [];
  for (const [index, { name, count }] of select.entries()) {
    const free = (candidatesBySelector.get(name) ?? []).filter((ref) => !taken.has(spotId({ ...ref, tag: name })));
    const chosen = pick(free, count, mixSeed(seed, index));
    if (chosen.length < count) {
      log(`  ${name}: only ${chosen.length} of the ${count} asked for exist`);
    }
    for (const ref of chosen) {
      taken.add(spotId({ ...ref, tag: name }));
      spots.push({ ...ref, tag: name });
    }
  }
  return spots.sort((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : left.deal - right.deal || left.half - right.half || left.actionIndex - right.actionIndex));
}

export async function buildSpotFile(source: SpotSource, select: Array<{ name: string; count: number }>, seed: number, log: (line: string) => void = () => undefined): Promise<SpotFile> {
  const candidates = new Map<string, Array<Omit<SpotRef, 'tag'>>>();
  const add = (name: string, ref: Omit<SpotRef, 'tag'>) => candidates.set(name, [...(candidates.get(name) ?? []), ref]);
  const unknown = select.find(({ name }) => !(source.kind === 'run' ? RUN_SELECTORS : SIM_SELECTORS)[name]);
  if (unknown) {
    throw new Error(`Unknown selector "${unknown.name}" for a ${source.kind} source; expected one of ${Object.keys(source.kind === 'run' ? RUN_SELECTORS : SIM_SELECTORS).join(', ')}`);
  }
  if (source.kind === 'run') {
    const summary = await walkRun(loadRun(source.run, source.dir), (decision) => {
      for (const { name } of select) {
        if (RUN_SELECTORS[name]!(decision)) {
          add(name, { key: decision.key, deal: decision.deal, half: decision.half, actionIndex: decision.input.actionIndex });
        }
      }
    });
    if (summary.problems.length > 0) {
      throw new Error(`Run ${source.run} did not replay cleanly: ${summary.problems[0]}`);
    }
  } else {
    await playSim(source, ({ key, deal, half, input }) => {
      for (const { name } of select) {
        if (SIM_SELECTORS[name]!(input)) {
          add(name, { key, deal, half, actionIndex: input.actionIndex });
        }
      }
    });
  }
  return { version: 1, source, spots: choose(candidates, select, seed, log) };
}

// ---- collecting inputs

/** Plays a simulated source: rule bot `a` in the model's seat, visiting each of its decisions. */
async function playSim(source: Extract<SpotSource, { kind: 'sim' }>, visit: (decision: { key: string; deal: number; half: 1 | 2; input: BotTurnInput }) => void, matches?: Map<string, number>): Promise<void> {
  for (let match = 0; match < source.matches; match += 1) {
    const key = `sim/${source.a}|${source.b}|${match}`;
    const until = matches ? (matches.get(key) ?? 0) : source.dealsPerMatch;
    if (until <= 0) {
      continue;
    }
    const at = { deal: 0 };
    const inner = ruleBotPolicy(POLICIES[source.a]);
    const a: AsyncPolicy = async (input, extra) => {
      visit({ key, deal: at.deal, half: extra.half, input });
      return inner(input, extra);
    };
    await playMatchAsync(
      { seed: mixSeed(source.seed, match), a, b: ruleBotPolicy(POLICIES[source.b]), stackBb: source.stackBb, bigBlind: source.bigBlind, snapshotPerPair: source.snapshotPerPair },
      { nextDeal: 0, playerStats: [] },
      until,
      () => void (at.deal += 1),
    );
  }
}

/** Rebuilds the input of every spot, in the file's order. */
export async function collectSpotInputs(file: SpotFile): Promise<SpotInput[]> {
  const found = new Map<string, SpotInput>();
  const wanted = new Map<string, number>();
  for (const spot of file.spots) {
    wanted.set(spot.key, Math.max(wanted.get(spot.key) ?? 0, spot.deal + 1));
  }
  const find = (key: string, deal: number, half: 1 | 2, actionIndex: number) => file.spots.find((spot) => sameSpot(spot, { key, deal, half, actionIndex, tag: '' }));

  if (file.source.kind === 'run') {
    const summary = await walkRun(loadRun(file.source.run, file.source.dir), ({ key, deal, half, opponent, input, trace }) => {
      const spot = find(key, deal, half, input.actionIndex);
      if (spot) {
        found.set(spotId(spot), { spot, opponent, input, original: { choice: trace.decision.choice, kind: trace.decision.kind, source: trace.decision.source } });
      }
    }, { dealsOf: (key) => wanted.get(key) ?? 0 });
    if (summary.problems.length > 0) {
      throw new Error(`Run ${file.source.run} did not replay cleanly: ${summary.problems[0]}`);
    }
  } else {
    const { b } = file.source;
    await playSim(file.source, ({ key, deal, half, input }) => {
      const spot = find(key, deal, half, input.actionIndex);
      if (spot) {
        found.set(spotId(spot), { spot, opponent: b, input, original: null });
      }
    }, wanted);
  }

  return file.spots.map((spot) => {
    const input = found.get(spotId(spot));
    if (!input) {
      throw new Error(`Spot ${spotId(spot)} did not come up again when the source was replayed`);
    }
    return input;
  });
}

export function loadSpotFile(path: string): SpotFile {
  const file = JSON.parse(readFileSync(path, 'utf8')) as SpotFile;
  if (file.version !== 1 || !Array.isArray(file.spots) || !file.source) {
    throw new Error(`${path} is not a spot file`);
  }
  return file;
}

// ---- running

export interface SpotLine {
  row: string;
  spot: SpotRef;
  opponent: PolicyName;
  original: SpotInput['original'];
  trace: CliDecisionTrace;
}

const loadLines = (path: string): SpotLine[] =>
  existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((text) => text.trim()).map((text) => JSON.parse(text) as SpotLine) : [];

/**
 * Asks every row every spot. Lines are appended as they finish, and a rerun in the same directory
 * skips the (row, spot) pairs already there, so a stopped run can continue.
 */
export async function runSpots(input: {
  dir: string;
  rows: Array<{ id: string; policy: AsyncPolicy<CliDecisionTrace> }>;
  spots: SpotInput[];
  concurrency: number;
  log?: (line: string) => void;
}): Promise<SpotLine[]> {
  mkdirSync(input.dir, { recursive: true });
  const path = `${input.dir}/spots.jsonl`;
  const done = new Set(loadLines(path).map((line) => `${line.row}|${spotId(line.spot)}`));
  const work = input.rows.flatMap((row) => input.spots.map((spot, index) => ({ row, spot, index }))).filter(({ row, spot }) => !done.has(`${row.id}|${spotId(spot.spot)}`));
  input.log?.(`${work.length} calls to make (${done.size} already done)`);
  let failure: unknown = null;
  try {
    await runQueue(work, input.concurrency, async ({ row, spot, index }) => {
      const half = spot.spot.half;
      const { trace } = await row.policy(spot.input, { rng: mulberry32(index + 1), seat: half === 1 ? 0 : 1, half });
      const line: SpotLine = { row: row.id, spot: spot.spot, opponent: spot.opponent, original: spot.original, trace: trace! };
      appendFileSync(path, `${JSON.stringify(line)}\n`);
    });
  } catch (error) {
    failure = error;
  }
  if (failure && !(failure instanceof StopRun)) {
    throw failure;
  }
  return loadLines(path);
}

const pct = (part: number, whole: number) => (whole === 0 ? '-' : `${((part / whole) * 100).toFixed(0)}% (${part}/${whole})`);

/** Per row: validity, the metrics of `llm-hu-report.ts`, and per selector what it chose against what the source did. */
export function formatSpotSummary(lines: readonly SpotLine[]): string[] {
  const out: string[] = [];
  for (const row of [...new Set(lines.map((line) => line.row))]) {
    const own = lines.filter((line) => line.row === row);
    const traces = own.map((line) => line.trace);
    out.push('', `${row}: ${own.length} spots · choice validity ${pct(traces.filter((trace) => trace.validation?.ok).length, traces.length)} · fallbacks ${traces.filter((trace) => trace.decision.source === 'fallback').length}`);
    out.push(...formatPlay(decisionMetrics(traces)));
    for (const tag of [...new Set(own.map((line) => line.spot.tag))]) {
      const group = own.filter((line) => line.spot.tag === tag);
      const kinds = new Map<string, number>();
      group.forEach((line) => kinds.set(line.trace.decision.kind, (kinds.get(line.trace.decision.kind) ?? 0) + 1));
      const withOriginal = group.filter((line) => line.original);
      out.push(`  ${tag}: ${group.length} · chose ${[...kinds].map(([kind, count]) => `${kind} ${count}`).join(', ')}${withOriginal.length > 0 ? ` · same kind as the source run ${pct(withOriginal.filter((line) => line.original!.kind === line.trace.decision.kind).length, withOriginal.length)}` : ''}`);
    }
  }
  return out;
}

// ---- command line: eval:llm-hu-spots

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      run: { type: 'string' },
      sim: { type: 'string' },
      select: { type: 'string' },
      seed: { type: 'string' },
      'sim-seed': { type: 'string' },
      matches: { type: 'string' },
      'deals-per-match': { type: 'string' },
      out: { type: 'string' },
    },
  });
  if (!values.select || !values.out || (!values.run && !values.sim)) {
    throw new Error('usage: eval:llm-hu-spots (--run <run id> | --sim <a>,<b> --sim-seed <n> [--matches 4] [--deals-per-match 25]) --select name=count,... --out <file> [--seed <n>]');
  }
  let source: SpotSource;
  if (values.run) {
    source = { kind: 'run', run: values.run };
  } else {
    const [a, b] = values.sim!.split(',');
    source = {
      kind: 'sim',
      a: parsePolicyName(a),
      b: parsePolicyName(b),
      seed: Number(values['sim-seed'] ?? 20261014),
      matches: Number(values.matches ?? 4),
      dealsPerMatch: Number(values['deals-per-match'] ?? 25),
      stackBb: 100,
      bigBlind: 20,
      snapshotPerPair: true,
    };
  }
  const file = await buildSpotFile(source, parseSelect(values.select), Number(values.seed ?? 1), console.log);
  writeFileSync(values.out, `${JSON.stringify(file, null, 1)}\n`);
  const counts = new Map<string, number>();
  file.spots.forEach((spot) => counts.set(spot.tag, (counts.get(spot.tag) ?? 0) + 1));
  console.log(`Wrote ${file.spots.length} spots to ${values.out}: ${[...counts].map(([tag, count]) => `${tag} ${count}`).join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
