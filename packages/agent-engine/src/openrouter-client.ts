import type {
  AgentActionPlan,
  AgentLlmClient,
  AgentLlmRequest,
  AgentLlmResponse,
  AgentToolName,
  AgentToolDefinition,
  ChatMessage,
  JsonSchemaResponseFormat,
} from './types.ts';
import type { AgentModel } from '@aipoker/shared';

export interface OpenRouterChatClientOptions {
  apiKey: string;
  baseUrl: string;
  appTitle: string;
  httpReferer?: string | null;
  maxCompletionTokens: number;
  maxPromptTokens?: number;
  fetch?: typeof globalThis.fetch;
}

interface OpenRouterChatCompletionChoice {
  message?: {
    content?: string | null;
    tool_calls?: Array<{
      id?: string;
      type?: string;
      function?: {
        name?: string;
        arguments?: string;
      };
    }>;
  };
}

interface OpenRouterChatCompletionResponse {
  choices?: OpenRouterChatCompletionChoice[];
  usage?: {
    cost?: number;
  };
}

// Rough pre-flight size check (~4 characters per token) so oversized prompts are never billed.
function estimatePromptTokens(body: string): number {
  return Math.ceil(body.length / 4);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toOpenRouterMessages(messages: ChatMessage[]): unknown[] {
  return messages.map((message) => {
    if (message.role === 'assistant') {
      return {
        role: message.role,
        content: message.content,
        ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
      };
    }

    if (message.role === 'tool') {
      return {
        role: message.role,
        content: message.content,
        tool_call_id: message.tool_call_id,
        name: message.name,
      };
    }

    return {
      role: message.role,
      content: message.content,
    };
  });
}

function toOpenRouterTools(tools: AgentToolDefinition[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function parseActionPlan(content: string | null | undefined): AgentActionPlan {
  if (!content) {
    throw new Error('missing_action_plan_content');
  }

  const parsed = JSON.parse(content);
  if (!isObjectRecord(parsed)) {
    throw new Error('invalid_action_plan_payload');
  }
  if (
    typeof parsed.skillId !== 'string'
    || typeof parsed.intent !== 'string'
    || typeof parsed.confidence !== 'number'
    || !isObjectRecord(parsed.reasoning)
    || typeof parsed.reasoning.situation !== 'string'
    || typeof parsed.reasoning.analysis !== 'string'
    || typeof parsed.reasoning.decision !== 'string'
    || typeof parsed.reasoning.alternativeConsidered !== 'string'
  ) {
    throw new Error('invalid_action_plan_payload');
  }

  if (parsed.sizePreset !== undefined && typeof parsed.sizePreset !== 'string') {
    throw new Error('invalid_action_plan_payload');
  }

  return {
    skillId: parsed.skillId,
    intent: parsed.intent,
    ...(parsed.sizePreset ? { sizePreset: parsed.sizePreset } : {}),
    confidence: parsed.confidence,
    reasoning: {
      situation: parsed.reasoning.situation,
      analysis: parsed.reasoning.analysis,
      decision: parsed.reasoning.decision,
      alternativeConsidered: parsed.reasoning.alternativeConsidered,
    },
  } as AgentActionPlan;
}

function parseToolCall(
  choice: OpenRouterChatCompletionChoice,
  allowedToolNames: ReadonlySet<AgentToolName>,
): AgentLlmResponse | null {
  const toolCall = choice.message?.tool_calls?.[0];
  if (!toolCall || toolCall.type !== 'function' || !toolCall.function?.name || !toolCall.id) {
    return null;
  }
  if (!allowedToolNames.has(toolCall.function.name as AgentToolName)) {
    throw new Error('invalid_tool_call_name');
  }

  return {
    type: 'tool_call',
    toolCall: {
      id: toolCall.id,
      toolName: toolCall.function.name as AgentToolName,
      args: toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {},
    },
  };
}

function buildReasoningConfig(model: AgentModel): { effort: 'none' } | undefined {
  if (model === 'gpt' || model === 'grok' || model === 'minimax') {
    return { effort: 'none' };
  }

  return undefined;
}

function buildRequestBody(request: AgentLlmRequest, maxCompletionTokens: number) {
  const reasoning = buildReasoningConfig(request.runtimeConfig.model);
  return {
    model: resolveOpenRouterModelId(request.runtimeConfig.model),
    messages: toOpenRouterMessages(request.messages),
    ...(request.tools.length > 0 ? { tools: toOpenRouterTools(request.tools), tool_choice: 'auto', parallel_tool_calls: false } : {}),
    provider: { require_parameters: true },
    response_format: toOpenRouterResponseFormat(request.responseFormat),
    max_completion_tokens: maxCompletionTokens,
    ...(reasoning ? { reasoning } : {}),
  };
}

function toOpenRouterResponseFormat(responseFormat: JsonSchemaResponseFormat) {
  return {
    type: responseFormat.type,
    json_schema: responseFormat.json_schema,
  };
}

export function resolveOpenRouterModelId(model: AgentModel): string {
  switch (model) {
    case 'gpt':
      return 'openai/gpt-5.4';
    case 'claude':
      return 'anthropic/claude-sonnet-4.6';
    case 'gemini':
      return 'google/gemini-3-flash-preview';
    case 'grok':
      return 'x-ai/grok-4-fast';
    case 'minimax':
      return 'minimax/minimax-m2.5';
    default:
      return 'openai/gpt-5.4';
  }
}

export function createOpenRouterChatClient(options: OpenRouterChatClientOptions): AgentLlmClient {
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return {
    async complete(request, callOptions) {
      const allowedToolNames = new Set<AgentToolName>(request.tools.map((tool) => tool.name));
      const body = JSON.stringify(buildRequestBody(request, options.maxCompletionTokens));
      if (options.maxPromptTokens !== undefined && estimatePromptTokens(body) > options.maxPromptTokens) {
        throw new Error('prompt_too_large');
      }

      const response = await fetchImpl(`${options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
          ...(options.httpReferer ? { 'http-referer': options.httpReferer } : {}),
          'x-title': options.appTitle,
        },
        body,
        ...(callOptions?.signal ? { signal: callOptions.signal } : {}),
      });

      if (!response.ok) {
        throw new Error(`openrouter_http_${response.status}`);
      }

      const payload = (await response.json()) as OpenRouterChatCompletionResponse;
      const firstChoice = payload.choices?.[0];
      if (!firstChoice) {
        throw new Error('missing_openrouter_choice');
      }

      const cost = payload.usage?.cost;
      const usage = typeof cost === 'number' && Number.isFinite(cost) ? { costUsd: cost } : {};
      const toolCallResponse = parseToolCall(firstChoice, allowedToolNames);
      if (toolCallResponse) {
        return { ...toolCallResponse, ...usage };
      }

      return {
        type: 'action_plan',
        actionPlan: parseActionPlan(firstChoice.message?.content),
        ...usage,
      };
    },
  };
}
