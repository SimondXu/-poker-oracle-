import {
  createDefaultAgentTools,
  createOpenRouterChatClient,
  createToolRuntime,
  runAgentDecision,
  type AgentDecision,
  type AgentFallbackReason,
  type AgentLlmClient,
} from '@aipoker/agent-engine';
import { chooseBotAction } from '@aipoker/strategy-engine';
import type { BotConfig, BotDecisionContext } from '@aipoker/shared';

export interface RealtimeLlmAgentOptions {
  enabled: boolean;
  apiKey?: string | null;
  baseUrl?: string;
  httpReferer?: string | null;
  appTitle?: string;
  maxCompletionTokens: number;
  maxPromptTokens?: number;
  maxToolRoundsRealtime: number;
  realtimeTimeoutMs: number;
  roomCostLimitUsd: number;
  rng?: () => number;
  fetch?: typeof globalThis.fetch;
  llmClient?: AgentLlmClient;
}

export type RealtimeFallbackReason = AgentFallbackReason | 'budget_exceeded';

export interface RealtimeLlmDecisionResult {
  action: AgentDecision;
  fallbackReason?: RealtimeFallbackReason;
}

export interface RealtimeLlmAgentRunner {
  enabled: boolean;
  realtimeTimeoutMs: number;
  decide: (input: {
    roomId: string;
    context: BotDecisionContext;
    botConfig: Extract<BotConfig, { kind: 'llm' }>;
    signal?: AbortSignal;
  }) => Promise<RealtimeLlmDecisionResult>;
  // Forget a deleted room's spend so the ledger does not grow forever.
  releaseRoom: (roomId: string) => void;
}

// When the model is unavailable the seat keeps playing as a TAG heuristic bot rather than check/folding.
export function buildRealtimeFallbackAction(
  context: BotDecisionContext,
  rng: () => number = Math.random,
): AgentDecision {
  const action = chooseBotAction(context, 'tag', rng);
  switch (action.type) {
    case 'raise_to':
      return { type: 'raise_to', amount: action.amount };
    case 'call':
      return { type: 'call' };
    case 'all_in':
      return { type: 'all_in' };
    case 'check':
      return { type: 'check' };
    default:
      return { type: 'fold' };
  }
}

export function createRealtimeLlmAgentRunner(
  options: RealtimeLlmAgentOptions,
): RealtimeLlmAgentRunner {
  const toolRuntime = createToolRuntime({ tools: createDefaultAgentTools() });
  const rng = options.rng ?? Math.random;
  const spentUsdByRoom = new Map<string, number>();
  const llmClient =
    options.llmClient
    ?? (
      options.enabled && options.apiKey
        ? createOpenRouterChatClient({
            apiKey: options.apiKey,
            baseUrl: options.baseUrl ?? 'https://openrouter.ai/api/v1',
            httpReferer: options.httpReferer ?? null,
            appTitle: options.appTitle ?? 'AiPoker',
            maxCompletionTokens: options.maxCompletionTokens,
            ...(options.maxPromptTokens !== undefined ? { maxPromptTokens: options.maxPromptTokens } : {}),
            ...(options.fetch ? { fetch: options.fetch } : {}),
          })
        : null
    );

  return {
    enabled: options.enabled && llmClient !== null,
    realtimeTimeoutMs: options.realtimeTimeoutMs,
    async decide(input) {
      if (!llmClient) {
        return {
          action: buildRealtimeFallbackAction(input.context, rng),
          fallbackReason: 'llm_error',
        };
      }

      if ((spentUsdByRoom.get(input.roomId) ?? 0) >= options.roomCostLimitUsd) {
        return {
          action: buildRealtimeFallbackAction(input.context, rng),
          fallbackReason: 'budget_exceeded',
        };
      }

      // Record spend per call so a turn that later times out or errors is still charged to the room.
      const meteredClient: AgentLlmClient = {
        async complete(request, callOptions) {
          const response = await llmClient.complete(request, callOptions);
          spentUsdByRoom.set(input.roomId, (spentUsdByRoom.get(input.roomId) ?? 0) + (response.costUsd ?? 0));
          return response;
        },
      };

      const result = await runAgentDecision({
        context: input.context,
        runtimeConfig: {
          model: input.botConfig.model,
          personaId: input.botConfig.personaId,
        },
        memoryPrompt: '',
        mode: 'realtime',
        maxToolRounds: options.maxToolRoundsRealtime,
        llmClient: meteredClient,
        toolRuntime,
        ...(input.signal ? { signal: input.signal } : {}),
      });

      if (result.fallbackReason) {
        return {
          action: buildRealtimeFallbackAction(input.context, rng),
          fallbackReason: result.fallbackReason,
        };
      }

      return {
        action: result.decision.action,
      };
    },
    releaseRoom(roomId) {
      spentUsdByRoom.delete(roomId);
    },
  };
}
