import type {
  AgentRunMode,
  AgentToolDefinition,
  AgentToolExecutionContext,
  AgentToolName,
  AgentToolSpec,
  AgentSkillDefinition,
  AgentRuntimeConfig,
} from './types.ts';

function isToolAllowedInMode(toolMode: AgentToolSpec['mode'], runMode: AgentRunMode): boolean {
  if (toolMode === 'realtime_and_eval') {
    return runMode === 'realtime' || runMode === 'eval';
  }
  if (toolMode === 'eval_only') {
    return runMode === 'eval';
  }

  return runMode === 'replay';
}

export interface ToolRuntimeListInput {
  skill: AgentSkillDefinition;
  mode: AgentRunMode;
}

export interface ToolRuntimeExecuteInput extends AgentToolExecutionContext {
  toolName: AgentToolName;
  args: Record<string, unknown>;
  skill: AgentSkillDefinition;
}

export interface AgentToolRuntime {
  listTools: (input: ToolRuntimeListInput) => AgentToolDefinition[];
  execute: (input: ToolRuntimeExecuteInput) => Promise<unknown>;
}

export interface CreateToolRuntimeOptions {
  tools: AgentToolSpec[];
}

export function createToolRuntime(options: CreateToolRuntimeOptions): AgentToolRuntime {
  const toolMap = new Map<AgentToolName, AgentToolSpec>(options.tools.map((tool) => [tool.name, tool]));

  return {
    listTools({ skill, mode }) {
      const availableTools: AgentToolDefinition[] = [];

      for (const toolName of skill.allowedTools) {
        const tool = toolMap.get(toolName);
        if (!tool || !isToolAllowedInMode(tool.mode, mode)) {
          continue;
        }

        availableTools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }

      return availableTools;
    },
    async execute(input) {
      const resolvedTool = toolMap.get(input.toolName);
      if (!resolvedTool) {
        throw new Error(`Tool ${input.toolName} not available`);
      }
      if (
        !input.skill.allowedTools.includes(resolvedTool.name)
        || !isToolAllowedInMode(resolvedTool.mode, input.mode)
      ) {
        throw new Error(`Tool ${input.toolName} not available for mode ${input.mode}`);
      }

      return resolvedTool.execute(input.args, {
        context: input.context,
        runtimeConfig: input.runtimeConfig,
        mode: input.mode,
        memoryPrompt: input.memoryPrompt,
      });
    },
  };
}
