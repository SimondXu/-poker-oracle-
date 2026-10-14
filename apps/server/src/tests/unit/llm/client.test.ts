import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { z } from 'zod';

import { createBudgetLedger } from '../../../llm/budget.ts';
import type { CassetteConfig } from '../../../llm/cassette.ts';
import { createLlmClient, type ChatMessage } from '../../../llm/client.ts';
import type { ResolvedLlmProfile, StructuredMode } from '../../../llm/profiles.ts';
import type { OutputSchema } from '../../../llm/structured.ts';

type Verdict = { verdict: 'matched' | 'off'; note: string | null };

const schema: OutputSchema<Verdict> = {
  name: 'verdict',
  jsonSchema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', enum: ['matched', 'off'] },
      note: { type: ['string', 'null'] },
    },
    required: ['verdict', 'note'],
    additionalProperties: false,
  },
  zod: z.object({ verdict: z.enum(['matched', 'off']), note: z.string().nullable() }),
};

const messages: ChatMessage[] = [
  { role: 'system', content: 'You grade poker decisions.' },
  { role: 'user', content: 'Grade this one.' },
];

const API_KEY = 'sk-test-secret';

function profile(overrides: Partial<ResolvedLlmProfile> = {}): ResolvedLlmProfile {
  return {
    id: 'test-profile',
    label: 'Test',
    baseUrl: 'https://llm.test/v1',
    apiKeyEnv: 'TEST_API_KEY',
    model: 'test/model',
    structured: 'json_schema',
    temperature: null,
    maxTokensParam: 'max_completion_tokens',
    maxOutputTokens: 500,
    costSource: 'usage.cost',
    price: { inputPerM: 1, outputPerM: 2 },
    timeoutMs: 10_000,
    maxConcurrency: 4,
    endpoint: 'https://llm.test/v1',
    apiKey: API_KEY,
    ...overrides,
  };
}

interface Reply {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  /** Wait for the request to be aborted instead of answering. */
  hang?: boolean;
  delayMs?: number;
}

function completion(content: string, usage?: Record<string, unknown>) {
  return { choices: [{ message: { role: 'assistant', content } }], ...(usage ? { usage } : {}) };
}

const okVerdict = JSON.stringify({ verdict: 'off', note: null });

/** A fake fetch that answers from a script and records every request. */
function fakeFetch(replies: Reply[] | ((index: number) => Reply)) {
  const requests: Array<{ url: string; headers: Record<string, string>; body: Record<string, any> }> = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const index = requests.length;
    requests.push({
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(init.body as string),
    });
    const reply = typeof replies === 'function' ? replies(index) : replies[index];
    assert.ok(reply, `unexpected request #${index}`);
    if (reply.hang) {
      await new Promise((_, reject) => {
        init.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    }
    if (reply.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, reply.delayMs));
    }
    return new Response(typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: reply.headers,
    });
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

function setup(options: { fetch: typeof globalThis.fetch; cassette?: CassetteConfig; dailyUsd?: number; now?: () => number }) {
  const logs: string[] = [];
  const ledger = createBudgetLedger({ dailyUsd: options.dailyUsd ?? 10 });
  const client = createLlmClient({
    ledger,
    cassette: options.cassette ?? { mode: 'off' },
    fetch: options.fetch,
    log: (message) => logs.push(message),
    ...(options.now ? { now: options.now } : {}),
  });
  return { client, ledger, logs };
}

const deadline = { ms: 2_000 };

test('json_schema mode sends a strict response_format and charges usage.cost', async () => {
  const { fetch, requests } = fakeFetch([
    { body: completion(okVerdict, { prompt_tokens: 120, completion_tokens: 9, cost: 0.0004 }) },
  ]);
  const { client, ledger } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, deadline, []);

  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, { verdict: 'off', note: null });
  assert.equal(requests[0]!.url, 'https://llm.test/v1/chat/completions');
  assert.equal(requests[0]!.headers.authorization, `Bearer ${API_KEY}`);
  assert.deepEqual(requests[0]!.body, {
    model: 'test/model',
    messages,
    max_completion_tokens: 500,
    response_format: { type: 'json_schema', json_schema: { name: 'verdict', strict: true, schema: schema.jsonSchema } },
  });
  assert.equal(result.costUsd, 0.0004);
  assert.equal(result.attempts[0]!.costEstimated, false);
  assert.deepEqual(result.attempts[0]!.usage, { input: 120, output: 9, cachedInput: null, reasoning: null });
  assert.equal(ledger.spentUsd('daily'), 0.0004);
});

test('json_object mode asks for JSON in the system prompt and prices tokens from the table', async () => {
  const { fetch, requests } = fakeFetch([
    {
      body: completion(okVerdict, {
        prompt_tokens: 1_000,
        completion_tokens: 100,
        prompt_tokens_details: { cached_tokens: 400 },
        completion_tokens_details: { reasoning_tokens: 60 },
      }),
    },
  ]);
  const { client } = setup({ fetch });

  const result = await client.generateJson(
    profile({ structured: 'json_object', costSource: 'price_table', maxTokensParam: 'max_tokens', temperature: 0.2 }),
    messages,
    schema,
    deadline,
    [],
  );

  assert.equal(result.ok, true);
  const body = requests[0]!.body;
  assert.deepEqual(body.response_format, { type: 'json_object' });
  assert.equal(body.max_tokens, 500);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.messages.length, 2);
  assert.match(body.messages[0].content, /^You grade poker decisions\.\n\nReply with one JSON object/);
  assert.ok(body.messages[0].content.includes(JSON.stringify(schema.jsonSchema)));
  // 1,000 × $1/M + 100 × $2/M
  assert.equal(result.costUsd, 0.0012);
  assert.deepEqual(result.attempts[0]!.usage, { input: 1_000, output: 100, cachedInput: 400, reasoning: 60 });
});

test('prompt mode sends no response_format and parses a fenced reply wrapped in prose', async () => {
  const { fetch, requests } = fakeFetch([
    { body: completion(`Here you go:\n\`\`\`json\n${okVerdict}\n\`\`\`\nHope that helps.`) },
  ]);
  const { client } = setup({ fetch });

  const result = await client.generateJson(
    profile({ structured: 'prompt' }),
    [{ role: 'user', content: 'Grade this one.' }],
    schema,
    deadline,
    [],
  );

  assert.deepEqual(result.ok && result.value, { verdict: 'off', note: null });
  assert.equal('response_format' in requests[0]!.body, false);
  assert.equal(requests[0]!.body.messages[0].role, 'system');
  assert.match(requests[0]!.body.messages[0].content, /^Reply with one JSON object/);
});

test('missing usage charges the reservation and flags the cost as estimated', async () => {
  const { fetch } = fakeFetch([{ body: completion(okVerdict) }]);
  const { client, ledger } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, deadline, [
    { kind: 'room', id: 'r1', capUsd: 1 },
  ]);

  assert.equal(result.ok, true);
  const attempt = result.attempts[0]!;
  assert.equal(attempt.costEstimated, true);
  assert.equal(attempt.usage, null);
  // At least the full output cap at $2/M.
  assert.ok(attempt.costUsd >= 0.001);
  assert.equal(ledger.spentUsd('daily'), attempt.costUsd);
  assert.equal(ledger.spentUsd('room:r1'), attempt.costUsd);
});

test('a 429 is retried once after retry-after when the deadline leaves room', async () => {
  const { fetch, requests } = fakeFetch([
    { status: 429, headers: { 'retry-after': '0.05' }, body: { error: { message: 'slow down' } } },
    { body: completion(okVerdict, { cost: 0.0001 }) },
  ]);
  const { client } = setup({ fetch });

  const startedAt = Date.now();
  const result = await client.generateJson(profile(), messages, schema, { ms: 1_000 }, []);

  assert.equal(result.ok, true);
  assert.equal(requests.length, 2);
  assert.ok(Date.now() - startedAt >= 45);
  assert.deepEqual(
    result.attempts.map((attempt) => [attempt.status, attempt.httpStatus]),
    [['http_error', 429], ['ok', 200]],
  );
  assert.equal(result.attempts[0]!.costUsd, 0);
});

test('no retry when retry-after would leave under 40% of the deadline, or on a 400', async () => {
  const late = fakeFetch([{ status: 429, headers: { 'retry-after': '1' }, body: {} }]);
  const lateResult = await setup({ fetch: late.fetch }).client.generateJson(profile(), messages, schema, { ms: 1_500 }, []);
  assert.deepEqual([lateResult.ok, !lateResult.ok && lateResult.error, late.requests.length], [false, 'http_error', 1]);

  const bad = fakeFetch([{ status: 400, body: {} }]);
  const badResult = await setup({ fetch: bad.fetch }).client.generateJson(profile(), messages, schema, deadline, []);
  assert.deepEqual([badResult.ok, bad.requests.length], [false, 1]);
});

test('a 401 opens the breaker for 15 minutes with a log that names the env var, not the key', async () => {
  let clock = Date.now();
  const { fetch, requests } = fakeFetch((index) =>
    index === 0 ? { status: 401, body: { error: 'bad key' } } : { body: completion(okVerdict) },
  );
  const { client, logs } = setup({ fetch, now: () => clock });

  const first = await client.generateJson(profile(), messages, schema, deadline, []);
  const blocked = await client.generateJson(profile(), messages, schema, deadline, []);
  clock += 14 * 60_000;
  const stillBlocked = await client.generateJson(profile(), messages, schema, deadline, []);
  clock += 2 * 60_000;
  const reopened = await client.generateJson(profile(), messages, schema, deadline, []);

  assert.equal(!first.ok && first.error, 'http_error');
  assert.equal(!blocked.ok && blocked.error, 'breaker_open');
  assert.equal(!stillBlocked.ok && stillBlocked.error, 'breaker_open');
  assert.deepEqual(blocked.attempts, []);
  assert.equal(reopened.ok, true);
  assert.equal(requests.length, 2);
  assert.equal(logs.length, 1);
  assert.match(logs[0]!, /test-profile: HTTP 401; check TEST_API_KEY/);
  assert.equal(logs[0]!.includes(API_KEY), false);
});

test('five consecutive failures open the breaker for 60 seconds', async () => {
  let clock = Date.now();
  const { fetch, requests } = fakeFetch(() => ({ status: 503, body: {} }));
  const { client } = setup({ fetch, now: () => clock });

  // Calls 1-2 fail twice (a try and its retry); call 3's first failure is the fifth and opens the breaker.
  for (let call = 0; call < 3; call += 1) {
    await client.generateJson(profile(), messages, schema, deadline, []);
  }
  const blocked = await client.generateJson(profile(), messages, schema, deadline, []);
  clock += 61_000;
  await client.generateJson(profile(), messages, schema, deadline, []);

  assert.equal(!blocked.ok && blocked.error, 'breaker_open');
  // After 60 s a single failure reopens it, with no retry.
  assert.equal(requests.length, 6);
});

test('the deadline aborts a hanging request and charges the reservation', async () => {
  const { fetch } = fakeFetch([{ hang: true }]);
  const { client, ledger } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, { ms: 50 }, []);

  assert.equal(!result.ok && result.error, 'timeout');
  assert.equal(result.attempts[0]!.status, 'timeout');
  assert.equal(result.attempts[0]!.costEstimated, true);
  assert.equal(ledger.spentUsd('daily'), result.attempts[0]!.costUsd);
});

test("the caller's signal aborts a request", async () => {
  const { fetch } = fakeFetch([{ hang: true }]);
  const { client } = setup({ fetch });
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);

  const result = await client.generateJson(profile(), messages, schema, { ms: 2_000, signal: controller.signal }, []);

  assert.equal(!result.ok && result.error, 'aborted');
});

test('a call waiting for a concurrency slot past its deadline fails fast', async () => {
  const { fetch, requests } = fakeFetch([{ delayMs: 200, body: completion(okVerdict) }]);
  const { client } = setup({ fetch });
  const single = profile({ maxConcurrency: 1 });

  const [first, second] = await Promise.all([
    client.generateJson(single, messages, schema, deadline, []),
    client.generateJson(single, messages, schema, { ms: 50 }, []),
  ]);

  assert.equal(first.ok, true);
  assert.equal(!second.ok && second.error, 'timeout');
  assert.deepEqual(second.attempts, []);
  assert.equal(requests.length, 1);
});

test('concurrent calls never overspend a cap by more than one reservation', async () => {
  const { fetch } = fakeFetch(() => ({ delayMs: 10, body: completion(okVerdict) }));
  const { client, ledger } = setup({ fetch });
  const wide = profile({ maxConcurrency: 50 });
  const capUsd = 0.005;

  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      client.generateJson(wide, messages, schema, deadline, [{ kind: 'player', id: 'p1', capUsd }]),
    ),
  );

  const served = results.filter((result) => result.ok);
  const refused = results.filter((result) => !result.ok && result.error === 'budget');
  const reservation = served[0]!.attempts[0]!.costUsd;
  assert.ok(served.length > 0 && refused.length > 0);
  assert.equal(served.length + refused.length, 20);
  assert.ok(ledger.spentUsd('player:p1') <= capUsd + reservation);
});

test('repair sends the errors back once and accepts the corrected reply', async () => {
  const { fetch, requests } = fakeFetch([
    { body: completion('{"verdict": "close", "note": null}') },
    { body: completion('{"verdict": "matched", "note": null}') },
  ]);
  const { client } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, deadline, [], {
    repair: true,
    validate: (value) => (value.verdict === 'matched' ? [] : ['verdict must be matched']),
  });

  assert.deepEqual(result.ok && result.value, { verdict: 'matched', note: null });
  assert.equal(result.attempts.length, 2);
  assert.equal(result.attempts[0]!.errors.length, 1);
  const repairTurn = requests[1]!.body.messages.at(-1);
  assert.equal(repairTurn.role, 'user');
  assert.match(repairTurn.content, /verdict: Invalid option/);
});

test('without repair an invalid reply fails as invalid_output', async () => {
  const { fetch } = fakeFetch([{ body: completion('I think the verdict is off.') }]);
  const { client } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, deadline, []);

  assert.equal(!result.ok && result.error, 'invalid_output');
  assert.deepEqual(result.attempts[0]!.errors, ['no JSON object in the reply']);
});

test('a recorded cassette replays without the network, stores no key, and a miss is an error', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'llm-cassette-'));
  try {
    const recording = fakeFetch([{ body: completion(okVerdict, { cost: 0.0002 }) }]);
    const recorded = await setup({ fetch: recording.fetch, cassette: { mode: 'record', dir } })
      .client.generateJson(profile(), messages, schema, deadline, []);

    const files = await readdir(dir);
    assert.deepEqual(files, [`${recorded.attempts[0]!.requestHash}.json`]);
    const stored = await readFile(join(dir, files[0]!), 'utf8');
    assert.equal(stored.includes(API_KEY), false);
    assert.equal(stored.toLowerCase().includes('authorization'), false);

    const offline = (async () => {
      throw new Error('network used during replay');
    }) as typeof globalThis.fetch;
    const replayer = setup({ fetch: offline, cassette: { mode: 'replay', dir } }).client;
    const replayed = await replayer.generateJson(profile(), messages, schema, deadline, []);
    assert.deepEqual(replayed.ok && replayed.value, recorded.ok && recorded.value);
    assert.equal(replayed.costUsd, 0.0002);

    const miss = await replayer.generateJson(profile(), [...messages, { role: 'user', content: 'again' }], schema, deadline, []);
    assert.equal(!miss.ok && miss.error, 'cassette_miss');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('every structured mode yields the same value from the same reply', async () => {
  const modes: StructuredMode[] = ['json_schema', 'json_object', 'prompt'];
  for (const structured of modes) {
    const { fetch } = fakeFetch([{ body: completion(okVerdict) }]);
    const result = await setup({ fetch }).client.generateJson(profile({ structured }), messages, schema, deadline, []);
    assert.deepEqual(result.ok && result.value, { verdict: 'off', note: null }, structured);
  }
});

test('an error body with HTTP 200 is an http_error, not a reply', async () => {
  const { fetch } = fakeFetch([{ body: { error: { message: 'upstream failed' } } }]);
  const { client } = setup({ fetch });

  const result = await client.generateJson(profile(), messages, schema, deadline, []);

  assert.equal(!result.ok && result.error, 'http_error');
  assert.deepEqual([result.attempts[0]!.httpStatus, result.attempts[0]!.costUsd], [200, 0]);
});
