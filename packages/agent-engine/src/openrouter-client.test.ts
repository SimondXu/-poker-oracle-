import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createOpenRouterChatClient,
  resolveOpenRouterModelId,
  type AgentLlmRequest,
} from './index.ts';

function makeRequest(overrides: Partial<AgentLlmRequest> = {}): AgentLlmRequest {
  return {
    messages: [
      { role: 'system', content: 'You are an AiPoker agent.' },
      { role: 'user', content: 'Return JSON.' },
    ],
    tools: [
      {
        name: 'get_preflop_mix',
        description: 'Return mix',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    ],
    responseFormat: {
      type: 'json_schema',
      json_schema: {
        name: 'preflop_open_action_plan',
        schema: {
          type: 'object',
          properties: {
            skillId: { type: 'string' },
          },
          required: ['skillId'],
          additionalProperties: false,
        },
        strict: true,
      },
    },
    runtimeConfig: {
      model: 'gpt',
      personaId: 'analyst',
    },
    mode: 'realtime',
    ...overrides,
  };
}

test('resolveOpenRouterModelId maps approved families to the configured latest stable models', () => {
  assert.equal(resolveOpenRouterModelId('gpt'), 'openai/gpt-5.4');
  assert.equal(resolveOpenRouterModelId('claude'), 'anthropic/claude-sonnet-4.6');
  assert.equal(resolveOpenRouterModelId('gemini'), 'google/gemini-3-flash-preview');
  assert.equal(resolveOpenRouterModelId('grok'), 'x-ai/grok-4-fast');
  assert.equal(resolveOpenRouterModelId('minimax'), 'minimax/minimax-m2.5');
});

test('OpenRouter chat client sends OpenAI-compatible chat completions payload with json_schema and tools', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;

  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    httpReferer: 'https://aipoker.dev',
    maxCompletionTokens: 321,
    fetch: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;

      return new Response(
        JSON.stringify({
          id: 'chatcmpl-1',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  skillId: 'preflop_open',
                  intent: 'raise',
                  sizePreset: 'open_2_5bb',
                  confidence: 0.88,
                  reasoning: {
                    situation: 'Button unopened.',
                    analysis: 'Strong hand.',
                    decision: 'Raise.',
                    alternativeConsidered: 'Folding is too tight.',
                  },
                }),
              },
              finish_reason: 'stop',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    },
  });

  const response = await client.complete(makeRequest());

  assert.equal(capturedUrl, 'https://openrouter.example/api/v1/chat/completions');
  assert.equal(response.type, 'action_plan');
  assert.equal(response.actionPlan.skillId, 'preflop_open');

  const headers = new Headers(capturedInit?.headers);
  assert.equal(headers.get('authorization'), 'Bearer or-key');
  assert.equal(headers.get('http-referer'), 'https://aipoker.dev');
  assert.equal(headers.get('x-title'), 'AiPoker');

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal(body.model, 'openai/gpt-5.4');
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.max_completion_tokens, 321);
  assert.equal(body.tool_choice, 'auto');
  assert.deepEqual(body.reasoning, { effort: 'none' });
  assert.deepEqual(body.provider, { require_parameters: true });
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.tools[0].type, 'function');
  assert.equal(body.tools[0].function.name, 'get_preflop_mix');
});

test('OpenRouter chat client omits reasoning config for non-reasoning-targeted model families', async () => {
  let capturedInit: RequestInit | undefined;

  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    maxCompletionTokens: 321,
    fetch: async (_input, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  skillId: 'preflop_open',
                  intent: 'fold',
                  confidence: 0.2,
                  reasoning: {
                    situation: 'x',
                    analysis: 'x',
                    decision: 'x',
                    alternativeConsidered: 'x',
                  },
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  });

  await client.complete(
    makeRequest({
      runtimeConfig: {
        model: 'claude',
        personaId: 'analyst',
      },
    }),
  );

  const body = JSON.parse(String(capturedInit?.body));
  assert.equal('reasoning' in body, false);
});

test('OpenRouter chat client parses assistant tool calls into internal tool_call responses', async () => {
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: 'chatcmpl-2',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'get_preflop_mix',
                      arguments: '{}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
  });

  const response = await client.complete(makeRequest());

  assert.deepEqual(response, {
    type: 'tool_call',
    toolCall: {
      id: 'call-1',
      toolName: 'get_preflop_mix',
      args: {},
    },
  });
});

test('OpenRouter chat client rejects action plans that are missing required fields', async () => {
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  skillId: 'preflop_open',
                  confidence: 0.4,
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });

  await assert.rejects(
    () => client.complete(makeRequest()),
    /invalid_action_plan_payload/,
  );
});

test('OpenRouter chat client rejects unknown tool call names instead of blindly casting them', async () => {
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    fetch: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: {
                      name: 'unknown_tool',
                      arguments: '{}',
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  });

  await assert.rejects(
    () => client.complete(makeRequest()),
    /invalid_tool_call_name/,
  );
});

function actionPlanResponse(extra: Record<string, unknown> = {}): Response {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              skillId: 'preflop_open',
              intent: 'fold',
              confidence: 0.5,
              reasoning: { situation: 's', analysis: 'a', decision: 'd', alternativeConsidered: 'x' },
            }),
          },
          finish_reason: 'stop',
        },
      ],
      ...extra,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

test('OpenRouter chat client forwards the abort signal to fetch', async () => {
  let capturedSignal: AbortSignal | null | undefined;
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    httpReferer: null,
    maxCompletionTokens: 100,
    fetch: async (_input, init) => {
      capturedSignal = init?.signal;
      return actionPlanResponse();
    },
  });

  const controller = new AbortController();
  await client.complete(makeRequest(), { signal: controller.signal });

  assert.equal(capturedSignal, controller.signal);
});

test('OpenRouter chat client reports the billed cost from usage', async () => {
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    httpReferer: null,
    maxCompletionTokens: 100,
    fetch: async () => actionPlanResponse({ usage: { prompt_tokens: 10, completion_tokens: 4, cost: 0.0042 } }),
  });

  const response = await client.complete(makeRequest());

  assert.equal(response.costUsd, 0.0042);
});

test('OpenRouter chat client refuses prompts above maxPromptTokens without calling the API', async () => {
  let fetchCalls = 0;
  const client = createOpenRouterChatClient({
    apiKey: 'or-key',
    baseUrl: 'https://openrouter.example/api/v1',
    appTitle: 'AiPoker',
    httpReferer: null,
    maxCompletionTokens: 100,
    maxPromptTokens: 50,
    fetch: async () => {
      fetchCalls += 1;
      return actionPlanResponse();
    },
  });

  await assert.rejects(
    client.complete(makeRequest({ messages: [{ role: 'user', content: 'x'.repeat(4_000) }] })),
    /prompt_too_large/,
  );
  assert.equal(fetchCalls, 0);
});
