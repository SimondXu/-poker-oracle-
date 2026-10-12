import assert from 'node:assert/strict';
import test from 'node:test';

import type { BotDecisionContext } from '@aipoker/shared';

import { getSkillDefinition } from './skill-registry.ts';
import { buildSkillExecutionPrompt } from './skill-executor.ts';
import { createDefaultAgentTools } from './agent-tools.ts';
import { createToolRuntime } from './tool-runtime.ts';
import { runAgentDecision } from './agent-runner.ts';
import type { AgentLlmClient, AgentLlmRequest, AgentLlmResponse, AgentRuntimeConfig } from './types.ts';

function makeContext(overrides: Partial<BotDecisionContext> = {}): BotDecisionContext {
  return {
    canFold: true,
    canCheck: false,
    canCall: true,
    callAmount: 100,
    canRaise: true,
    minRaiseTo: 200,
    maxRaiseTo: 2_000,
    canAllIn: true,
    phase: 'preflop',
    potTotal: 150,
    myStack: 1_900,
    myStreetCommitted: 0,
    currentBetToMatch: 100,
    lastFullRaiseSize: 100,
    bigBlind: 100,
    smallBlind: 50,
    preflopLimpersCount: 0,
    streetActionCount: 0,
    holeCards: ['Ah', 'Kh'],
    communityCards: [],
    activePlayerCount: 6,
    opponentCount: 5,
    position: 'btn',
    effectiveStack: 6_000,
    effectiveStackBb: 60,
    spr: 10,
    bettingState: 'unopened',
    isPreflopAggressor: false,
    isLastStreetAggressor: false,
    ...overrides,
  };
}

function makeRuntimeConfig(overrides: Partial<AgentRuntimeConfig> = {}): AgentRuntimeConfig {
  return {
    model: 'gpt',
    personaId: 'analyst',
    ...overrides,
  };
}

function createStaticClient(responses: AgentLlmResponse[]): AgentLlmClient {
  let index = 0;

  return {
    async complete() {
      const response = responses[index];
      index += 1;
      if (!response) {
        throw new Error('Unexpected extra LLM call');
      }

      return response;
    },
  };
}

function createCapturingClient(
  responses: AgentLlmResponse[],
  options: {
    delayMs?: number;
    requests?: AgentLlmRequest[];
  } = {},
): AgentLlmClient {
  let index = 0;

  return {
    async complete(request) {
      options.requests?.push(request);
      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }

      const response = responses[index];
      index += 1;
      if (!response) {
        throw new Error('Unexpected extra LLM call');
      }

      return response;
    },
  };
}

test('buildSkillExecutionPrompt includes persona, memory, context, skill instruction, and mode-filtered tools', () => {
  const toolRuntime = createToolRuntime({
    tools: createDefaultAgentTools(),
  });

  const prompt = buildSkillExecutionPrompt({
    skill: getSkillDefinition('preflop_open'),
    context: makeContext(),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: 'Big blind has over-folded to button opens in recent hands.',
    mode: 'eval',
    tools: toolRuntime.listTools({
      skill: getSkillDefinition('preflop_open'),
      mode: 'eval',
    }),
  });

  assert.equal(prompt.messages[0]?.role, 'system');
  assert.match(prompt.messages[0]?.content ?? '', /AiPoker agent/i);
  assert.match(prompt.messages[0]?.content ?? '', /analyst/i);
  assert.equal(prompt.messages[1]?.role, 'user');
  assert.match(prompt.messages[1]?.content ?? '', /over-folded/i);
  assert.equal(prompt.messages[2]?.role, 'user');
  assert.match(prompt.messages[2]?.content ?? '', /phase: preflop/i);
  assert.match(prompt.messages[2]?.content ?? '', /hole_cards: Ah Kh/i);
  assert.match(prompt.messages[2]?.content ?? '', /my_stack: 1900/i);
  assert.match(prompt.messages[2]?.content ?? '', /my_street_committed: 0/i);
  assert.equal(prompt.messages[3]?.role, 'user');
  assert.match(prompt.messages[3]?.content ?? '', /Preflop Open/i);
  assert.deepEqual(
    prompt.tools.map((tool) => tool.name),
    ['get_preflop_mix', 'get_opponent_profile'],
  );
  assert.equal(prompt.responseFormat.type, 'json_schema');
  assert.equal(prompt.messages.length, 4);
});

test('tool runtime filters tools by skill whitelist and execution mode', async () => {
  const toolRuntime = createToolRuntime({
    tools: createDefaultAgentTools(),
  });

  const preflopOpen = getSkillDefinition('preflop_open');
  const realtimeTools = toolRuntime.listTools({
    skill: preflopOpen,
    mode: 'realtime',
  });

  assert.deepEqual(
    realtimeTools.map((tool) => tool.name),
    ['get_preflop_mix', 'get_opponent_profile'],
  );

  await assert.rejects(
    toolRuntime.execute({
      toolName: 'get_training_analysis',
      args: {},
      skill: preflopOpen,
      mode: 'realtime',
      context: makeContext(),
      runtimeConfig: makeRuntimeConfig(),
    }),
    /not available/i,
  );

  assert.deepEqual(realtimeTools[0]?.inputSchema, {
    type: 'object',
    properties: {},
    additionalProperties: false,
  });
});

test('runAgentDecision resolves a legal action after one tool roundtrip and emits trace spans', async () => {
  const requests: AgentLlmRequest[] = [];
  const llmClient = createCapturingClient([
    {
      type: 'tool_call',
      toolCall: {
        id: 'tool-call-1',
        toolName: 'get_preflop_mix',
        args: {},
      },
    },
    {
      type: 'action_plan',
      actionPlan: {
        skillId: 'preflop_open',
        intent: 'raise',
        sizePreset: 'open_2_5bb',
        confidence: 0.87,
        reasoning: {
          situation: 'Button unopened preflop.',
          analysis: 'Strong broadway with positional advantage.',
          decision: 'Use standard open size.',
          alternativeConsidered: 'Checking is not legal and limping is dominated.',
        },
      },
    },
  ], {
    requests,
    delayMs: 10,
  });

  const result = await runAgentDecision({
    context: makeContext(),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: 'Small blind over-folds versus opens.',
    mode: 'eval',
    maxToolRounds: 1,
    llmClient,
    toolRuntime: createToolRuntime({
      tools: createDefaultAgentTools(),
    }),
  });

  assert.deepEqual(result.decision, {
    skillId: 'preflop_open',
    action: { type: 'raise_to', amount: 250 },
    confidence: 0.87,
  });
  assert.deepEqual(
    result.trace.spans.map((span) => span.name),
    ['skill_filter', 'skill_selected', 'prompt_build', 'llm_call', 'tool_call', 'llm_call', 'action_resolution'],
  );
  const llmSpans = result.trace.spans.filter((span) => span.name === 'llm_call');
  assert.ok(llmSpans.every((span) => typeof span.durationMs === 'number' && span.durationMs >= 0));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1]?.messages.at(-2), {
    role: 'assistant',
    content: null,
    tool_calls: [
      {
        id: 'tool-call-1',
        type: 'function',
        function: {
          name: 'get_preflop_mix',
          arguments: '{}',
        },
      },
    ],
  });
  assert.deepEqual(requests[1]?.messages.at(-1), {
    role: 'tool',
    tool_call_id: 'tool-call-1',
    name: 'get_preflop_mix',
    content: JSON.stringify({
      node: 'unopened',
      position: 'btn',
      effectiveStackBb: 60,
      baseline: 'open_wide',
    }),
  });
});

test('runAgentDecision falls back when the model selects a skill outside the candidate set', async () => {
  const llmClient = createStaticClient([
    {
      type: 'action_plan',
      actionPlan: {
        skillId: 'river_value',
        intent: 'raise',
        sizePreset: 'bet_75',
        confidence: 0.41,
        reasoning: {
          situation: 'Incorrect skill.',
          analysis: 'The model drifted out of the candidate set.',
          decision: 'Return an invalid response.',
          alternativeConsidered: 'None.',
        },
      },
    },
  ]);

  const result = await runAgentDecision({
    context: makeContext({
      canCheck: true,
      canCall: false,
      callAmount: 0,
      bettingState: 'unopened',
    }),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: '',
    mode: 'eval',
    maxToolRounds: 1,
    llmClient,
    toolRuntime: createToolRuntime({
      tools: createDefaultAgentTools(),
    }),
  });

  assert.deepEqual(result.decision.action, { type: 'check' });
  assert.equal(result.fallbackReason, 'invalid_skill');
  assert.ok(result.trace.spans.some((span) => span.name === 'fallback'));
});

test('runAgentDecision respects maxToolRounds from input instead of a hard-coded constant', async () => {
  const llmClient = createStaticClient([
    {
      type: 'tool_call',
      toolCall: {
        id: 'tool-call-2',
        toolName: 'get_preflop_mix',
        args: {},
      },
    },
  ]);

  const result = await runAgentDecision({
    context: makeContext(),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: '',
    mode: 'eval',
    maxToolRounds: 0,
    llmClient,
    toolRuntime: createToolRuntime({
      tools: createDefaultAgentTools(),
    }),
  });

  assert.equal(result.fallbackReason, 'tool_loop_exceeded');
});

test('runAgentDecision returns a null skillId when no candidate skill exists', async () => {
  const llmClient = createStaticClient([]);

  const result = await runAgentDecision({
    context: makeContext({
      phase: 'river',
      canFold: false,
      canCheck: false,
      canCall: false,
      canRaise: false,
      canAllIn: false,
      callAmount: 0,
      bettingState: 'unopened',
    }),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: '',
    mode: 'eval',
    maxToolRounds: 1,
    llmClient,
    toolRuntime: createToolRuntime({
      tools: createDefaultAgentTools(),
    }),
  });

  assert.equal(result.fallbackReason, 'no_candidate_skills');
  assert.equal(result.decision.skillId, null);
});

test('runAgentDecision falls back with llm_error when the client throws', async () => {
  const llmClient: AgentLlmClient = {
    async complete() {
      throw new Error('provider timeout');
    },
  };

  const result = await runAgentDecision({
    context: makeContext(),
    runtimeConfig: makeRuntimeConfig(),
    memoryPrompt: '',
    mode: 'eval',
    maxToolRounds: 1,
    llmClient,
    toolRuntime: createToolRuntime({
      tools: createDefaultAgentTools(),
    }),
  });

  assert.equal(result.fallbackReason, 'llm_error');
  assert.equal(result.decision.skillId, 'preflop_open');
  const llmSpan = result.trace.spans.find((span) => span.name === 'llm_call');
  assert.equal(llmSpan?.metadata?.error, 'llm_error');
  assert.ok(result.trace.spans.some((span) => span.name === 'fallback'));
});
