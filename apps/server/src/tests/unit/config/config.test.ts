import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerConfig } from '../../../config.ts';
import { LLM_PROFILES } from '../../../llm/profiles.ts';

test('parseServerConfig uses defaults when env is empty', () => {
  const result = parseServerConfig({});

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.deepEqual(result.value, {
    host: '0.0.0.0',
    port: 3001,
    corsOrigin: 'http://localhost:3000',
    authSecret: 'dev-guest-secret-change-me',
    authCookieName: 'aipoker_session',
    authTtlSeconds: 2592000,
    httpRateLimitPerMinute: 100,
    secureCookies: false,
    authStrict: true,
    openRouterApiKey: null,
    openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    openRouterHttpReferer: null,
    openRouterAppTitle: 'AiPoker',
    llmAgentEnabled: false,
    llmAgentRealtimeTargetMs: 5000,
    llmAgentRealtimeTimeoutMs: 8000,
    llmAgentEvalTimeoutMs: 45000,
    llmAgentMaxToolRoundsRealtime: 1,
    llmAgentMaxToolRoundsEval: 3,
    llmAgentMaxPromptTokens: 4000,
    llmAgentMaxCompletionTokens: 600,
    llmAgentRoomCostLimitUsd: 1,
    llmProfiles: {},
    coachCommentaryProfile: null,
    coachJudgeProfile: null,
    llmBotProfiles: {},
    llmDailyBudgetUsd: 1,
    llmCassette: { mode: 'off' }
  });
});

test('parseServerConfig validates numeric port range', () => {
  const result = parseServerConfig({ PORT: '99999' });

  assert.deepEqual(result, {
    ok: false,
    error: 'invalid_server_config'
  });
});

test('parseServerConfig parses boolean-like security flags', () => {
  const result = parseServerConfig({
    SECURE_COOKIES: 'true',
    AUTH_STRICT: '1'
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.secureCookies, true);
  assert.equal(result.value.authStrict, true);
});

test('parseServerConfig allows opting out of strict auth', () => {
  const result = parseServerConfig({ AUTH_STRICT: 'false' });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.authStrict, false);
});

test('parseServerConfig rejects production without AUTH_SECRET', () => {
  assert.deepEqual(parseServerConfig({ NODE_ENV: 'production' }), {
    ok: false,
    error: 'invalid_server_config'
  });
});

test('parseServerConfig defaults secure cookies on in production', () => {
  const result = parseServerConfig({
    NODE_ENV: 'production',
    AUTH_SECRET: 'a-production-secret-value'
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.secureCookies, true);
  assert.equal(result.value.authSecret, 'a-production-secret-value');
});

test('parseServerConfig parses custom HTTP rate limit', () => {
  const result = parseServerConfig({
    HTTP_RATE_LIMIT_PER_MINUTE: '42'
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.httpRateLimitPerMinute, 42);
});

test('parseServerConfig parses llm agent runtime settings', () => {
  const result = parseServerConfig({
    OPENROUTER_API_KEY: 'or-key',
    OPENROUTER_BASE_URL: 'https://openrouter.example/api/v1',
    OPENROUTER_HTTP_REFERER: 'https://aipoker.dev',
    OPENROUTER_APP_TITLE: 'AiPoker Dev',
    LLM_AGENT_ENABLED: 'true',
    LLM_AGENT_REALTIME_TARGET_MS: '6000',
    LLM_AGENT_REALTIME_TIMEOUT_MS: '9000',
    LLM_AGENT_EVAL_TIMEOUT_MS: '50000',
    LLM_AGENT_MAX_TOOL_ROUNDS_REALTIME: '2',
    LLM_AGENT_MAX_TOOL_ROUNDS_EVAL: '4',
    LLM_AGENT_MAX_PROMPT_TOKENS: '5000',
    LLM_AGENT_MAX_COMPLETION_TOKENS: '800',
    LLM_AGENT_ROOM_COST_LIMIT_USD: '2.5',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.openRouterApiKey, 'or-key');
  assert.equal(result.value.openRouterBaseUrl, 'https://openrouter.example/api/v1');
  assert.equal(result.value.openRouterHttpReferer, 'https://aipoker.dev');
  assert.equal(result.value.openRouterAppTitle, 'AiPoker Dev');
  assert.equal(result.value.llmAgentEnabled, true);
  assert.equal(result.value.llmAgentRealtimeTargetMs, 6000);
  assert.equal(result.value.llmAgentRealtimeTimeoutMs, 9000);
  assert.equal(result.value.llmAgentEvalTimeoutMs, 50000);
  assert.equal(result.value.llmAgentMaxToolRoundsRealtime, 2);
  assert.equal(result.value.llmAgentMaxToolRoundsEval, 4);
  assert.equal(result.value.llmAgentMaxPromptTokens, 5000);
  assert.equal(result.value.llmAgentMaxCompletionTokens, 800);
  assert.equal(result.value.llmAgentRoomCostLimitUsd, 2.5);
});

test('parseServerConfig rejects enabled llm agent runtime without an OpenRouter API key', () => {
  const result = parseServerConfig({
    LLM_AGENT_ENABLED: 'true',
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'invalid_server_config',
  });
});

test('parseServerConfig resolves the LLM profiles it references', () => {
  const result = parseServerConfig({
    OPENROUTER_API_KEY: 'or-key',
    ANTHROPIC_API_KEY: 'anthropic-key',
    COACH_COMMENTARY_PROFILE: 'openrouter-gpt-6-luna',
    COACH_JUDGE_PROFILE: 'anthropic-claude-haiku-5-5',
    LLM_BOT_PROFILES: 'claude:openrouter-claude-haiku-5-5, gpt:openrouter-gpt-6-luna',
    LLM_DAILY_BUDGET_USD: '2.5',
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.coachCommentaryProfile, 'openrouter-gpt-6-luna');
  assert.equal(result.value.coachJudgeProfile, 'anthropic-claude-haiku-5-5');
  assert.deepEqual(result.value.llmBotProfiles, {
    claude: 'openrouter-claude-haiku-5-5',
    gpt: 'openrouter-gpt-6-luna',
  });
  assert.equal(result.value.llmDailyBudgetUsd, 2.5);
  assert.deepEqual(Object.keys(result.value.llmProfiles).sort(), [
    'anthropic-claude-haiku-5-5',
    'openrouter-claude-haiku-5-5',
    'openrouter-gpt-6-luna',
  ]);
  const luna = result.value.llmProfiles['openrouter-gpt-6-luna']!;
  assert.equal(luna.endpoint, 'https://openrouter.ai/api/v1');
  assert.equal(luna.apiKey, 'or-key');
  assert.equal(result.value.llmProfiles['anthropic-claude-haiku-5-5']!.apiKey, 'anthropic-key');
});

test('parseServerConfig rejects a referenced profile that is unknown or missing its env vars', () => {
  const invalid = { ok: false, error: 'invalid_server_config' };

  assert.deepEqual(parseServerConfig({ COACH_COMMENTARY_PROFILE: 'openai-gpt-6-luna' }), invalid);
  assert.deepEqual(parseServerConfig({ LLM_RELAY_API_KEY: 'k', COACH_JUDGE_PROFILE: 'relay-gpt-6-luna' }), invalid);
  assert.deepEqual(parseServerConfig({ OPENAI_API_KEY: 'k', COACH_COMMENTARY_PROFILE: 'no-such-profile' }), invalid);
  assert.deepEqual(parseServerConfig({ LLM_BOT_PROFILES: 'claude:openai-gpt-6-luna' }), invalid);
});

test('parseServerConfig rejects malformed LLM_BOT_PROFILES', () => {
  const env = { OPENAI_API_KEY: 'k' };
  for (const value of ['robot:openai-gpt-6-luna', 'gpt', 'gpt:a:b', 'gpt:openai-gpt-6-luna,gpt:openai-gpt-6-luna']) {
    assert.deepEqual(parseServerConfig({ ...env, LLM_BOT_PROFILES: value }), {
      ok: false,
      error: 'invalid_server_config',
    }, value);
  }
});

test('parseServerConfig requires a cassette directory to record or replay', () => {
  assert.deepEqual(parseServerConfig({ LLM_CASSETTE: 'replay' }), { ok: false, error: 'invalid_server_config' });

  const result = parseServerConfig({ LLM_CASSETTE: 'replay', LLM_CASSETTE_DIR: 'cassettes' });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.llmCassette, { mode: 'replay', dir: 'cassettes' });
});

test('every checked-in LLM profile resolves from the env vars config knows', () => {
  const env = {
    OPENROUTER_API_KEY: 'k',
    OPENAI_API_KEY: 'k',
    ANTHROPIC_API_KEY: 'k',
    LLM_RELAY_BASE_URL: 'https://relay.example/v1/',
    LLM_RELAY_API_KEY: 'k',
  };

  for (const profile of LLM_PROFILES) {
    const result = parseServerConfig({ ...env, COACH_COMMENTARY_PROFILE: profile.id });
    assert.equal(result.ok, true, profile.id);
    if (!result.ok) return;
    assert.equal(result.value.llmProfiles[profile.id]!.endpoint.endsWith('/'), false, profile.id);
  }
});
