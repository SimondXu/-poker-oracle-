import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { RunFn, RunResult } from '../../../tools/claude-cli.ts';
import { cliRowId, FALLBACK_LIMIT, RunControl, StopRun } from '../../../tools/llm-cli-policy.ts';
import { budgetLines, cliPolicyFor, parseConfig, runEval, systemPromptsOf, type Checkpoint, type EvalDeps, type RunConfig } from '../../../tools/llm-hu.ts';
import { loadDeals } from '../../../tools/llm-hu-report.ts';

const MODEL = 'claude-haiku-5-5';

const result = (stdout: string, extra: Partial<RunResult> = {}): RunResult => ({ stdout, stderr: '', exitCode: 0, timedOut: false, ms: 5, ...extra });

// A stand-in for `claude -p`: success output in the measured shape, with the answer a test chooses.
const success = (answer: unknown, model = MODEL) => result(JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  structured_output: answer,
  total_cost_usd: 0.01,
  duration_api_ms: 5,
  ttft_ms: 1,
  modelUsage: { [model]: { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 5 } },
  permission_denials: [],
}));
const answer = (choice: string) => ({ choice, talk: null, note: null });
const usageLimit = () => result(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: "You've hit your limit · resets 3pm" })); // synthetic

const CONFIG: RunConfig = {
  runId: 'test-run',
  models: [MODEL],
  effort: 'low',
  opponents: ['station'],
  baselines: ['tag'],
  matches: 2,
  dealsPerMatch: 4,
  concurrency: 2,
  maxCalls: 1350,
  stackBb: 100,
  bigBlind: 20,
  claudeVersion: 'test',
  prompts: ['v0'],
  personas: { v0: 'analyst', v1: 'exploiter' },
  snapshotPerPair: false,
  systemSha256: systemPromptsOf(['v0'], { v0: 'analyst' }),
};

const depsFor = (dir: string, control: RunControl, run: RunFn): EvalDeps => ({
  dir,
  control,
  seed: 4242,
  cliPolicyOf: (row) => cliPolicyFor(CONFIG, row, control, run),
});

function harness(run: RunFn, maxCalls = CONFIG.maxCalls) {
  const dir = mkdtempSync(join(tmpdir(), 'llm-hu-test-'));
  const control = new RunControl(maxCalls);
  return { dir, deps: depsFor(dir, control, run), cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** What a resume does: a fresh control restored from the checkpoint. */
function resumedDeps(dir: string, saved: Checkpoint, run: RunFn): EvalDeps {
  const control = new RunControl(CONFIG.maxCalls);
  control.restore(saved.control);
  return depsFor(dir, control, run);
}

const checkpoint = (dir: string) => JSON.parse(readFileSync(join(dir, 'checkpoint.json'), 'utf8')) as Checkpoint;
const results = (dir: string) => loadDeals(join(dir, 'deals.jsonl')).map((line) => `${line.key}#${line.deal}:${line.aBb}`).sort();

test('a run plays every match, reports every metric and reveals the seed only at the end', async () => {
  const { dir, deps, cleanup } = harness(async () => success(answer('A')));
  try {
    const { status, report } = await runEval(CONFIG, deps, {});
    assert.equal(status, 'done');
    assert.equal(report.meta.seed, 4242);
    assert.equal(checkpoint(dir).seed, 4242);
    const group = report.groups.find((candidate) => candidate.row.startsWith('cli-claude/'))!;
    assert.equal(group.deals, 8);
    assert.ok(group.cli!.decisions > 8);
    assert.equal(group.cli!.fallbackRate, 0);
    assert.equal(group.cli!.choiceValidity, 1);
    assert.equal(group.cli!.turns.max, 2);
    assert.deepEqual(group.cli!.models, [MODEL]);
    assert.equal(group.versus.tag !== null && group.versus.tag.n, 8);
    assert.equal(report.groups.find((candidate) => candidate.row === 'rule/tag')!.versus.tag, null);
    assert.equal(deps.control.invocations.get(group.row), group.cli!.decisions);
    assert.ok(readFileSync(join(dir, 'results.json'), 'utf8').includes('"seed": 4242'));
  } finally {
    cleanup();
  }
});

test('the seed is not on disk while the run is going', async () => {
  const seen: Array<number | null> = [];
  const h = harness(async () => {
    try {
      seen.push(checkpoint(h.dir).seed);
    } catch {
      // No checkpoint yet.
    }
    return success(answer('A'));
  });
  try {
    await runEval(CONFIG, h.deps, {});
    assert.ok(seen.length > 0);
    assert.ok(seen.every((seed) => seed === null));
  } finally {
    h.cleanup();
  }
});

test('a usage limit stops the whole run, keeps the finished pairs, and a resume gives the same deals as an uninterrupted run', async () => {
  const whole = harness(async () => success(answer('A')));
  let calls = 0;
  const limited = harness(async () => (++calls > 12 ? usageLimit() : success(answer('A'))));
  try {
    await runEval(CONFIG, whole.deps, {});

    const first = await runEval(CONFIG, limited.deps, {});
    assert.equal(first.status, 'stopped');
    assert.match(first.stopReason!, /usage_limit/);
    const saved = checkpoint(limited.dir);
    assert.equal(saved.status, 'stopped');
    assert.equal(typeof saved.seed, 'number');

    const resumed = await runEval(CONFIG, resumedDeps(limited.dir, saved, async () => success(answer('A'))), { resume: saved });
    assert.equal(resumed.status, 'done');
    assert.deepEqual(results(limited.dir), results(whole.dir));
  } finally {
    whole.cleanup();
    limited.cleanup();
  }
});

test('a pilot plays 10% of each match, pauses, and the resume finishes the same run', async () => {
  const whole = harness(async () => success(answer('A')));
  const piloted = harness(async () => success(answer('A')));
  try {
    const config = { ...CONFIG, dealsPerMatch: 10 };
    await runEval(config, whole.deps, {});
    const pilot = await runEval(config, piloted.deps, { pilot: true });
    assert.equal(pilot.status, 'paused');
    assert.equal(pilot.report.meta.seed, null);
    assert.ok(pilot.report.groups.every((group) => group.deals === 2));
    const saved = checkpoint(piloted.dir);
    const finished = await runEval(config, resumedDeps(piloted.dir, saved, async () => success(answer('A'))), { resume: saved });
    assert.equal(finished.status, 'done');
    assert.deepEqual(results(piloted.dir), results(whole.dir));
  } finally {
    whole.cleanup();
    piloted.cleanup();
  }
});

test('the invocation cap stops the run', async () => {
  const { deps, cleanup } = harness(async () => success(answer('A')), 5);
  try {
    const { status, stopReason } = await runEval(CONFIG, deps, {});
    assert.equal(status, 'stopped');
    assert.match(stopReason!, /invocation cap/);
  } finally {
    cleanup();
  }
});

test('an invalid letter plays TAG and the trace says why; a drifting model stops the run', async () => {
  const invalid = harness(async () => success(answer('Z')));
  const drift = harness(async () => success(answer('A'), 'claude-sonnet-5-5'));
  try {
    const { report } = await runEval({ ...CONFIG, matches: 1, dealsPerMatch: 2 }, invalid.deps, {});
    const cli = report.groups.find((group) => group.cli)!.cli!;
    assert.equal(cli.fallbackRate, 1);
    assert.equal(cli.contaminated, true);
    assert.deepEqual(Object.keys(cli.fallbackReasons), ['invalid_choice']);

    const stopped = await runEval(CONFIG, drift.deps, {});
    assert.equal(stopped.status, 'stopped');
    assert.match(stopped.stopReason!, /model_drift/);
  } finally {
    invalid.cleanup();
    drift.cleanup();
  }
});

test('stop rules: fallbacks over 2% after 100 decisions, and three unclassified errors in a row', () => {
  const fallbacks = new RunControl(1350);
  for (let decision = 0; decision < 99; decision += 1) {
    fallbacks.recordDecision('row', decision < 3);
  }
  assert.equal(fallbacks.stopReason, null);
  fallbacks.recordDecision('row', false);
  assert.match(fallbacks.stopReason ?? '', /fallbacks 3\/100/);
  assert.equal(FALLBACK_LIMIT, 0.02);
  assert.throws(() => fallbacks.beginCall('row'), StopRun);

  const errors = new RunControl(1350);
  const unclassified = { kind: 'bad_json' as const, detail: 'x' };
  errors.endCall('row', unclassified);
  errors.endCall('row', unclassified);
  errors.endCall('row', { kind: 'timeout', detail: 'x' });
  errors.endCall('row', unclassified);
  errors.endCall('row', unclassified);
  assert.equal(errors.stopReason, null);
  errors.endCall('row', unclassified);
  assert.match(errors.stopReason ?? '', /3 unclassified/);
});

test('the command line takes full model ids, caps concurrency at 3 and prints a budget', () => {
  const { config } = parseConfig(['--models', 'claude-haiku-5-5,claude-sonnet-5-5', '--matches', '2']);
  assert.deepEqual(config.models, ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  assert.equal(config.dealsPerMatch, 25);
  assert.throws(() => parseConfig(['--models', 'haiku']), /full model ids/);
  assert.throws(() => parseConfig(['--concurrency', '4']), /concurrency/);
  assert.match(budgetLines(parseConfig([]).config).join('\n'), /about 1200 decisions = 1200 invocations \(cap 1350\)/);
});

test('the command line takes prompt versions, a persona, snapshot mode and a spot file; row ids carry the prompt version', () => {
  const defaults = parseConfig([]);
  assert.deepEqual(defaults.config.prompts, ['v0']);
  assert.deepEqual(defaults.config.personas, { v0: 'analyst' });
  assert.equal(defaults.config.snapshotPerPair, false);
  assert.equal(defaults.spots, undefined);
  assert.equal(defaults.config.systemSha256.v0, 'f5a054b314bddb33a38ad3023e7e98c47cc954b05e89d41f3a4bdfbd4963b962');

  const given = parseConfig(['--prompts', 'v0', '--persona', 'bully', '--snapshot-per-pair', '--spots', 'x.json']);
  assert.deepEqual(given.config.personas, { v0: 'bully' });
  assert.equal(given.config.snapshotPerPair, true);
  assert.equal(given.spots, 'x.json');
  assert.notEqual(given.config.systemSha256.v0, defaults.config.systemSha256.v0);
  assert.throws(() => parseConfig(['--prompts', 'v9']), /--prompts takes distinct versions/);
  assert.throws(() => parseConfig(['--prompts', 'v0,v0']), /distinct/);
  assert.throws(() => parseConfig(['--persona', 'pirate']), /--persona/);
  assert.throws(() => parseConfig(['--persona', 'v9=bully']), /--persona/);

  // Each version plays its own persona unless told otherwise; a pair per version sets them apart.
  const both = parseConfig(['--prompts', 'v0,v1', '--snapshot-per-pair']).config;
  assert.deepEqual(both.personas, { v0: 'analyst', v1: 'exploiter' });
  assert.deepEqual(parseConfig(['--prompts', 'v0,v1', '--persona', 'v1=analyst']).config.personas, { v0: 'analyst', v1: 'analyst' });
  assert.deepEqual(parseConfig(['--prompts', 'v0,v1', '--persona', 'bully']).config.personas, { v0: 'bully', v1: 'bully' });
  assert.notEqual(both.systemSha256.v1, both.systemSha256.v0);

  assert.equal(cliRowId(MODEL, 'low', 'v0'), 'cli-claude/claude-haiku-5-5/low/v0');
  assert.equal(cliRowId(MODEL, 'low', 'v0', 'bully'), 'cli-claude/claude-haiku-5-5/low/v0+bully');
  assert.equal(cliRowId(MODEL, 'low', 'v1'), 'cli-claude/claude-haiku-5-5/low/v1');
  assert.equal(cliRowId(MODEL, 'low', 'v1', 'analyst'), 'cli-claude/claude-haiku-5-5/low/v1+analyst');
});

test('snapshot mode runs the same deals with real hand numbers; the default keeps HAND 0', async () => {
  const play = async (snapshotPerPair: boolean) => {
    const h = harness(async () => success(answer('A')));
    try {
      await runEval({ ...CONFIG, snapshotPerPair, matches: 1, dealsPerMatch: 3 }, h.deps, {});
      const lines = loadDeals(join(h.dir, 'deals.jsonl')).filter((line) => line.row.startsWith('cli-'));
      return {
        results: lines.map((line) => `${line.key}#${line.deal}`).sort(),
        hands: [...new Set(lines.flatMap((line) => line.traces.map((entry) => entry.trace.userMessage.split('\n')[0]!.split(' · ')[0]!)))].sort(),
        rows: [...new Set(lines.map((line) => line.row))],
      };
    } finally {
      h.cleanup();
    }
  };
  const snapshot = await play(true);
  const shared = await play(false);
  assert.deepEqual(snapshot.results, shared.results);
  assert.deepEqual(shared.hands, ['HAND 0']);
  assert.deepEqual(snapshot.hands, ['HAND 1', 'HAND 2', 'HAND 3', 'HAND 4', 'HAND 5', 'HAND 6']);
  assert.deepEqual(snapshot.rows, ['cli-claude/claude-haiku-5-5/low/v0']);
});
