import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import test from 'node:test';

import type { CliAgentModel } from '@aipoker/shared';
import { chooseBotAction } from '@aipoker/strategy-engine';

import { buildBotTurnInput } from '../../../game-loop/bot-view.ts';
import { createCliBotRuntime, DISABLED_CLI_BOTS, startCliBots } from '../../../game-loop/cli-bot-runtime.ts';
import { botActionToDecision } from '../../../game-loop/llm-agent-runtime.ts';
import { CHILD_ENV_KEYS, type RunClaudeOptions, type RunFn, type RunResult } from '../../../tools/claude-cli.ts';
import { seededBotSpots, seededFinishedHands, type BotSpot } from '../../../tools/bot-spots.ts';
import { cliSystemPrompt, prepareDecision } from '../../../tools/llm-cli-policy.ts';
import { permuteHidden } from './hidden-permutation.ts';

const HAIKU: CliAgentModel = 'claude-cli:claude-haiku-5-5';
const SONNET: CliAgentModel = 'claude-cli:claude-sonnet-5-5';

const result = (stdout: string, extra: Partial<RunResult> = {}): RunResult => ({ stdout, stderr: '', exitCode: 0, timedOut: false, ms: 5, ...extra });
const success = (answer: unknown, model = 'claude-haiku-5-5') => result(JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  num_turns: 2,
  structured_output: answer,
  modelUsage: { [model]: { inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, thinkingTokens: 5 } },
  permission_denials: [],
}));
const answer = (choice: string) => ({ choice, talk: null, note: null });
const usageLimit = () => result(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: "You've hit your limit · resets 3pm" }));

interface Call {
  args: string[];
  options: RunClaudeOptions;
  cwdEmpty: boolean;
}

function fakeClaude(respond: (call: Call) => RunResult | Promise<RunResult>) {
  const calls: Call[] = [];
  const run: RunFn = async (args, options) => {
    const call = { args, options, cwdEmpty: existsSync(options.cwd) && readdirSync(options.cwd).length === 0 };
    calls.push(call);
    return respond(call);
  };
  return { run, calls };
}

const quiet = () => undefined;
const runtimeWith = (run: RunFn, extra: { maxConcurrent?: number; rng?: () => number } = {}) =>
  createCliBotRuntime({ timeoutMs: 30_000, run, log: quiet, ...extra });

const SPOTS = seededBotSpots(60, 'cli-bot-runtime').filter((spot) => buildBotTurnInput(spot.room, spot.botId)!.context.phase !== 'preflop').slice(0, 6);

function decideAt(runtime: ReturnType<typeof createCliBotRuntime>, spot: BotSpot, model: CliAgentModel = HAIKU, signal?: AbortSignal) {
  const turn = buildBotTurnInput(spot.room, spot.botId, undefined, spot.ledger)!;
  return runtime.decide({ room: spot.room, botId: spot.botId, model, context: turn.context, ...(signal ? { signal } : {}) });
}

test('a Claude Code bot plays the letter the model chose, through one isolated call with the table prompt', async () => {
  const spot = SPOTS[0]!;
  const { run, calls } = fakeClaude(() => success(answer('A')));
  const decision = await decideAt(runtimeWith(run), spot);

  const turn = buildBotTurnInput(spot.room, spot.botId)!;
  const { menu, userMessage } = prepareDecision(turn, 'v1.2');
  assert.equal(menu[0]!.kind === 'check' || menu[0]!.kind === 'fold', true);
  assert.deepEqual(decision, { action: { type: menu[0]!.kind } });

  assert.equal(calls.length, 1);
  const { args, options } = calls[0]!;
  assert.equal(options.stdin, userMessage);
  assert.equal(options.deadlineMs, 30_000);
  assert.equal(calls[0]!.cwdEmpty, true, 'a fresh, empty working directory');
  assert.ok(options.cwd.startsWith(tmpdir()) && !existsSync(options.cwd), 'outside the repo, and removed afterwards');
  assert.ok(Object.keys(options.env).every((key) => (CHILD_ENV_KEYS as readonly string[]).includes(key)));
  assert.equal(args[args.indexOf('--model') + 1], 'claude-haiku-5-5');
  assert.equal(args[args.indexOf('--system-prompt') + 1], cliSystemPrompt('v1.2', 'analyst').text);
  assert.equal(args[args.indexOf('--tools') + 1], '');
  assert.ok(!args.includes('--bare') && !args.includes('--fallback-model'));
});

test('Sonnet is asked for by its own model id', async () => {
  const { run, calls } = fakeClaude(() => success(answer('A'), 'claude-sonnet-5-5'));
  const decision = await decideAt(runtimeWith(run), SPOTS[1]!, SONNET);
  assert.equal(decision.fallbackReason, undefined);
  assert.equal(calls[0]!.args[calls[0]!.args.indexOf('--model') + 1], 'claude-sonnet-5-5');
});

test('a timeout, a CLI error and an invalid letter each play TAG for that decision, with the reason', async () => {
  const spot = SPOTS[2]!;
  const tag = () => botActionToDecision(chooseBotAction(buildBotTurnInput(spot.room, spot.botId)!.context, 'tag', () => 0.5));
  const cases: Array<[RunResult, string]> = [
    [result('', { timedOut: true, exitCode: null }), 'timeout'],
    [result('not json at all', { exitCode: 1 }), 'llm_error'],
    [success(answer('Z')), 'invalid_output'],
  ];
  for (const [output, reason] of cases) {
    const runtime = runtimeWith(fakeClaude(() => output).run, { rng: () => 0.5 });
    assert.deepEqual(await decideAt(runtime, spot), { action: tag(), fallbackReason: reason }, reason);
    assert.equal(runtime.enabled, true, `${reason} does not disable the bots`);
  }
});

test('a usage limit disables the bots for the process: no retry, no further calls, TAG from then on', async () => {
  const { run, calls } = fakeClaude(() => usageLimit());
  const logs: string[] = [];
  const runtime = createCliBotRuntime({ timeoutMs: 30_000, run, log: (message) => logs.push(message) });

  assert.equal(runtime.enabled, true);
  const first = await decideAt(runtime, SPOTS[0]!);
  assert.equal(first.fallbackReason, 'cli_unavailable');
  assert.equal(runtime.enabled, false);
  assert.equal(calls.length, 1);

  const second = await decideAt(runtime, SPOTS[1]!);
  assert.equal(second.fallbackReason, 'cli_unavailable');
  assert.equal(calls.length, 1, 'nothing is retried or started afterwards');
  assert.equal(logs.filter((message) => message.includes('disabled for this process')).length, 1);
});

test('auth, rate-limit and isolation-violation outcomes disable the bots too', async () => {
  const outcomes = {
    auth: result(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 401, result: 'Invalid authentication credentials' })),
    rate: result(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, api_error_status: 429, result: 'rate limit exceeded' })),
    drift: success(answer('A'), 'claude-opus-4-6'),
  };
  for (const [name, output] of Object.entries(outcomes)) {
    const runtime = runtimeWith(fakeClaude(() => output).run);
    const decided = await decideAt(runtime, SPOTS[3]!);
    assert.equal(decided.fallbackReason, 'cli_unavailable', name);
    assert.equal(runtime.enabled, false, name);
  }
});

test('three unclassified errors in a row disable the bots, as in the evals', async () => {
  const runtime = runtimeWith(fakeClaude(() => result('garbage', { exitCode: 1 })).run);
  for (let index = 0; index < 3; index += 1) {
    assert.equal(runtime.enabled, true);
    await decideAt(runtime, SPOTS[index]!);
  }
  assert.equal(runtime.enabled, false);
});

test('at most two claude calls run at once, across rooms, and the rest wait their turn', async () => {
  let running = 0;
  let peak = 0;
  const { run, calls } = fakeClaude(async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 15));
    running -= 1;
    return success(answer('A'));
  });
  const runtime = runtimeWith(run);
  const decisions = await Promise.all(SPOTS.map((spot) => decideAt(runtime, spot)));
  assert.equal(peak, 2);
  assert.equal(calls.length, SPOTS.length);
  assert.ok(decisions.every((decision) => decision.fallbackReason === undefined));
});

test('a turn that was cancelled while it waited for a slot never starts a call', async () => {
  const gate = Promise.withResolvers<void>();
  const { run, calls } = fakeClaude(async () => {
    await gate.promise;
    return success(answer('A'));
  });
  const runtime = runtimeWith(run, { maxConcurrent: 1 });
  const first = decideAt(runtime, SPOTS[0]!);
  const controller = new AbortController();
  const second = decideAt(runtime, SPOTS[1]!, HAIKU, controller.signal);
  controller.abort();
  gate.resolve();
  await first;
  assert.equal((await second).fallbackReason, 'timeout');
  assert.equal(calls.length, 1);
});

test('what the model is sent does not depend on other players\' cards or the deck, and does on the bot\'s own', async () => {
  for (const [index, spot] of SPOTS.entries()) {
    const sent = async (room: BotSpot['room']) => {
      const { run, calls } = fakeClaude(() => success(answer('A')));
      await decideAt(runtimeWith(run), { ...spot, room });
      return { args: calls[0]!.args, stdin: calls[0]!.options.stdin, env: calls[0]!.options.env };
    };
    const base = await sent(spot.room);
    assert.deepEqual(await sent(permuteHidden(spot.room, spot.botId, `live-${index}`)), base, `spot ${index}`);

    const room = structuredClone(spot.room);
    const self = room.hand!.players.find((player) => player.id === spot.botId)!;
    const swap = room.hand!.deck.findIndex((card) => !self.holeCards.includes(card));
    [self.holeCards[0], room.hand!.deck[swap]] = [room.hand!.deck[swap]!, self.holeCards[0]!];
    assert.notEqual((await sent(room)).stdin, base.stdin, 'the check would catch a leak');
  }
});

test('a finished hand goes into the room ledger once', async () => {
  const [room] = seededFinishedHands(1, 'cli-ledger', 3);
  const bot = [...room!.players.values()][0]!;
  bot.botConfig = { kind: 'llm', model: HAIKU, personaId: 'analyst' };
  const runtime = runtimeWith(fakeClaude(() => success(answer('A'))).run);

  assert.deepEqual(runtime.ledgerOf(room!), { players: {} });
  runtime.recordHandEnd(room!);
  const once = structuredClone(runtime.ledgerOf(room!));
  assert.deepEqual(Object.keys(once.players).sort(), [...room!.players.keys()].sort());
  runtime.recordHandEnd(room!);
  assert.deepEqual(runtime.ledgerOf(room!), once, 'the same hand is not counted twice');
  assert.ok(Object.values(once.players).every((entry) => entry.byLine !== undefined));
});

test('without a Claude Code bot at the table nothing is kept', () => {
  const [room] = seededFinishedHands(1, 'cli-ledger-none', 3);
  const runtime = runtimeWith(fakeClaude(() => success(answer('A'))).run);
  runtime.recordHandEnd(room!);
  assert.deepEqual(runtime.ledgerOf(room!), { players: {} });
});

test('flag off or startup checks failing: the bots are not offered, and the failure is logged', () => {
  const logs: string[] = [];
  assert.equal(startCliBots({ enabled: false, timeoutMs: 30_000, log: (message) => logs.push(message) }), DISABLED_CLI_BOTS);
  assert.deepEqual(logs, []);

  const refused = startCliBots({
    enabled: true,
    timeoutMs: 30_000,
    log: (message) => logs.push(message),
    preflight: () => {
      throw new Error('Refusing to run: ANTHROPIC_BASE_URL set; unset it so calls bill the subscription');
    },
  });
  assert.equal(refused.enabled, false);
  assert.match(logs.join('\n'), /NOT enabled: Refusing to run: ANTHROPIC_BASE_URL set/);

  const noCanary = startCliBots({
    enabled: true,
    timeoutMs: 30_000,
    log: (message) => logs.push(message),
    preflight: () => ({ version: '9.9.9', subscriptionType: 'max' }),
    assertCanary: () => {
      throw new Error('Refusing to run: the canary has not passed');
    },
  });
  assert.equal(noCanary.enabled, false);

  const ok = startCliBots({
    enabled: true,
    timeoutMs: 12_345,
    log: (message) => logs.push(message),
    preflight: () => ({ version: '9.9.9', subscriptionType: 'max' }),
    assertCanary: () => undefined,
  });
  assert.equal(ok.enabled, true);
  assert.equal(ok.timeoutMs, 12_345);
});
