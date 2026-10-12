import { resolveActionPlan } from './action-resolver.ts';
import { buildSkillExecutionPrompt } from './skill-executor.ts';
import { getSkillDefinition } from './skill-registry.ts';
import { selectCandidateSkills } from './skill-selector.ts';
import { createTraceCollector } from './trace-collector.ts';
import type {
  AgentDecision,
  AgentFallbackReason,
  AgentLlmClient,
  AgentRunMode,
  AgentRunResult,
  AgentRuntimeConfig,
  ChatMessage,
} from './types.ts';
import type { BotDecisionContext } from '@aipoker/shared';
import type { AgentToolRuntime } from './tool-runtime.ts';

function buildFallbackAction(context: BotDecisionContext): AgentDecision {
  if (context.canCheck) {
    return { type: 'check' };
  }
  if (context.canFold) {
    return { type: 'fold' };
  }
  if (context.canCall) {
    return { type: 'call' };
  }

  return { type: 'all_in' };
}

export interface RunAgentDecisionInput {
  context: BotDecisionContext;
  runtimeConfig: AgentRuntimeConfig;
  memoryPrompt: string;
  mode: AgentRunMode;
  maxToolRounds: number;
  llmClient: AgentLlmClient;
  toolRuntime: AgentToolRuntime;
}

export async function runAgentDecision(input: RunAgentDecisionInput): Promise<AgentRunResult> {
  const traceCollector = createTraceCollector();
  const candidates = selectCandidateSkills(
    input.context,
    input.mode === 'realtime' ? { maxCandidates: 3 } : undefined,
  );

  traceCollector.record('skill_filter', {
    candidateSkillIds: candidates.map((candidate) => candidate.id),
  });

  const selectedSkill = candidates[0];
  if (!selectedSkill) {
    return buildFallbackResult(input.context, null, traceCollector, 'no_candidate_skills');
  }

  traceCollector.record('skill_selected', { skillId: selectedSkill.id });

  const tools = input.toolRuntime.listTools({
    skill: selectedSkill,
    mode: input.mode,
  });
  const prompt = buildSkillExecutionPrompt({
    skill: selectedSkill,
    context: input.context,
    runtimeConfig: input.runtimeConfig,
    memoryPrompt: input.memoryPrompt,
    mode: input.mode,
    tools,
  });

  traceCollector.record('prompt_build', {
    messageCount: prompt.messages.length,
    toolNames: tools.map((tool) => tool.name),
  });

  const messages: ChatMessage[] = [...prompt.messages];
  let toolRounds = 0;

  while (true) {
    const llmSpan = traceCollector.start('llm_call', { attempt: toolRounds + 1 });
    let response;
    try {
      response = await input.llmClient.complete({
        messages,
        tools: prompt.tools,
        responseFormat: prompt.responseFormat,
        runtimeConfig: input.runtimeConfig,
        mode: input.mode,
      });
      llmSpan.end();
    } catch {
      llmSpan.end({ error: 'llm_error' });
      return buildFallbackResult(input.context, selectedSkill.id, traceCollector, 'llm_error');
    }

    if (response.type === 'action_plan') {
      const isCandidateSkill = candidates.some((candidate) => candidate.id === response.actionPlan.skillId);
      if (!isCandidateSkill) {
        return buildFallbackResult(input.context, selectedSkill.id, traceCollector, 'invalid_skill');
      }

      const resolvedSkill = getSkillDefinition(response.actionPlan.skillId);
      const resolution = resolveActionPlan(input.context, resolvedSkill, response.actionPlan);
      if (!resolution.ok) {
        return buildFallbackResult(input.context, selectedSkill.id, traceCollector, 'invalid_output');
      }

      traceCollector.record('action_resolution', {
        skillId: response.actionPlan.skillId,
        actionType: resolution.value.type,
      });

      return {
        decision: {
          skillId: response.actionPlan.skillId,
          action: resolution.value,
          confidence: response.actionPlan.confidence,
        },
        trace: traceCollector.build(),
      };
    }

    if (toolRounds >= input.maxToolRounds) {
      return buildFallbackResult(input.context, selectedSkill.id, traceCollector, 'tool_loop_exceeded');
    }

    const toolSpan = traceCollector.start('tool_call', {
      toolName: response.toolCall.toolName,
    });
    let toolResult;
    try {
      toolResult = await input.toolRuntime.execute({
        toolName: response.toolCall.toolName,
        args: response.toolCall.args,
        skill: selectedSkill,
        mode: input.mode,
        context: input.context,
        runtimeConfig: input.runtimeConfig,
        memoryPrompt: input.memoryPrompt,
      });
      toolSpan.end();
    } catch {
      toolSpan.end({ error: 'tool_error' });
      return buildFallbackResult(input.context, selectedSkill.id, traceCollector, 'tool_error');
    }

    messages.push({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: response.toolCall.id,
          type: 'function',
          function: {
            name: response.toolCall.toolName,
            arguments: JSON.stringify(response.toolCall.args),
          },
        },
      ],
    });
    messages.push({
      role: 'tool',
      tool_call_id: response.toolCall.id,
      name: response.toolCall.toolName,
      content: JSON.stringify(toolResult),
    });

    toolRounds += 1;
  }
}

function buildFallbackResult(
  context: BotDecisionContext,
  skillId: ReturnType<typeof selectCandidateSkills>[number]['id'] | null,
  traceCollector: ReturnType<typeof createTraceCollector>,
  fallbackReason: AgentFallbackReason,
): AgentRunResult {
  traceCollector.record('fallback', { reason: fallbackReason });

  return {
    decision: {
      skillId,
      action: buildFallbackAction(context),
      confidence: 0,
    },
    fallbackReason,
    trace: traceCollector.build(),
  };
}
