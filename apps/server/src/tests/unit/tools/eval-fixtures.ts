import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RunFn, RunResult } from '../../../tools/claude-cli.ts';
import { RunControl } from '../../../tools/llm-cli-policy.ts';
import { cliPolicyFor, runEval, systemPromptsOf, type EvalDeps, type RunConfig } from '../../../tools/llm-hu.ts';

/** Fixtures for tests that need a finished run on disk without calling a model. */
export const MODEL = 'claude-haiku-5-5';

export const CONFIG: RunConfig = {
  runId: 'replay-test',
  models: [MODEL],
  effort: 'low',
  opponents: ['station', 'tag'],
  baselines: [],
  matches: 2,
  dealsPerMatch: 5,
  concurrency: 2,
  maxCalls: 1350,
  stackBb: 100,
  bigBlind: 20,
  claudeVersion: 'test',
  prompts: ['v0'],
  persona: 'analyst',
  snapshotPerPair: false,
  systemSha256: systemPromptsOf(['v0'], 'analyst'),
};

/** A stand-in for `claude -p` that answers with a letter chosen from what it was sent, so the run takes varied actions. */
export function fakeClaude(): RunFn {
  let calls = 0;
  return async (_args, options): Promise<RunResult> => {
    calls += 1;
    const menu = [...options.stdin.matchAll(/^([A-H]) {2}(\S+)/gm)].map((match) => match[1]!);
    const choice = menu[calls % menu.length] ?? 'A';
    return {
      stdout: JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        num_turns: 2,
        structured_output: { choice, talk: null, note: null },
        total_cost_usd: 0,
        duration_api_ms: 1,
        ttft_ms: 1,
        modelUsage: { [MODEL]: { inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 0 } },
        permission_denials: [],
      }),
      stderr: '',
      exitCode: 0,
      timedOut: false,
      ms: 1,
    };
  };
}

export async function finishedRun(config: RunConfig) {
  const dir = mkdtempSync(join(tmpdir(), 'llm-hu-replay-'));
  const control = new RunControl(config.maxCalls);
  const run = fakeClaude();
  const deps: EvalDeps = { dir, control, seed: 31337, cliPolicyOf: (row) => cliPolicyFor(config, row, control, run) };
  const result = await runEval(config, deps, {});
  assert.equal(result.status, 'done');
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

