import assert from 'node:assert/strict';
import test from 'node:test';

import { parseServerConfig } from '../../../config.ts';

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
    authStrict: false,
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
    llmAgentRoomCostLimitUsd: 1
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
