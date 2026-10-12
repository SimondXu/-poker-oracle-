import assert from 'node:assert/strict';
import test from 'node:test';

import type { AgentLlmClient } from '@aipoker/agent-engine';
import type { BotDecisionContext } from '@aipoker/shared';

import { buildRealtimeFallbackAction, createRealtimeLlmAgentRunner } from '../../../game-loop/llm-agent-runtime.ts';

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
    holeCards: ['Ah', 'As'],
    communityCards: [],
    activePlayerCount: 2,
    opponentCount: 1,
    position: 'btn',
    effectiveStack: 2_000,
    effectiveStackBb: 20,
    spr: 10,
    bettingState: 'unopened',
    isPreflopAggressor: false,
    isLastStreetAggressor: false,
    ...overrides,
  };
}

const llmBot = { kind: 'llm', model: 'gpt', personaId: 'analyst' } as const;

function foldingClient(costUsd: number, onCall: () => void): AgentLlmClient {
  return {
    complete: async (request) => {
      onCall();
      return {
        type: 'action_plan',
        actionPlan: {
          skillId: request.responseFormat.json_schema.name.replace(/_action_plan$/, '') as any,
          intent: 'fold',
          confidence: 0.5,
          reasoning: { situation: 's', analysis: 'a', decision: 'd', alternativeConsidered: 'x' },
        },
        costUsd,
      };
    },
  };
}

test('fallback plays the heuristic bot instead of folding a premium hand', () => {
  const action = buildRealtimeFallbackAction(makeContext(), () => 0.5);
  assert.notEqual(action.type, 'fold');
});

test('runner stops calling the model once a room has spent its budget', async () => {
  let calls = 0;
  const runner = createRealtimeLlmAgentRunner({
    enabled: true,
    maxCompletionTokens: 100,
    maxToolRoundsRealtime: 0,
    realtimeTimeoutMs: 1_000,
    roomCostLimitUsd: 1,
    llmClient: foldingClient(0.6, () => {
      calls += 1;
    }),
  });

  await runner.decide({ roomId: 'room-a', context: makeContext(), botConfig: llmBot });
  await runner.decide({ roomId: 'room-a', context: makeContext(), botConfig: llmBot });
  const capped = await runner.decide({ roomId: 'room-a', context: makeContext(), botConfig: llmBot });
  const otherRoom = await runner.decide({ roomId: 'room-b', context: makeContext(), botConfig: llmBot });

  assert.equal(calls, 3, 'room-a stops after 1.2 USD; room-b still gets its own call');
  assert.equal(capped.fallbackReason, 'budget_exceeded');
  assert.notEqual(capped.action.type, 'fold');
  assert.equal(otherRoom.fallbackReason, undefined);

  runner.releaseRoom('room-a');
  await runner.decide({ roomId: 'room-a', context: makeContext(), botConfig: llmBot });
  assert.equal(calls, 4, 'a deleted room starts a fresh budget');
});

test('runner forwards the abort signal to the model client', async () => {
  let receivedSignal: AbortSignal | undefined;
  const runner = createRealtimeLlmAgentRunner({
    enabled: true,
    maxCompletionTokens: 100,
    maxToolRoundsRealtime: 0,
    realtimeTimeoutMs: 1_000,
    roomCostLimitUsd: 1,
    llmClient: {
      complete: async (request, options) => {
        receivedSignal = options?.signal;
        return foldingClient(0, () => {}).complete(request);
      },
    },
  });

  const controller = new AbortController();
  await runner.decide({ roomId: 'room-a', context: makeContext(), botConfig: llmBot, signal: controller.signal });
  assert.equal(receivedSignal, controller.signal);
});
