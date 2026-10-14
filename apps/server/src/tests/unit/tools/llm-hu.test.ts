import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { RunFn, RunResult } from '../../../tools/claude-cli.ts';
import {
  cliSystemPrompt,
  createCliPolicy,
  FALLBACK_LIMIT,
  RunControl,
  StopRun,
} from '../../../tools/llm-cli-policy.ts';
import { budgetLines, parseConfig, runEval, type Checkpoint, type EvalDeps, type RunConfig } from '../../../tools/llm-hu.ts';
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
  promptSha256: cliSystemPrompt().sha256,
};

const depsFor = (dir: string, control: RunControl, run: RunFn): EvalDeps => ({
  dir,
  control,
  seed: 4242,
  cliPolicyOf: (row) => createCliPolicy({ row: { id: row.id, model: MODEL, effort: 'low' }, control, system: cliSystemPrompt(), claudeVersion: 'test', run }),
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
