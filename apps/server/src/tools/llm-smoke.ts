// P1 gate: one real JSON call per configured profile, cassettes recorded, and the usage fields
// each provider returned. Spends real money (capped at $0.05 in total).
//   pnpm --filter @aipoker/server smoke:llm [profile-id ...]
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { createBudgetLedger } from '../llm/budget.ts';
import { createLlmClient } from '../llm/client.ts';
import { DEFAULT_OPENROUTER_BASE_URL, LLM_PROFILES, resolveLlmProfile } from '../llm/profiles.ts';
import type { OutputSchema } from '../llm/structured.ts';

const BUDGET_USD = 0.05;

const schema: OutputSchema<{ ok: boolean; word: string }> = {
  name: 'smoke',
  jsonSchema: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, word: { type: 'string' } },
    required: ['ok', 'word'],
    additionalProperties: false,
  },
  zod: z.object({ ok: z.boolean(), word: z.string() }),
};

function flatten(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) {
    return [`${prefix}=${JSON.stringify(value)}`];
  }
  return Object.entries(value).flatMap(([key, item]) => flatten(item, prefix ? `${prefix}.${key}` : key));
}

async function main(): Promise<void> {
  const dir = process.env.LLM_CASSETTE_DIR ?? '.eval/llm-smoke';
  const env = { ...process.env, OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL };
  const ids = process.argv.slice(2);
  const client = createLlmClient({
    ledger: createBudgetLedger({ dailyUsd: BUDGET_USD }),
    cassette: { mode: 'record', dir },
  });

  let totalUsd = 0;
  for (const base of LLM_PROFILES) {
    if (ids.length > 0 && !ids.includes(base.id)) {
      continue;
    }
    const profile = resolveLlmProfile(base.id, env);
    if (!profile) {
      console.log(`${base.id}: skipped (env vars missing)`);
      continue;
    }

    const result = await client.generateJson(
      profile,
      [
        { role: 'system', content: 'You are a test endpoint. Answer in JSON.' },
        { role: 'user', content: 'Return ok = true and word = "poker".' },
      ],
      schema,
      { ms: 20_000 },
      [],
    );
    totalUsd += result.costUsd;

    const last = result.attempts.at(-1);
    console.log(`\n## ${profile.id} (${profile.model}, ${profile.structured})`);
    console.log(result.ok ? `value: ${JSON.stringify(result.value)}` : `error: ${result.error}`);
    for (const attempt of result.attempts) {
      console.log(
        `attempt: ${attempt.status} http=${attempt.httpStatus} ${attempt.latencyMs} ms $${attempt.costUsd.toFixed(6)}`
          + `${attempt.costEstimated ? ' (estimated)' : ''}${attempt.errors.length ? ` errors=${attempt.errors.join('; ')}` : ''}`,
      );
    }
    if (last?.status === 'ok') {
      const recorded = JSON.parse(await readFile(join(dir, `${last.requestHash}.json`), 'utf8')) as { response: string };
      const usage = (JSON.parse(recorded.response) as { usage?: unknown }).usage;
      console.log(`usage fields: ${usage === undefined ? '(none)' : flatten(usage).join(', ')}`);
    } else if (last) {
      console.log(`raw: ${last.raw.slice(0, 300)}`);
    }
  }
  console.log(`\ntotal: $${totalUsd.toFixed(6)} (cap $${BUDGET_USD}); cassettes in ${dir}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
