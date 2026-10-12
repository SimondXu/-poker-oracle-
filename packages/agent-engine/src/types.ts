import type { AgentModel, AgentPersonaId, BotDecisionContext } from '@aipoker/shared';

export type AgentSkillId =
  | 'preflop_open'
  | 'preflop_iso'
  | 'preflop_vs_open'
  | 'preflop_vs_3bet'
  | 'short_stack_push_fold'
  | 'flop_cbet'
  | 'flop_defend'
  | 'flop_facing_bet'
  | 'turn_barrel'
  | 'turn_facing_bet'
  | 'river_value'
  | 'river_facing_bet'
  | 'river_bluff_catch'
  | 'pot_control';

export type AgentToolName =
  | 'get_preflop_mix'
  | 'get_pot_odds'
  | 'get_required_equity'
  | 'analyze_postflop'
  | 'get_opponent_profile'
  | 'get_recent_history'
  | 'get_training_analysis'
  | 'get_heuristic_baseline'
  | 'get_trace_slice';

export type ActionIntent = 'fold' | 'check' | 'call' | 'raise' | 'all_in';

export type ActionSizePreset =
  | 'open_2_2bb'
  | 'open_2_5bb'
  | 'open_3bb'
  | 'iso_4bb_plus_1'
  | 'three_bet_3x'
  | 'three_bet_4x'
  | 'jam'
  | 'bet_33'
  | 'bet_50'
  | 'bet_75'
  | 'bet_100'
  | 'raise_min'
  | 'raise_2_5x'
  | 'raise_3x';

export interface AgentSkillDefinition {
  id: AgentSkillId;
  label: string;
  description: string;
  priority: number;
  exclusive?: boolean;
  phases: BotDecisionContext['phase'][];
  allowedTools: AgentToolName[];
  allowedIntents: ActionIntent[];
  allowedSizePresets: ActionSizePreset[];
  outputSchema: Record<string, unknown>;
  isApplicable: (context: BotDecisionContext) => boolean;
  buildInstruction: (context: BotDecisionContext) => string;
}

export interface AgentActionPlan {
  skillId: AgentSkillId;
  intent: ActionIntent;
  sizePreset?: ActionSizePreset;
  confidence: number;
  reasoning: {
    situation: string;
    analysis: string;
    decision: string;
    alternativeConsidered: string;
  };
}

export type AgentDecision =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise_to'; amount: number }
  | { type: 'all_in' };

export interface AgentDecisionResult {
  skillId: AgentSkillId | null;
  action: AgentDecision;
  confidence: number;
}

export type AgentRunMode = 'realtime' | 'eval' | 'replay';

export type AgentToolMode = 'realtime_and_eval' | 'eval_only' | 'replay_only';

export interface AgentToolDefinition {
  name: AgentToolName;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AgentRuntimeConfig {
  model: AgentModel;
  personaId: AgentPersonaId;
}

export interface AgentToolExecutionContext {
  context: BotDecisionContext;
  runtimeConfig: AgentRuntimeConfig;
  mode: AgentRunMode;
  memoryPrompt: string;
}

export interface AgentToolSpec extends AgentToolDefinition {
  mode: AgentToolMode;
  execute: (args: Record<string, unknown>, context: AgentToolExecutionContext) => Promise<unknown>;
}

export interface SystemChatMessage {
  role: 'system';
  content: string;
}

export interface UserChatMessage {
  role: 'user';
  content: string;
}

export interface AssistantToolCallMessage {
  id: string;
  type: 'function';
  function: {
    name: AgentToolName;
    arguments: string;
  };
}

export interface AssistantChatMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: AssistantToolCallMessage[];
}

export interface ToolChatMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: AgentToolName;
}

export type ChatMessage =
  | SystemChatMessage
  | UserChatMessage
  | AssistantChatMessage
  | ToolChatMessage;

export interface JsonSchemaResponseFormat {
  type: 'json_schema';
  json_schema: {
    name: string;
    schema: Record<string, unknown>;
    strict: boolean;
  };
}

export interface SkillExecutionInput {
  skill: AgentSkillDefinition;
  context: BotDecisionContext;
  runtimeConfig: AgentRuntimeConfig;
  memoryPrompt: string;
  mode: AgentRunMode;
  tools: AgentToolDefinition[];
}

export interface SkillExecutionPrompt {
  messages: ChatMessage[];
  tools: AgentToolDefinition[];
  responseFormat: JsonSchemaResponseFormat;
}

export interface AgentLlmToolCall {
  id: string;
  toolName: AgentToolName;
  args: Record<string, unknown>;
}

export type AgentLlmResponse =
  | {
      type: 'action_plan';
      actionPlan: AgentActionPlan;
    }
  | {
      type: 'tool_call';
      toolCall: AgentLlmToolCall;
    };

export interface AgentLlmRequest {
  messages: ChatMessage[];
  tools: AgentToolDefinition[];
  responseFormat: JsonSchemaResponseFormat;
  runtimeConfig: AgentRuntimeConfig;
  mode: AgentRunMode;
}

export interface AgentLlmClient {
  complete: (request: AgentLlmRequest) => Promise<AgentLlmResponse>;
}

export type AgentTraceSpanName =
  | 'prompt_build'
  | 'skill_filter'
  | 'skill_selected'
  | 'llm_call'
  | 'tool_call'
  | 'action_resolution'
  | 'fallback';

export interface AgentRunTraceSpan {
  name: AgentTraceSpanName;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface AgentRunTrace {
  spans: AgentRunTraceSpan[];
}

export type AgentFallbackReason =
  | 'invalid_skill'
  | 'invalid_output'
  | 'tool_error'
  | 'tool_loop_exceeded'
  | 'llm_error'
  | 'no_candidate_skills';

export interface AgentRunResult {
  decision: AgentDecisionResult;
  trace: AgentRunTrace;
  fallbackReason?: AgentFallbackReason;
}

export type ResolveActionPlanResult =
  | { ok: true; value: AgentDecision }
  | {
      ok: false;
      error:
        | 'skill_mismatch'
        | 'invalid_intent'
        | 'missing_size_preset'
        | 'invalid_size_preset';
    };
