import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildClaudeArgs,
  childEnv,
  CLAUDE_ISOLATION_ARGS,
  flagsSha,
  forbiddenEnvNames,
  parseClaudeOutput,
  runClaude,
} from '../../../tools/claude-cli.ts';

const EXPECT = { model: 'claude-haiku-5-5', maxTurns: 2 };

// Shape measured on Claude Code 2.1.296 (`--output-format json --json-schema`); the numbers are illustrative.
const SUCCESS = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  api_error_status: null,
  duration_ms: 7600,
  duration_api_ms: 7400,
  ttft_ms: 1100,
  num_turns: 2,
  result: '',
  structured_output: { choice: 'B', talk: null, note: null },
  stop_reason: 'end_turn',
  terminal_reason: 'completed',
  session_id: '00000000-0000-4000-8000-000000000000',
  total_cost_usd: 0.0123,
  usage: { input_tokens: 10, output_tokens: 20 },
  modelUsage: {
    'claude-haiku-5-5': {
      inputTokens: 2400,
      outputTokens: 1214,
      cacheReadInputTokens: 800,
      cacheCreationInputTokens: 100,
      thinkingTokens: 856,
      costUSD: 0.0123,
      canonicalModel: 'claude-haiku-5-5',
    },
  },
  permission_denials: [],
  uuid: '00000000-0000-4000-8000-000000000001',
};

const parse = (value: unknown, exitCode: number | null = 0, timedOut = false) =>
  parseClaudeOutput(typeof value === 'string' ? value : JSON.stringify(value), exitCode, timedOut, EXPECT);

test('a success carries the structured answer, the turns, the model and the token counts', () => {
  const outcome = parse(SUCCESS);
  assert.equal(outcome.kind, 'ok');
  if (outcome.kind !== 'ok') {
    return;
  }
  assert.deepEqual(outcome.structured, { choice: 'B', talk: null, note: null });
  assert.equal(outcome.meta.numTurns, 2);
  assert.deepEqual(outcome.meta.models, ['claude-haiku-5-5']);
  assert.deepEqual(outcome.meta.usage, { input: 2400, output: 1214, cacheRead: 800, cacheCreation: 100, thinking: 856 });
  assert.equal(outcome.meta.durationApiMs, 7400);
  assert.equal(outcome.meta.ttftMs, 1100);
  assert.equal(outcome.meta.notionalUsd, 0.0123);
  assert.equal(outcome.meta.permissionDenials, 0);
});

// The error fixtures below are synthetic: hand-written to the success shape, not recorded from a failing run.

test('synthetic: a usage limit, an auth error and a rate limit are told apart', () => {
  const error = (result: string, status: number | null) => ({ ...SUCCESS, is_error: true, api_error_status: status, result, structured_output: undefined });
  assert.equal(parse(error("You've hit your limit · resets 3pm", 429)).kind, 'usage_limit');
  assert.equal(parse(error('Claude AI usage limit reached|1760000000', null)).kind, 'usage_limit');
  assert.equal(parse(error('Invalid authentication credentials · Please run /login', 401)).kind, 'auth');
  assert.equal(parse(error('forbidden', 403)).kind, 'auth');
  assert.equal(parse(error('Too many requests', 429)).kind, 'rate_limit');
  assert.equal(parse(error('something odd', 500)).kind, 'error');
});

test('synthetic: a plain-text login error is an auth error, other text is bad JSON', () => {
  assert.equal(parse('Not logged in · Please run /login', 1).kind, 'auth');
  assert.equal(parse('<html>502</html>', 1).kind, 'bad_json');
  assert.equal(parse('', 0).kind, 'bad_json');
});

test('synthetic: a timeout and a failure to start win over whatever was printed', () => {
  assert.equal(parse('', null, true).kind, 'timeout');
  assert.equal(parse(SUCCESS, 143, true).kind, 'timeout');
  assert.equal(parse('', null, false).kind, 'spawn_error');
});

test('synthetic: a success without a structured object is bad JSON', () => {
  assert.equal(parse({ ...SUCCESS, structured_output: undefined, result: '{"choice":"B"}' }).kind, 'bad_json');
  assert.equal(parse({ ...SUCCESS, structured_output: 'B' }).kind, 'bad_json');
});

test('synthetic: another model, a permission denial or too many turns is a violation', () => {
  const drift = parse({
    ...SUCCESS,
    modelUsage: { ...SUCCESS.modelUsage, 'claude-sonnet-5-5': { inputTokens: 5 } },
  });
  assert.deepEqual([drift.kind, drift.kind === 'violation' ? drift.reason : null], ['violation', 'model_drift']);

  const denied = parse({ ...SUCCESS, permission_denials: [{ tool_name: 'Read' }] });
  assert.deepEqual([denied.kind, denied.kind === 'violation' ? denied.reason : null], ['violation', 'permission_denied']);

  const turns = parse({ ...SUCCESS, num_turns: 3 });
  assert.deepEqual([turns.kind, turns.kind === 'violation' ? turns.reason : null], ['violation', 'too_many_turns']);

  // Without an expectation the parser only reports.
  assert.equal(parseClaudeOutput(JSON.stringify({ ...SUCCESS, num_turns: 9 }), 0, false).kind, 'ok');
});

test('the arguments isolate the child and never bill the API or switch models', () => {
  const args = buildClaudeArgs({ model: 'claude-haiku-5-5', effort: 'low', systemPrompt: 'SYSTEM', schema: { type: 'object' } });
  assert.deepEqual(args.slice(-CLAUDE_ISOLATION_ARGS.length), [...CLAUDE_ISOLATION_ARGS]);
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.equal(args[args.indexOf('--setting-sources') + 1], '');
  assert.equal(args[args.indexOf('--model') + 1], 'claude-haiku-5-5');
  assert.equal(args[args.indexOf('--effort') + 1], 'low');
  assert.equal(args[args.indexOf('--system-prompt') + 1], 'SYSTEM');
  assert.equal(args[args.indexOf('--output-format') + 1], 'json');
  assert.equal(args[args.indexOf('--json-schema') + 1], '{"type":"object"}');
  assert.ok(!args.includes('--bare') && !args.includes('--fallback-model'));
  assert.match(flagsSha(), /^[0-9a-f]{64}$/);
});

test('the child environment is an allow-list and the forbidden variables are caught by presence', () => {
  const source = { PATH: '/bin', HOME: '/h', ANTHROPIC_API_KEY: 'sk-x', CLAUDE_CODE_USE_BEDROCK: '1', CANARY: 'secret', LANG: 'C' };
  assert.deepEqual(childEnv(source), { PATH: '/bin', HOME: '/h', LANG: 'C' });
  assert.deepEqual(forbiddenEnvNames(source), ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_USE_BEDROCK']);
  assert.deepEqual(forbiddenEnvNames({ PATH: '/bin' }), []);
});

test('runClaude starts no shell, keeps empty arguments and kills the group at the deadline', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-cli-test-'));
  // A stand-in `claude` on PATH: prints its argument count, or hangs when told to.
  const script = join(dir, 'claude');
  writeFileSync(script, '#!/bin/sh\nif [ "$1" = "hang" ]; then sleep 30; fi\ncat >/dev/null\necho "$#"\n');
  chmodSync(script, 0o755);
  try {
    const env = { PATH: `${dir}:${process.env.PATH ?? ''}` };
    const ok = await runClaude(['a', '', 'b'], { cwd: dir, env, stdin: 'hello', deadlineMs: 5_000 });
    assert.equal(ok.stdout.trim(), '3');
    assert.equal(ok.exitCode, 0);
    assert.equal(ok.timedOut, false);

    const slow = await runClaude(['hang'], { cwd: dir, env, stdin: '', deadlineMs: 200 });
    assert.equal(slow.timedOut, true);
    assert.ok(slow.ms < 5_000);

    const missing = await runClaude([], { cwd: dir, env: { PATH: '/nonexistent' }, stdin: '', deadlineMs: 1_000 });
    assert.equal(missing.exitCode, null);
    assert.equal(parseClaudeOutput(missing.stdout, missing.exitCode, missing.timedOut).kind, 'spawn_error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
